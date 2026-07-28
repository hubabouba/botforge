"use client";

import { useEffect, useState } from "react";
import type { PostHog } from "posthog-js";
import { setAnalyticsClient } from "@/lib/analytics";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

/** Run once the browser is idle, or shortly after — Safari has no rIC. */
function whenIdle(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback;
  if (ric) {
    const handle = ric(fn, { timeout: 3000 });
    return () => (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(handle);
  }
  const timer = setTimeout(fn, 1200);
  return () => clearTimeout(timer);
}

/**
 * Analytics, loaded off the critical path.
 *
 * This provider sits in the root layout, so whatever it imports lands in the
 * first-load bundle of every page — posthog-js and, through the identify step,
 * the Supabase browser client too. That's a real cost on the one page that
 * matters most: a phone arriving cold from an ad, on a mobile connection.
 *
 * So both are dynamic imports fired on the first idle frame. The pageview is
 * captured manually right after init, so deferring costs the timing precision
 * of the first second or two, not the visit itself.
 *
 * With no key configured (local dev) this stays a no-op passthrough.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<PostHog | null>(null);

  useEffect(() => {
    if (!KEY) return; // analytics disabled until a key is provided
    let cancelled = false;

    const cancelIdle = whenIdle(() => {
      void (async () => {
        const posthog = (await import("posthog-js")).default;
        if (cancelled) return;
        posthog.init(KEY, {
          // First-party proxy (next.config.ts rewrites): tracker blockers block
          // *.posthog.com by domain — same-origin /ingest gets through. ui_host
          // keeps toolbar/app links pointing at the real PostHog UI.
          api_host: "/ingest",
          ui_host: HOST.replace(".i.posthog.com", ".posthog.com"),
          person_profiles: "identified_only",
          // Unchanged from before the deferral: PostHog captures the pageview
          // when init runs, so moving init to idle moves the event's timestamp
          // by a beat — it doesn't lose it. Left as-is deliberately rather than
          // switching to a manual capture, which would risk double-counting or
          // dropping client-side navigations.
          capture_pageview: true,
        });
        setClient(posthog);
        setAnalyticsClient(posthog);
      })();
    });

    return () => {
      cancelled = true;
      cancelIdle();
      setAnalyticsClient(null);
    };
  }, []);

  // Tie captured events to a stable person once PostHog is live. Without this
  // the funnel (signup_started → … → checkout_completed) can't be followed per
  // user, and `person_profiles: "identified_only"` never creates a profile.
  // Deliberately after `client` exists: this is what pulls in the Supabase
  // browser client, and a signed-out visitor to the landing page shouldn't pay
  // for it before anything is on screen.
  useEffect(() => {
    if (!client) return;
    let alive = true;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      if (!alive) return;
      const supabase = createClient();

      supabase.auth.getUser().then(({ data }) => {
        if (alive && data.user) client.identify(data.user.id, { email: data.user.email });
      });

      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          client.identify(session.user.id, { email: session.user.email });
        } else if (event === "SIGNED_OUT") {
          client.reset();
        }
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    })();

    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [client]);

  // No React context provider: nothing in the app uses posthog-js hooks — every
  // call site goes through `track()` in lib/analytics.ts, which reaches the
  // singleton directly. Wrapping the tree would mean importing posthog-js/react
  // eagerly, which is the very thing this file exists to avoid.
  return <>{children}</>;
}
