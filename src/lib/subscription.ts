/**
 * Resolves a user's effective plan.
 *
 * Order of precedence:
 *   1. Env allow-lists (BOTFORGE_PRO_EMAILS / BASIC) — lets the owner test tiers.
 *   2. The `subscriptions` table (written by the Stripe webhook).
 *   3. Free.
 *
 * Reads the user's own row via RLS with the normal server client, so no
 * service-role key is needed on the read path.
 */
import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { getPlan, type Plan } from "./plan";

export async function getUserPlan(supabase: SupabaseClient, user: User): Promise<Plan> {
  // 1. Owner/test overrides win.
  const envPlan = getPlan(user.email);
  if (envPlan !== "free") return envPlan;

  // 2. Subscription record from Stripe.
  try {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("plan, status, current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;

    if (!data) return "free";

    const active = data.status === "active" || data.status === "trialing";
    const notExpired =
      !data.current_period_end || new Date(data.current_period_end as string).getTime() > Date.now();

    if (active && notExpired && (data.plan === "basic" || data.plan === "pro")) {
      return data.plan as Plan;
    }
  } catch (e) {
    // "Undefined table" (migration not run yet) is expected pre-launch and not
    // worth alerting on. Anything else silently downgrades a possibly-paying
    // user to free, so it's worth knowing about.
    const code = (e as { code?: string } | null)?.code;
    if (code !== "42P01" && code !== "PGRST205") {
      Sentry.captureException(e);
    }
  }

  return "free";
}
