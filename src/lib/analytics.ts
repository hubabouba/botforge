"use client";

/**
 * Thin, typed wrapper over PostHog's `capture`. Analytics must never break the
 * product, so every call is guarded: until PostHog has loaded (no key
 * configured, or the deferred init hasn't run yet) it's a silent no-op. The
 * event names are a closed union so the funnel stays consistent and greppable —
 * add here, not ad hoc.
 *
 * The reference is handed in by PostHogProvider rather than imported. A static
 * `import posthog from "posthog-js"` here would pull the whole library into the
 * bundle of every page that fires a single event — /login and /signup among
 * them — which is exactly what the provider's dynamic import exists to avoid.
 * `import type` is erased at build, so this module costs nothing at runtime.
 */
import type { PostHog } from "posthog-js";

export type AnalyticsEvent =
  | "signup_started" // user began sign-up (email magic link requested, or OAuth redirect)
  | "project_created" // a new bot project was created (template or wizard)
  | "ai_message_sent" // user sent a message to the in-editor assistant
  | "hosting_started" // user started a bot on Botforge hosting
  | "upgrade_clicked" // user clicked checkout in the upgrade modal
  | "checkout_completed" // returned from Stripe with a successful checkout
  | "precreate_survey_shown" // free user saw the pre-create survey
  | "precreate_survey_submitted"; // ...and answered it (skipping doesn't fire this)

let client: PostHog | null = null;

/** Called once by PostHogProvider after its deferred init resolves. */
export function setAnalyticsClient(instance: PostHog | null): void {
  client = instance;
}

export function track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  try {
    client?.capture(event, props);
  } catch {
    /* analytics is best-effort — never surface a failure to the user */
  }
}
