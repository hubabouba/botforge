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
  it("project limits, unlimited for pro", () => {
    expect(projectLimit("free")).toBe(2);
    expect(projectLimit("basic")).toBe(15);
    expect(projectLimit("pro")).toBe(Infinity);
  });

  it("daily AI message caps", () => {
    expect(aiDailyLimit("free")).toBe(3);
    expect(aiDailyLimit("basic")).toBe(10);
    expect(aiDailyLimit("pro")).toBe(40);
  });

  it("hosting concurrency per plan", () => {
    expect(hostingConcurrentLimit("free")).toBe(0);
    expect(hostingConcurrentLimit("basic")).toBe(1);
    expect(hostingConcurrentLimit("pro")).toBe(3);
  });

  it("hosting monthly budget converts hours→seconds, 0 for free", () => {
    expect(hostingRuntimeBudgetSeconds("free")).toBe(0);
    expect(hostingRuntimeBudgetSeconds("basic")).toBe(100 * 3600);
    expect(hostingRuntimeBudgetSeconds("pro")).toBe(400 * 3600);
  });
});

describe("getPlan (env allow-lists)", () => {
  const ORIGINAL = process.env;
  afterEach(() => {
    process.env = ORIGINAL;
  });

  it("resolves plan from the email allow-lists", () => {
    process.env = { ...ORIGINAL, BOTFORGE_PRO_EMAILS: "boss@x.com", BOTFORGE_BASIC_EMAILS: "user@x.com" };
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

  it("basic/pro match HOSTING_CONCURRENT_RUNS / HOSTING_MONTHLY_RUNTIME_HOURS", () => {
    expect(hostingLimitsFor("basic")).toEqual({ concurrent: 1, budgetSeconds: 100 * 3600 });
    expect(hostingLimitsFor("pro")).toEqual({ concurrent: 3, budgetSeconds: 400 * 3600 });
  });
});
