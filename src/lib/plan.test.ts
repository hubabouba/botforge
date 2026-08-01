import { afterEach, describe, expect, it } from "vitest";
import {
  planAllows,
  projectLimit,
  aiDailyLimit,
  hostingConcurrentLimit,
  hostingRuntimeBudgetSeconds,
  hostingLimitsFor,
  effectiveHostingPlan,
  getPlan,
  tiersForPlan,
  defaultTierForPlan,
  resolveTier,
  providerForTier,
  modelForTier,
  reasoningFor,
  maxToolTurnsFor,
  aiMonthlyLimit,
  aiMonthlyUsdCap,
  planMeta,
  type Plan,
} from "@/lib/plan";

/** Cheapest to dearest — the order every per-plan number has to respect. */
const PLAN_IDS: Plan[] = ["free", "basic", "pro", "max"];

describe("planAllows", () => {
  it("gates capabilities by plan rank", () => {
    expect(planAllows("free", "hosting.run")).toBe(false);
    expect(planAllows("basic", "hosting.run")).toBe(true);
    expect(planAllows("pro", "hosting.run")).toBe(true);
    // panel.metrics is Pro-only
    expect(planAllows("basic", "panel.metrics")).toBe(false);
    expect(planAllows("pro", "panel.metrics")).toBe(true);
  });
});

describe("per-plan numeric caps", () => {
  it("project limits, unlimited for pro and max", () => {
    expect(projectLimit("free")).toBe(2);
    expect(projectLimit("basic")).toBe(15);
    expect(projectLimit("pro")).toBe(Infinity);
    expect(projectLimit("max")).toBe(Infinity);
  });

  // Restating the numbers from plan.ts here only proved they'd been copied
  // correctly. These assert the properties that actually have to hold — the
  // ones a future change to the table could quietly break.
  it("the daily cap limits bursts; the monthly cap is the real budget", () => {
    for (const p of PLAN_IDS) {
      expect(aiDailyLimit(p)).toBeLessThan(aiMonthlyLimit(p));
      // ...but not so low that the month is unreachable, which would make the
      // advertised monthly number a lie.
      expect(aiDailyLimit(p) * 30).toBeGreaterThan(aiMonthlyLimit(p));
    }
  });

  it("both caps rise with the plan", () => {
    for (let i = 1; i < PLAN_IDS.length; i++) {
      expect(aiDailyLimit(PLAN_IDS[i])).toBeGreaterThan(aiDailyLimit(PLAN_IDS[i - 1]));
      expect(aiMonthlyLimit(PLAN_IDS[i])).toBeGreaterThan(aiMonthlyLimit(PLAN_IDS[i - 1]));
    }
  });

  /**
   * What a plan's hosting allowance costs us, at Fly's rate when this was
   * written: one always-on shared-cpu-1x machine is about $2/month, so about
   * $2 per 750 runtime hours. Test-local on purpose — it's an assumption about
   * a supplier's price, not something the product should carry as fact.
   */
  const USD_PER_RUNTIME_HOUR = 2 / 750;
  const cardFee = (price: number) => price * 0.029 + 0.3;

  it("a customer who exhausts every allowance still leaves the plan in profit", () => {
    for (const p of ["basic", "pro", "max"] as const) {
      const price = planMeta(p).price;
      const worstCase =
        aiMonthlyUsdCap(p) +
        (hostingRuntimeBudgetSeconds(p) / 3600) * USD_PER_RUNTIME_HOUR +
        cardFee(price);
      // The single assertion that keeps the business solvent: the ceilings are
      // what a customer is entitled to use, so all of them at once has to be
      // survivable. If raising a cap breaks this, the cap was raised on hope.
      expect(worstCase).toBeLessThan(price);
    }
  });

  it("the dollar ceiling sits above what the message cap normally costs", () => {
    // Typical measured cost per message, by tier — Basic runs without extended
    // thinking, Max runs the dearest model at the deepest setting.
    const typicalUsd: Record<string, number> = { basic: 0.035, pro: 0.07, max: 0.14 };
    for (const p of ["basic", "pro", "max"] as const) {
      // Otherwise the advertised message count is unreachable and the number on
      // the pricing page is a lie: people would be cut off long before it.
      expect(aiMonthlyLimit(p) * typicalUsd[p]).toBeLessThanOrEqual(aiMonthlyUsdCap(p));
    }
  });

  it("hosting concurrency per plan", () => {
    expect(hostingConcurrentLimit("free")).toBe(0);
    expect(hostingConcurrentLimit("basic")).toBe(1);
    expect(hostingConcurrentLimit("pro")).toBe(3);
    expect(hostingConcurrentLimit("max")).toBe(5);
  });

  it("hosting monthly budget converts hours→seconds, 0 for free", () => {
    expect(hostingRuntimeBudgetSeconds("free")).toBe(0);
    expect(hostingRuntimeBudgetSeconds("basic")).toBe(750 * 3600);
    expect(hostingRuntimeBudgetSeconds("pro")).toBe(2250 * 3600);
    expect(hostingRuntimeBudgetSeconds("max")).toBe(3750 * 3600);
  });

  /**
   * The invariant that actually matters, and the one the old version of this
   * test missed: it checked that each tier covered ONE bot for a month, which
   * Pro (3 slots, 1000h) passed while being unable to run the three bots it
   * sells for more than ~13 days. Concurrency and budget are one promise, so
   * the assertion has to multiply them.
   */
  it("every paid tier can run its full concurrency all month", () => {
    const MONTH_HOURS = 744; // 31 days, the worst case
    for (const plan of ["basic", "pro", "max"] as const) {
      const needed = hostingConcurrentLimit(plan) * MONTH_HOURS * 3600;
      expect(hostingRuntimeBudgetSeconds(plan)).toBeGreaterThanOrEqual(needed);
    }
  });
});

describe("assistant tiers", () => {
  const ORIGINAL = process.env;
  afterEach(() => {
    process.env = ORIGINAL;
  });

  it("free is locked to standard; only max may pick max", () => {
    expect(tiersForPlan("free")).toEqual(["standard"]);
    expect(tiersForPlan("basic")).toEqual(["standard", "advanced"]);
    expect(tiersForPlan("pro")).toEqual(["standard", "advanced"]);
    expect(tiersForPlan("max")).toEqual(["standard", "advanced", "max"]);
  });

  it("defaults to the best tier the plan can run", () => {
    expect(defaultTierForPlan("free")).toBe("standard");
    expect(defaultTierForPlan("basic")).toBe("advanced");
    expect(defaultTierForPlan("max")).toBe("max");
  });

  it("refuses a tier the plan hasn't paid for", () => {
    process.env = { ...ORIGINAL, AI_FORCE_PROVIDER: "" };
    // The whole point of the server-side check: a client asking for "max"
    // on a lesser plan gets that plan's default, not max.
    expect(resolveTier("free", "max")).toBe("standard");
    expect(resolveTier("basic", "max")).toBe("advanced");
    expect(resolveTier("pro", "max")).toBe("advanced");
    expect(resolveTier("max", "max")).toBe("max");
  });

  it("honors a downgrade the plan does allow", () => {
    process.env = { ...ORIGINAL, AI_FORCE_PROVIDER: "" };
    expect(resolveTier("max", "advanced")).toBe("advanced");
    expect(resolveTier("pro", "standard")).toBe("standard");
  });

  it("maps tiers to providers and models", () => {
    expect(providerForTier("standard")).toBe("gemini");
    expect(providerForTier("advanced")).toBe("claude");
    expect(providerForTier("max")).toBe("claude");
    expect(modelForTier("max")).toBe("claude-opus-5");
    expect(modelForTier("advanced")).toBe("claude-sonnet-5");
  });
});

describe("reasoningFor (cost/quality per tier)", () => {
  it("basic runs without thinking — that's the tier's whole cost model", () => {
    expect(reasoningFor("basic", "advanced")).toMatchObject({ thinking: false, effort: "low" });
  });

  it("pro buys real deliberation, max buys the deepest", () => {
    expect(reasoningFor("pro", "advanced")).toMatchObject({ thinking: true, effort: "medium" });
    expect(reasoningFor("max", "max")).toMatchObject({ thinking: true, effort: "high" });
  });

  it("a max user who picks the cheaper tier gets that tier's reasoning", () => {
    expect(reasoningFor("max", "advanced")).toMatchObject({ thinking: true, effort: "medium" });
  });

  it("caps one turn's output, and the cap rises with what the tier is priced for", () => {
    const basic = reasoningFor("basic", "advanced").maxOutputTokens;
    const pro = reasoningFor("pro", "advanced").maxOutputTokens;
    const max = reasoningFor("max", "max").maxOutputTokens;
    expect(basic).toBeLessThan(pro);
    expect(pro).toBeLessThan(max);
    // The ceiling that matters: at $15/M output, an uncapped turn on the paid
    // model is a ~$1 message. Nothing here may exceed what a plan can absorb.
    expect(basic).toBeLessThanOrEqual(24_000);
  });

  it("effort rises with the tier and never exceeds what the tier is priced for", () => {
    const rank = { low: 0, medium: 1, high: 2, xhigh: 3 } as const;
    expect(rank[reasoningFor("basic", "advanced").effort]).toBeLessThan(
      rank[reasoningFor("pro", "advanced").effort],
    );
    expect(rank[reasoningFor("pro", "advanced").effort]).toBeLessThan(
      rank[reasoningFor("max", "max").effort],
    );
  });

  it("loop turns rise with the tier — they multiply every other cost", () => {
    expect(maxToolTurnsFor("basic")).toBe(2);
    expect(maxToolTurnsFor("pro")).toBe(3);
    expect(maxToolTurnsFor("max")).toBe(4);
  });

  it("never sets effort implicitly — the API default is the expensive end", () => {
    for (const [plan, tier] of [
      ["basic", "advanced"],
      ["pro", "advanced"],
      ["max", "max"],
    ] as const) {
      expect(reasoningFor(plan, tier).effort).toBeTruthy();
    }
  });
});

describe("getPlan (env allow-lists)", () => {
  const ORIGINAL = process.env;
  afterEach(() => {
    process.env = ORIGINAL;
  });

  it("resolves plan from the email allow-lists", () => {
    process.env = {
      ...ORIGINAL,
      BOTFORGE_MAX_EMAILS: "owner@x.com",
      BOTFORGE_PRO_EMAILS: "boss@x.com",
      BOTFORGE_BASIC_EMAILS: "user@x.com",
    };
    expect(getPlan("owner@x.com")).toBe("max");
    expect(getPlan("boss@x.com")).toBe("pro");
    expect(getPlan("USER@x.com")).toBe("basic"); // case-insensitive
    expect(getPlan("nobody@x.com")).toBe("free");
    expect(getPlan(null)).toBe("free");
  });
});

describe("effectiveHostingPlan (HOSTING_BETA_EMAILS override)", () => {
  const ORIGINAL = process.env;
  afterEach(() => {
    process.env = ORIGINAL;
  });

  it("bumps a beta-listed free account to basic (can't be zeroed out)", () => {
    process.env = { ...ORIGINAL, HOSTING_BETA_EMAILS: "beta@x.com" };
    expect(effectiveHostingPlan("free", "beta@x.com")).toBe("basic");
  });

  it("never touches a real paid plan", () => {
    process.env = { ...ORIGINAL, HOSTING_BETA_EMAILS: "pro@x.com" };
    expect(effectiveHostingPlan("pro", "pro@x.com")).toBe("pro");
  });

  it("leaves a non-listed free account at free", () => {
    process.env = { ...ORIGINAL, HOSTING_BETA_EMAILS: "" };
    expect(effectiveHostingPlan("free", "nobody@x.com")).toBe("free");
  });
});

describe("hostingLimitsFor (resolved plan → concurrency/budget pair)", () => {
  it("free gets zero hosting", () => {
    expect(hostingLimitsFor("free").concurrent).toBe(0);
  });

  it("basic/pro/max match HOSTING_CONCURRENT_RUNS / HOSTING_MONTHLY_RUNTIME_HOURS", () => {
    expect(hostingLimitsFor("basic")).toEqual({ concurrent: 1, budgetSeconds: 750 * 3600 });
    expect(hostingLimitsFor("pro")).toEqual({ concurrent: 3, budgetSeconds: 2250 * 3600 });
    expect(hostingLimitsFor("max")).toEqual({ concurrent: 5, budgetSeconds: 3750 * 3600 });
  });
});
