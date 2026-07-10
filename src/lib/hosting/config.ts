/**
 * Bot-hosting feature flags (server-side).
 *
 * The whole "Real Run" feature ships dark behind `HOSTING_ENABLED`, the same
 * ship-it-off-then-turn-it-on philosophy already used for Stripe/Sentry/PostHog.
 * With the flag unset the control-plane routes 503 and no UI surfaces a run
 * control — so incomplete hosting work can merge and deploy safely.
 */
import { hostingSecretsConfigured } from "./secrets";

/** Master kill-switch for bot hosting. Everything is inert until this is true. */
export function hostingEnabled(): boolean {
  return process.env.HOSTING_ENABLED === "true";
}

/**
 * Hosting is actually operable only when it's switched on AND its secret-
 * encryption key is configured (otherwise tokens couldn't be stored safely).
 * Routes use this as their top-level guard.
 */
export function hostingOperational(): boolean {
  return hostingEnabled() && hostingSecretsConfigured();
}
