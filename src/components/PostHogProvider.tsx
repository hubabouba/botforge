"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

/**
 * Wraps the app with PostHog analytics. If no key is configured (local dev
 * without PostHog set up), it becomes a no-op passthrough instead of crashing.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!KEY) return; // analytics disabled until a key is provided
    posthog.init(KEY, {
      // First-party proxy (next.config.ts rewrites): tracker blockers block
      // *.posthog.com by domain — same-origin /ingest gets through. ui_host
      // keeps toolbar/app links pointing at the real PostHog UI.
      api_host: "/ingest",
      ui_host: HOST.replace(".i.posthog.com", ".posthog.com"),
      person_profiles: "identified_only",
      capture_pageview: true,
    });
    setReady(true);
  }, []);

  // Tie captured events to a stable person once PostHog is live. Without this,
  // the funnel (signup_started → … → checkout_completed) can't be followed per
  // user, and `person_profiles: "identified_only"` never creates a profile.
  useEffect(() => {
    if (!ready) return;
    const supabase = createClient();
    let alive = true;

    supabase.auth.getUser().then(({ data }) => {
      if (alive && data.user) posthog.identify(data.user.id, { email: data.user.email });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        posthog.identify(session.user.id, { email: session.user.email });
      } else if (event === "SIGNED_OUT") {
        posthog.reset();
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [ready]);

  if (!KEY || !ready) return <>{children}</>;
  return <PHProvider client={posthog}>{children}</PHProvider>;
}
