/**
 * Per-user rate limiting for the routes that cost something real per call.
 *
 * The counter lives in Postgres (supabase/rate_limits.sql) rather than in
 * memory: serverless instances come and go, and two of them serving the same
 * user would each keep their own count. One atomic RPC also closes the
 * read-then-write gap two concurrent requests would otherwise slip through.
 */
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";

/** What's being limited. One key per protected action, one row per user. */
export type LimitedAction =
  | "hosting.start" // creates a Fly Machine — billable, and Fly rate-limits us
  | "hosting.secret" // encrypt + write; cheap, but no reason to allow a flood
  | "checkout" // creates a Stripe Checkout session
  | "billing.portal" // creates a Stripe billing-portal session
  | "account.export" // one RPC per project, and Pro has no project cap
  | "project.duplicate"; // copies up to 200 files of up to 100k chars each, and Pro/Max have no project cap to stop it repeating

const HOUR = 3600;

/**
 * Deliberately generous: these are anti-abuse ceilings, not usage quotas (the
 * plan caps are elsewhere). A real person restarting a misbehaving bot over and
 * over should never see one of these; a script should hit it within seconds.
 */
const LIMITS: Record<LimitedAction, { max: number; windowSeconds: number }> = {
  "hosting.start": { max: 20, windowSeconds: HOUR },
  "hosting.secret": { max: 30, windowSeconds: HOUR },
  checkout: { max: 10, windowSeconds: HOUR },
  "billing.portal": { max: 10, windowSeconds: HOUR },
  "account.export": { max: 5, windowSeconds: HOUR },
  "project.duplicate": { max: 20, windowSeconds: HOUR },
};

/**
 * Record an attempt. `false` means refused — answer 429 and do nothing else.
 *
 * Fails OPEN when the counter itself is unavailable (migration not run, a
 * Postgres blip): a broken limiter must not take Start or checkout down. That
 * is a real trade — it's the same call ai_usage makes — so every occurrence
 * goes to Sentry, because "unlimited machine creation" is not a state to sit in
 * quietly.
 */
export async function allowAction(userId: string, action: LimitedAction): Promise<boolean> {
  const { max, windowSeconds } = LIMITS[action];
  try {
    const { data, error } = await createAdminClient().rpc("consume_rate_limit", {
      p_user_id: userId,
      p_action: action,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    return Number(data) >= 0;
  } catch (e) {
    Sentry.captureMessage("Rate limiter unavailable — request allowed unchecked", {
      level: "error",
      extra: { action, message: (e as Error).message },
    });
    return true;
  }
}

/** The message a refused caller sees. Says what to do, not just "no". */
export function rateLimitMessage(action: LimitedAction): string {
  switch (action) {
    case "hosting.start":
      return "You've started bots too many times in the last hour. Wait a few minutes and try again — if a bot keeps crashing, fix the error in the logs first.";
    case "account.export":
      return "You've requested an export several times in the last hour. Please wait a while before the next one.";
    default:
      return "Too many attempts in the last hour. Please wait a few minutes and try again.";
  }
}
