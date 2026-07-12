"use client";

/**
 * Thin, typed wrapper over PostHog's `capture`. Analytics must never break the
 * product, so every call is guarded: if PostHog isn't initialised (no key
 * configured, or not yet mounted) it's a silent no-op. The event names are a
 * closed union so the funnel stays consistent and greppable — add here, not ad hoc.
 */
import posthog from "posthog-js";

export type AnalyticsEvent =
  | "project_created" // a new bot project was created (template or wizard)
  | "ai_message_sent" // user sent a message to the in-editor assistant
  | "hosting_started" // user started a bot on Botforge hosting
  | "upgrade_clicked" // user clicked checkout in the upgrade modal
  | "checkout_completed"; // returned from Stripe with a successful checkout

export function track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  try {
    // __loaded is set once posthog.init has run (see PostHogProvider).
    if (typeof window !== "undefined" && (posthog as unknown as { __loaded?: boolean }).__loaded) {
      posthog.capture(event, props);
    }
  } catch {
    /* analytics is best-effort — never surface a failure to the user */
  }
}
