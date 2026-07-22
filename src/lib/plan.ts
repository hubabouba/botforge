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

/** Max number of projects per plan (Infinity = unlimited). */
export const PROJECT_LIMIT: Record<Plan, number> = { free: 2, basic: 15, pro: Infinity };

export function projectLimit(plan: Plan): number {
  return PROJECT_LIMIT[plan];
}

/** Daily AI-assistant message cap per plan (enforced in /api/ai/chat). */
export const AI_DAILY_MESSAGES: Record<Plan, number> = { free: 3, basic: 10, pro: 40 };

export function aiDailyLimit(plan: Plan): number {
  return AI_DAILY_MESSAGES[plan];
}

/** Parses a comma-separated email list from an env var (server-side only). */
function envEmailList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Emails exempt from the daily AI cap (owner/testing) — BOTFORGE_UNLIMITED_AI_EMAILS. */
export function isAiLimitExempt(email?: string | null): boolean {
  const e = email?.toLowerCase();
  return !!e && envEmailList("BOTFORGE_UNLIMITED_AI_EMAILS").includes(e);
}

/**
 * Emails that get Basic-tier hosting limits even on a free plan —
 * HOSTING_BETA_EMAILS. Originally Stage 1's whole access gate; now that access
 * is a real plan check (`hosting.run`), this survives as a narrower override so
 * an account being used to test hosting (e.g. the owner's own) doesn't need a
 * real Stripe subscription to get Basic's numbers instead of free's zero.
 */
export function isHostingBetaEmail(email?: string | null): boolean {
  const e = email?.toLowerCase();
  return !!e && envEmailList("HOSTING_BETA_EMAILS").includes(e);
}

/** The next plan up that raises the project limit (for upgrade prompts). */
export function nextPlanUp(plan: Plan): Plan {
  return plan === "free" ? "basic" : "pro";
}

/** Gated features. Each maps to the minimum plan that unlocks it. */
export type Capability =
  | "assistant.claude" // smarter model (Claude) instead of the limited free assistant
  | "assistant.logs" // the assistant may read & analyze bot logs (quiet Pro gate)
  | "panel.logs" // the Logs panel
  | "panel.planning" // the AI Planning panel
  | "panel.metrics" // the Metrics panel
  | "hosting.run"; // run a bot on Botforge hosting (Real Run) + manage its secrets

export const CAPABILITY_MIN_PLAN: Record<Capability, Plan> = {
  "assistant.claude": "basic",
  "panel.logs": "basic",
  "panel.planning": "basic",
  "panel.metrics": "pro",
  "assistant.logs": "pro",
  // OPEN DECISION (revisit before Stage 2): Basic+Pro vs Pro-only. Defaulting to
  // "basic" because the Logs panel already promises Basic users "hosted runs are
  // on the way" — leaving that unfulfilled for a paying tier would be odd.
  "hosting.run": "basic",
};

// ---- Bot hosting limits (Real Run) -----------------------------------------
// Same shape as PROJECT_LIMIT / AI_DAILY_MESSAGES: the numbers here are the
// single source of truth, passed to Postgres (begin_project_run) as params.
// Illustrative starting values — confirm against Fly's live pricing calculator
// before Stage 2 turns real plan-gating on.

/** Max bots a plan may have running at once (0 = hosting not available). */
export const HOSTING_CONCURRENT_RUNS: Record<Plan, number> = { free: 0, basic: 1, pro: 3 };

export function hostingConcurrentLimit(plan: Plan): number {
  return HOSTING_CONCURRENT_RUNS[plan];
}

/** Monthly bot-runtime budget per plan, in hours (Infinity = unlimited). */
export const HOSTING_MONTHLY_RUNTIME_HOURS: Record<Plan, number> = { free: 0, basic: 100, pro: 400 };

/** The monthly runtime budget in seconds for begin_project_run (-1 = unlimited). */
export function hostingRuntimeBudgetSeconds(plan: Plan): number {
  const hours = HOSTING_MONTHLY_RUNTIME_HOURS[plan];
  return Number.isFinite(hours) ? Math.round(hours * 3600) : -1;
}

/**
 * Applies the HOSTING_BETA_EMAILS override on top of a resolved plan: a free
 * account being used to test hosting is treated as Basic, so it isn't zeroed
 * out by `HOSTING_CONCURRENT_RUNS.free = 0`. Callers resolve the REAL plan
 * first (env allow-list or the Stripe-backed `subscriptions` table via
 * `getUserPlan`) and pass it here — this only ever promotes free, never
 * demotes a real Basic/Pro subscription.
 */
export function effectiveHostingPlan(plan: Plan, email?: string | null): Plan {
  return plan === "free" && isHostingBetaEmail(email) ? "basic" : plan;
}

/**
 * The hosting limits for an (already-resolved, already-bumped) plan — the
 * single source of truth for both the start route and budget enforcement in
 * reconcile, so the two can never disagree.
 */
export function hostingLimitsFor(plan: Plan): { concurrent: number; budgetSeconds: number } {
  return {
    concurrent: hostingConcurrentLimit(plan),
    budgetSeconds: hostingRuntimeBudgetSeconds(plan),
  };
}

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
    highlights: ["Basic AI assistant (Gemini)", "3 assistant messages/day", "2 projects", "Download & run locally"],
  },
  {
    id: "basic",
    name: "Basic",
    price: 9,
    tagline: "A serious assistant for real bots.",
    highlights: ["Smart assistant (Claude)", "10 assistant messages/day", "Logs & AI planning panels", "15 projects"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 19,
    tagline: "Everything, including insight into your bot.",
    highlights: ["Everything in Basic", "40 assistant messages/day", "Metrics panel", "Assistant inspects your logs"],
  },
];

export function planMeta(plan: Plan): PlanMeta {
  return PLANS.find((p) => p.id === plan) ?? PLANS[0];
}

export function getPlan(email?: string | null): Plan {
  const e = email?.toLowerCase();
  if (e && envEmailList("BOTFORGE_PRO_EMAILS").includes(e)) return "pro";
  if (e && envEmailList("BOTFORGE_BASIC_EMAILS").includes(e)) return "basic";
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

/**
 * Which providers a plan is allowed to pick. Free is locked to Gemini; paid
 * tiers may choose either the fast free model or Claude. Pure (no env) so the
 * client can use it to build the model selector. `resolveProvider` below is the
 * server-side enforcement — never trust the client to unlock Claude.
 */
export function providersForPlan(plan: Plan): Provider[] {
  return planAllows(plan, "assistant.claude") ? ["gemini", "claude"] : ["gemini"];
}

/**
 * The provider to actually use for a request: honor the user's explicit choice
 * only if their plan allows it, else fall back to the plan default. AI_FORCE_
 * PROVIDER still overrides everything (local testing).
 */
export function resolveProvider(plan: Plan, requested?: Provider | null): Provider {
  const forced = process.env.AI_FORCE_PROVIDER;
  if (forced === "gemini" || forced === "claude") return forced;
  if (requested && providersForPlan(plan).includes(requested)) return requested;
  return providerForPlan(plan);
}
