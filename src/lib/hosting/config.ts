/**
 * Bot-hosting feature flags (server-side).
 *
 * The whole "Real Run" feature ships dark behind `HOSTING_ENABLED`, the same
 * ship-it-off-then-turn-it-on philosophy already used for Stripe/Sentry/PostHog.
 * With the flag unset the control-plane routes 503 and no UI surfaces a run
 * control — so incomplete hosting work can merge and deploy safely.
 */
import { planAllows, type Plan } from "../plan";
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

/**
 * The real access gate: hosting must be operational AND the account's plan
 * must unlock `hosting.run` (Basic+). Callers resolve the effective plan first
 * — `await getUserPlan(...)` then `effectiveHostingPlan(plan, email)` — and
 * pass the result here; this stays a pure sync check so it's trivial to test.
 */
export function hostingAccessAllowed(plan: Plan): boolean {
  return hostingOperational() && planAllows(plan, "hosting.run");
}

/**
 * Platform-wide cap on simultaneously active Machines, independent of any
 * per-user plan limit — a blunt cost/abuse ceiling enforced atomically inside
 * begin_project_run. HOSTING_GLOBAL_MACHINE_CEILING; unset/invalid falls back
 * to a deliberately conservative default rather than to "unlimited".
 */
export function globalMachineCeiling(): number {
  const raw = Number(process.env.HOSTING_GLOBAL_MACHINE_CEILING);
  return Number.isInteger(raw) && raw >= -1 ? raw : 20;
}
