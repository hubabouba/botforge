/**
 * Plan → AI provider routing.
 *
 * Free plan uses Gemini (free tier); paid plans use Claude. Until Stripe is
 * wired up there is no per-user plan record, so everyone defaults to "free"
 * (Gemini) — which also lets the owner test the assistant for free. Two env
 * escape hatches:
 *   - BOTFORGE_PRO_EMAILS: comma-separated emails treated as "pro" (→ Claude)
 *   - AI_FORCE_PROVIDER: "gemini" | "claude" to override routing entirely
 */

export type Plan = "free" | "basic" | "pro";
export type Provider = "gemini" | "claude";

export function getPlan(email?: string | null): Plan {
  const pros = (process.env.BOTFORGE_PRO_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (email && pros.includes(email.toLowerCase())) return "pro";
  return "free";
}

export function providerForPlan(plan: Plan): Provider {
  const forced = process.env.AI_FORCE_PROVIDER;
  if (forced === "gemini" || forced === "claude") return forced;
  return plan === "free" ? "gemini" : "claude";
}
