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
} from "@/lib/plan";

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

  it("daily AI message caps", () => {
    expect(aiDailyLimit("free")).toBe(3);
    expect(aiDailyLimit("basic")).toBe(20);
    expect(aiDailyLimit("pro")).toBe(40);
    expect(aiDailyLimit("max")).toBe(80);
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
    expect(reasoningFor("basic", "advanced")).toEqual({ thinking: false, effort: "low" });
  });

  it("pro buys real deliberation, max buys the deepest", () => {
    expect(reasoningFor("pro", "advanced")).toEqual({ thinking: true, effort: "medium" });
    expect(reasoningFor("max", "max")).toEqual({ thinking: true, effort: "high" });
  });

  it("a max user who picks the cheaper tier gets that tier's reasoning", () => {
    expect(reasoningFor("max", "advanced")).toEqual({ thinking: true, effort: "medium" });
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
