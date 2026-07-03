/**
 * Plans, capabilities, and AI-provider routing.
 *
 * Three tiers: free → Gemini (deliberately limited), basic & pro → Claude.
 * Higher tiers unlock capabilities (panels, deeper assistant powers). Until
 * Stripe + a subscription store exist, a user's plan is derived from env
 * allow-lists so the owner can test each tier:
 *   - BOTFORGE_PRO_EMAILS   / BOTFORGE_BASIC_EMAILS: comma-separated emails
 *   - AI_FORCE_PROVIDER: "gemini" | "claude" to override provider routing
 */

export type Plan = "free" | "basic" | "pro";
export type Provider = "gemini" | "claude";

export const PLAN_RANK: Record<Plan, number> = { free: 0, basic: 1, pro: 2 };

/** Gated features. Each maps to the minimum plan that unlocks it. */
export type Capability =
  | "assistant.claude" // smarter model (Claude) instead of the limited free assistant
  | "assistant.logs" // the assistant may read & analyze bot logs (quiet Pro gate)
  | "panel.logs" // the Logs panel
  | "panel.planning" // the AI Planning panel
  | "panel.metrics"; // the Metrics panel

export const CAPABILITY_MIN_PLAN: Record<Capability, Plan> = {
  "assistant.claude": "basic",
  "panel.logs": "basic",
  "panel.planning": "basic",
  "panel.metrics": "pro",
  "assistant.logs": "pro",
};

export interface PlanMeta {
  id: Plan;
  name: string;
  /** Monthly price in USD; 0 for free. Change freely — copy reads from here. */
  price: number;
  tagline: string;
  highlights: string[];
}

export const PLANS: PlanMeta[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    tagline: "Try it out and ship a simple bot.",
    highlights: ["Basic AI assistant (Gemini)", "Unlimited projects", "Download & run locally"],
  },
  {
    id: "basic",
    name: "Basic",
    price: 9,
    tagline: "A serious assistant for real bots.",
    highlights: ["Smart assistant (Claude)", "Logs & AI planning panels", "Priority responses"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 19,
    tagline: "Everything, including insight into your bot.",
    highlights: ["Everything in Basic", "Metrics panel", "Assistant inspects your logs"],
  },
];

export function planMeta(plan: Plan): PlanMeta {
  return PLANS.find((p) => p.id === plan) ?? PLANS[0];
}

export function getPlan(email?: string | null): Plan {
  const list = (name: string) =>
    (process.env[name] ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  const e = email?.toLowerCase();
  if (e && list("BOTFORGE_PRO_EMAILS").includes(e)) return "pro";
  if (e && list("BOTFORGE_BASIC_EMAILS").includes(e)) return "basic";
  return "free";
}

/** Does this plan unlock the capability? */
export function planAllows(plan: Plan, cap: Capability): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[CAPABILITY_MIN_PLAN[cap]];
}

/** The smallest plan that unlocks the capability (for "upgrade to X" copy). */
export function requiredPlan(cap: Capability): Plan {
  return CAPABILITY_MIN_PLAN[cap];
}

export function providerForPlan(plan: Plan): Provider {
  const forced = process.env.AI_FORCE_PROVIDER;
  if (forced === "gemini" || forced === "claude") return forced;
  return planAllows(plan, "assistant.claude") ? "claude" : "gemini";
}
