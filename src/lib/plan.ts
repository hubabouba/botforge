/**
 * Plans, capabilities, and AI-provider routing.
 *
 * Tiers: free → Gemini (deliberately limited), basic & pro → Claude Sonnet,
 * max → Claude Opus (our most capable model).
 * Higher tiers unlock capabilities (panels, deeper assistant powers). Until
 * Stripe + a subscription store exist, a user's plan is derived from env
 * allow-lists so the owner can test each tier:
 *   - BOTFORGE_PRO_EMAILS   / BOTFORGE_BASIC_EMAILS: comma-separated emails
 *   - AI_FORCE_PROVIDER: "gemini" | "claude" to override provider routing
 */

export type Plan = "free" | "basic" | "pro" | "max";
export type Provider = "gemini" | "claude";

export const PLAN_RANK: Record<Plan, number> = { free: 0, basic: 1, pro: 2, max: 3 };

/** Max number of projects per plan (Infinity = unlimited). */
export const PROJECT_LIMIT: Record<Plan, number> = { free: 2, basic: 15, pro: Infinity, max: Infinity };

export function projectLimit(plan: Plan): number {
  return PROJECT_LIMIT[plan];
}

/** Daily AI-assistant message cap per plan (enforced in /api/ai/chat). */
export const AI_DAILY_MESSAGES: Record<Plan, number> = { free: 3, basic: 20, pro: 40, max: 80 };

/**
 * Monthly cap, on top of the daily one. A circuit-breaker, not a quota.
 *
 * The daily cap alone permits 30x its number every month — 600 messages on
 * Basic, 2400 on Max. Model calls are the dominant cost in this product, and at
 * any plausible per-message price those ceilings run every tier at a loss if a
 * single user actually reaches them. The business works because average use is
 * a fraction of the cap; this exists so one outlier can't eat the margin of
 * everyone else.
 *
 * Set around 40% of daily x 30 — roughly twelve days of flat-out use in a
 * month, which no ordinary user approaches and a runaway script passes quickly.
 *
 * It matters most on annual plans: a monthly subscriber who turns unprofitable
 * can be re-priced next month, an annual one is locked in for twelve.
 */
export const AI_MONTHLY_MESSAGES: Record<Plan, number> = { free: 30, basic: 250, pro: 500, max: 1000 };

export function aiMonthlyLimit(plan: Plan): number {
  return AI_MONTHLY_MESSAGES[plan];
}

/**
 * What the user picks in the workspace model selector. This is the product-level
 * concept; `Provider` below is just which SDK the server calls for it.
 */
export type AssistantTier = "standard" | "advanced" | "max";

export function providerForTier(tier: AssistantTier): Provider {
  return tier === "standard" ? "gemini" : "claude";
}

/**
 * The model each tier runs. Max is our most capable model (~2.5–3x the token
 * cost of the standard paid one — hence the higher price). Free runs Gemini and
 * never reads this.
 */
export function modelForTier(tier: AssistantTier): string {
  return tier === "max" ? "claude-opus-5" : "claude-sonnet-5";
}

/**
 * How hard the assistant reasons, and what that costs.
 *
 * Extended thinking is the single biggest cost driver: those tokens bill as
 * output, and each user message runs a multi-turn agentic loop. Basic therefore
 * runs with thinking OFF — its smaller message allowance would otherwise burn
 * far more per message than the tier is priced for. Pro and Max buy real
 * deliberation, and it's visible to them (see the `thinking` stream event).
 *
 * `effort` is set explicitly on every tier because the API default is "high" —
 * leaving it unset silently opts everyone into the expensive end of the scale.
 */
export interface ReasoningConfig {
  /** Extended thinking on. When false the model answers without a reasoning pass. */
  thinking: boolean;
  effort: "low" | "medium" | "high" | "xhigh";
  /**
   * Hard ceiling on thinking + reply for ONE turn of the loop.
   *
   * Not a spend target — `effort` decides actual usage — but the only thing
   * standing between us and a runaway. It was a flat 64000 on every tier, and
   * 64000 output tokens is $0.96 on the standard paid model, for a single
   * message that comes back truncated and useless. Measured output is
   * 1,885–5,861 tokens for a whole message across all its turns, so these
   * ceilings sit far above anything real and catch only the pathological case.
   */
  maxOutputTokens: number;
}

export function reasoningFor(plan: Plan, tier: AssistantTier): ReasoningConfig {
  // Measured, not guessed: an hour of real Pro use cost $1.53, and thinking at
  // "high" was most of it — the model reasons for thousands of tokens on every
  // turn of the loop, and thinking bills as output. Each tier is one notch
  // lower than the setting that produced that bill.
  if (tier === "max") return { thinking: true, effort: "high", maxOutputTokens: 64_000 };
  return plan === "basic"
    ? // Thinking is off here, so the whole allowance goes to the reply and the
      // files. 24000 tokens is roughly 96k characters in one turn — more than
      // any single bot file we've seen.
      { thinking: false, effort: "low", maxOutputTokens: 24_000 }
    : { thinking: true, effort: "medium", maxOutputTokens: 32_000 };
}

/**
 * How many write→read→review turns the agentic loop may take. This multiplies
 * every other cost, so it's the bluntest lever there is: a review pass is worth
 * paying for on the top tier and hard to justify on the cheapest.
 */
export function maxToolTurnsFor(plan: Plan): number {
  if (plan === "max") return 4;
  return plan === "basic" ? 2 : 3;
}

/**
 * Which tiers a plan may select. Pure (no env) so the client can build the
 * selector from it; `resolveTier` is the server-side enforcement — never trust
 * the client to unlock a paid tier.
 */
export function tiersForPlan(plan: Plan): AssistantTier[] {
  if (plan === "max") return ["standard", "advanced", "max"];
  if (planAllows(plan, "assistant.claude")) return ["standard", "advanced"];
  return ["standard"];
}

/** The tier a plan gets when the user hasn't chosen one: the best it can run. */
export function defaultTierForPlan(plan: Plan): AssistantTier {
  const allowed = tiersForPlan(plan);
  return allowed[allowed.length - 1];
}

/**
 * The tier to actually run: honor the user's choice only if their plan allows
 * it, else fall back to the plan default. AI_FORCE_PROVIDER still overrides
 * everything (local testing).
 */
export function resolveTier(plan: Plan, requested?: AssistantTier | null): AssistantTier {
  const forced = process.env.AI_FORCE_PROVIDER;
  if (forced === "gemini") return "standard";
  if (forced === "claude") return plan === "max" ? "max" : "advanced";
  if (requested && tiersForPlan(plan).includes(requested)) return requested;
  return defaultTierForPlan(plan);
}

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
  if (plan === "free") return "basic";
  if (plan === "basic") return "pro";
  return "max";
}

/** Gated features. Each maps to the minimum plan that unlocks it. */
export type Capability =
  | "assistant.claude" // smarter model (Claude) instead of the limited free assistant
  | "assistant.logs" // the assistant may read & analyze the bot's console output
  | "assistant.clarify" // the assistant asks instead of guessing when the ask is underspecified
  | "panel.logs" // the Logs panel
  | "panel.planning" // the AI Planning panel
  | "panel.metrics" // the Metrics panel
  | "hosting.run"; // run a bot on Botforge hosting (Real Run) + manage its secrets

export const CAPABILITY_MIN_PLAN: Record<Capability, Plan> = {
  "assistant.claude": "basic",
  "panel.logs": "basic",
  "panel.planning": "basic",
  "panel.metrics": "pro",
  // Declared "pro" for a while but never actually checked anywhere, so Basic
  // had it the whole time — a capability that governs nothing is worse than no
  // capability at all. Owner's call: Basic keeps it. It is now genuinely read
  // (runtimeContext), so this line finally decides something and moving it back
  // to "pro" would take effect for real.
  "assistant.logs": "basic",
  "assistant.clarify": "pro",
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
export const HOSTING_CONCURRENT_RUNS: Record<Plan, number> = { free: 0, basic: 1, pro: 3, max: 5 };

export function hostingConcurrentLimit(plan: Plan): number {
  return HOSTING_CONCURRENT_RUNS[plan];
}

/**
 * Hours of headroom per concurrent bot, per month. A month is 730-744 hours,
 * so 750 is "all month, plus room for the odd restart".
 */
const HOURS_PER_SLOT = 750;

/**
 * Monthly bot-runtime budget per plan, in hours — the pool every one of that
 * plan's bots draws from together.
 *
 * Derived from the concurrency above rather than written out, because the two
 * numbers are one promise and hand-written constants drifted apart: Pro allows
 * 3 bots at once but budgeted 1000 hours, and three bots running all month need
 * ~2190. A Pro customer using the concurrency they paid for had all three
 * killed around day 13 with "this month's hosting hours are used up". Max was
 * worse — 5 slots against 1500 hours, so day 12.
 *
 * The old comment claimed every tier cleared a full month, and it did, for ONE
 * bot. So did the test guarding it. Both checked the wrong thing.
 *
 * Cost isn't the constraint and never was: a shared-cpu-1x/256MB machine is
 * ~$2/month flat out, so the real spend ceiling is HOSTING_CONCURRENT_RUNS —
 * at most $2/$6/$10 an account against $9/$19/$49 of revenue. This budget is a
 * runaway guard, not a meter.
 */
export const HOSTING_MONTHLY_RUNTIME_HOURS: Record<Plan, number> = {
  free: 0,
  basic: HOSTING_CONCURRENT_RUNS.basic * HOURS_PER_SLOT,
  pro: HOSTING_CONCURRENT_RUNS.pro * HOURS_PER_SLOT,
  max: HOSTING_CONCURRENT_RUNS.max * HOURS_PER_SLOT,
};

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

/** How a subscription is billed. Annual exists only for the paid plans. */
export type BillingInterval = "month" | "year";

/**
 * Months charged on an annual plan. Two months free is the usual shape and the
 * reason annual is worth offering at all: the customer saves real money and we
 * trade a discount for twelve months of committed revenue instead of a monthly
 * decision to keep paying.
 */
export const ANNUAL_MONTHS_CHARGED = 10;

export interface PlanMeta {
  id: Plan;
  name: string;
  /** Monthly price in USD; 0 for free. Change freely — copy reads from here. */
  price: number;
  tagline: string;
  highlights: string[];
}

/** What a year of this plan costs up front. Free stays 0. */
export function annualPrice(plan: Plan): number {
  return planMeta(plan).price * ANNUAL_MONTHS_CHARGED;
}

/**
 * The per-month figure shown beside an annual price, as a display string.
 *
 * A string, not a number, because a number renders $90/12 as "$7.5" — a price
 * with one decimal reads as a typo. Always two decimals here; the monthly
 * prices are whole and print as "$9".
 */
export function annualMonthlyEquivalent(plan: Plan): string {
  return (annualPrice(plan) / 12).toFixed(2);
}

/** Months not charged on an annual plan — the saving, as a count. */
export const ANNUAL_MONTHS_FREE = 12 - ANNUAL_MONTHS_CHARGED;

/**
 * What a subscriber contributes per month, whichever way they pay.
 *
 * The distinction is the whole reason `billing_interval` exists on the
 * subscriptions row: valuing an annual Pro at the monthly $19 instead of the
 * $15.83 it actually works out to overstates every revenue figure by a sixth —
 * in precisely the numbers used to decide whether a tier pays for itself.
 */
export function monthlyRevenue(plan: Plan, interval: BillingInterval | null | undefined): number {
  if (interval === "year") return annualPrice(plan) / 12;
  return planMeta(plan).price;
}

export const PLANS: PlanMeta[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    tagline: "Try it out and ship a simple bot.",
    highlights: ["Standard AI assistant", "3 assistant messages/day", "2 projects", "Download & run locally"],
  },
  {
    id: "basic",
    name: "Basic",
    price: 9,
    tagline: "A serious assistant for real bots.",
    highlights: ["Advanced AI assistant", "20 assistant messages/day", "Logs & AI planning panels", "15 projects"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 19,
    tagline: "Everything, including insight into your bot.",
    highlights: ["Everything in Basic", "40 assistant messages/day", "Metrics panel", "Assistant inspects your logs"],
  },
  {
    id: "max",
    name: "Max",
    price: 49,
    tagline: "The most capable AI, for demanding builds.",
    highlights: ["Everything in Pro", "Our most advanced AI model", "80 assistant messages/day", "Priority generation"],
  },
];

export function planMeta(plan: Plan): PlanMeta {
  return PLANS.find((p) => p.id === plan) ?? PLANS[0];
}

export function getPlan(email?: string | null): Plan {
  const e = email?.toLowerCase();
  if (e && envEmailList("BOTFORGE_MAX_EMAILS").includes(e)) return "max";
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

// Provider routing lives entirely on AssistantTier now (see tiersForPlan /
// resolveTier / providerForTier above) — a plan-keyed `providerForPlan` and a
// tier-keyed selector would be two sources of truth for the same decision.
