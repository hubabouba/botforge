"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect, useState } from "react";

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

  if (!KEY || !ready) return <>{children}</>;
  return <PHProvider client={posthog}>{children}</PHProvider>;
}
