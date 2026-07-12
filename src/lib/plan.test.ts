import { afterEach, describe, expect, it } from "vitest";
import {
  planAllows,
  projectLimit,
  aiDailyLimit,
  hostingConcurrentLimit,
  hostingRuntimeBudgetSeconds,
  hostingLimitsFor,
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
    expect(projectLimit("free")).toBe(3);
    expect(projectLimit("basic")).toBe(15);
    expect(projectLimit("pro")).toBe(Infinity);
  });

  it("daily AI message caps", () => {
    expect(aiDailyLimit("free")).toBe(5);
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

describe("getPlan / hostingLimitsFor (env allow-lists)", () => {
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

  it("a beta-allowlisted free user still gets Basic hosting limits (allow-list can't zero itself out)", () => {
    process.env = { ...ORIGINAL, HOSTING_BETA_EMAILS: "beta@x.com", BOTFORGE_PRO_EMAILS: "", BOTFORGE_BASIC_EMAILS: "" };
    const limits = hostingLimitsFor("beta@x.com");
    expect(limits.concurrent).toBe(1);
    expect(limits.budgetSeconds).toBe(100 * 3600);
  });

  it("a real Pro subscriber keeps Pro hosting limits", () => {
    process.env = { ...ORIGINAL, BOTFORGE_PRO_EMAILS: "pro@x.com" };
    const limits = hostingLimitsFor("pro@x.com");
    expect(limits.concurrent).toBe(3);
    expect(limits.budgetSeconds).toBe(400 * 3600);
  });

  it("a non-beta free user gets zero hosting", () => {
    process.env = { ...ORIGINAL, HOSTING_BETA_EMAILS: "", BOTFORGE_PRO_EMAILS: "", BOTFORGE_BASIC_EMAILS: "" };
    expect(hostingLimitsFor("free@x.com").concurrent).toBe(0);
  });
});
