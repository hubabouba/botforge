import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { annualBillingEnabled, planForPriceId, priceIdForPlan } from "@/lib/stripe";
import { ANNUAL_MONTHS_CHARGED, annualMonthlyEquivalent, annualPrice, planMeta } from "@/lib/plan";

const PRICE_VARS = [
  "STRIPE_PRICE_BASIC",
  "STRIPE_PRICE_PRO",
  "STRIPE_PRICE_MAX",
  "STRIPE_PRICE_BASIC_ANNUAL",
  "STRIPE_PRICE_PRO_ANNUAL",
  "STRIPE_PRICE_MAX_ANNUAL",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of PRICE_VARS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of PRICE_VARS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("planForPriceId", () => {
  // This is the function the Stripe webhook leans on. An id it doesn't
  // recognise falls through to "free", so a paying customer silently loses the
  // plan they just bought — which is exactly what would happen if annual prices
  // existed in Stripe but weren't mapped here.
  it("maps both intervals of every paid plan", () => {
    process.env.STRIPE_PRICE_BASIC = "price_basic_m";
    process.env.STRIPE_PRICE_PRO = "price_pro_m";
    process.env.STRIPE_PRICE_MAX = "price_max_m";
    process.env.STRIPE_PRICE_BASIC_ANNUAL = "price_basic_y";
    process.env.STRIPE_PRICE_PRO_ANNUAL = "price_pro_y";
    process.env.STRIPE_PRICE_MAX_ANNUAL = "price_max_y";

    expect(planForPriceId("price_basic_m")).toBe("basic");
    expect(planForPriceId("price_basic_y")).toBe("basic");
    expect(planForPriceId("price_pro_m")).toBe("pro");
    expect(planForPriceId("price_pro_y")).toBe("pro");
    expect(planForPriceId("price_max_m")).toBe("max");
    expect(planForPriceId("price_max_y")).toBe("max");
  });

  it("returns null for an unknown or empty id rather than guessing a plan", () => {
    process.env.STRIPE_PRICE_PRO = "price_pro_m";
    expect(planForPriceId("price_someone_elses")).toBeNull();
    expect(planForPriceId(null)).toBeNull();
    expect(planForPriceId(undefined)).toBeNull();
    expect(planForPriceId("")).toBeNull();
  });

  it("doesn't match an unset price against an unset env var", () => {
    // Both undefined must not compare equal — that would map every unknown id
    // to whichever plan happens to be unconfigured.
    expect(planForPriceId(undefined)).toBeNull();
    expect(planForPriceId("undefined")).toBeNull();
  });
});

describe("priceIdForPlan", () => {
  it("defaults to monthly and never prices the free plan", () => {
    process.env.STRIPE_PRICE_PRO = "price_pro_m";
    process.env.STRIPE_PRICE_PRO_ANNUAL = "price_pro_y";
    expect(priceIdForPlan("pro")).toBe("price_pro_m");
    expect(priceIdForPlan("pro", "month")).toBe("price_pro_m");
    expect(priceIdForPlan("pro", "year")).toBe("price_pro_y");
    expect(priceIdForPlan("free")).toBeNull();
    expect(priceIdForPlan("free", "year")).toBeNull();
  });
});

describe("annualBillingEnabled", () => {
  it("stays off until every paid tier has an annual price", () => {
    expect(annualBillingEnabled()).toBe(false);
    process.env.STRIPE_PRICE_BASIC_ANNUAL = "price_basic_y";
    process.env.STRIPE_PRICE_PRO_ANNUAL = "price_pro_y";
    // Max still missing — a toggle that half-works is worse than no toggle.
    expect(annualBillingEnabled()).toBe(false);
    process.env.STRIPE_PRICE_MAX_ANNUAL = "price_max_y";
    expect(annualBillingEnabled()).toBe(true);
  });
});

describe("annual pricing arithmetic", () => {
  it("charges ten months for twelve", () => {
    expect(annualPrice("pro")).toBe(planMeta("pro").price * ANNUAL_MONTHS_CHARGED);
    expect(annualPrice("free")).toBe(0);
  });

  it("shows a per-month figure below the monthly price", () => {
    for (const plan of ["basic", "pro", "max"] as const) {
      expect(annualMonthlyEquivalent(plan)).toBeLessThan(planMeta(plan).price);
    }
  });
});
