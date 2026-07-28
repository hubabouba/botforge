/**
 * Server-side Stripe helpers. Everything is env-gated: with no STRIPE_SECRET_KEY
 * the app runs exactly as before (the upgrade CTA stays "coming soon") — only
 * once the keys are set does checkout/webhook go live.
 */
import Stripe from "stripe";
import type { BillingInterval, Plan } from "./plan";

const secret = process.env.STRIPE_SECRET_KEY;

// Pinned so a future Stripe account-level default change can't silently alter
// request/response shapes here; matches the version this SDK release expects.
export const stripe = secret ? new Stripe(secret, { apiVersion: "2026-06-24.dahlia" }) : null;

export function stripeEnabled(): boolean {
  return Boolean(secret);
}

/**
 * The origin to build Stripe return URLs from. `BOTFORGE_PUBLIC_URL` when it's
 * set (the same env the hosting runners already call back to), otherwise the
 * request's own origin.
 *
 * Never the Origin *header*: the caller sets it, and it ends up in `success_url`
 * / `return_url` — an attacker-supplied one sends the customer to their page the
 * moment the payment clears, which is exactly when the customer trusts us most.
 */
export function publicOrigin(req: Request): string {
  const configured = (process.env.BOTFORGE_PUBLIC_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  return new URL(req.url).origin;
}

/**
 * Env var holding each plan/interval's Stripe Price ID. Monthly names are
 * unchanged so existing deployments keep working; annual is additive, and a
 * missing annual id simply means annual isn't offered (see `annualBillingEnabled`).
 */
const PRICE_ENV: Record<Exclude<Plan, "free">, Record<BillingInterval, string>> = {
  basic: { month: "STRIPE_PRICE_BASIC", year: "STRIPE_PRICE_BASIC_ANNUAL" },
  pro: { month: "STRIPE_PRICE_PRO", year: "STRIPE_PRICE_PRO_ANNUAL" },
  max: { month: "STRIPE_PRICE_MAX", year: "STRIPE_PRICE_MAX_ANNUAL" },
};

/** Stripe Price ID for a paid plan at a billing interval (from env). */
export function priceIdForPlan(plan: Plan, interval: BillingInterval = "month"): string | null {
  if (plan === "free") return null;
  return process.env[PRICE_ENV[plan][interval]] ?? null;
}

/**
 * Reverse map: which plan a Stripe Price ID corresponds to, at either interval.
 *
 * This is the function the webhook depends on, and getting it wrong costs a
 * paying customer their plan: an unrecognised price falls through to "free"
 * (see the upsert in the webhook, which shouts to Sentry when that happens to
 * an active subscription). So annual ids MUST be listed here — adding an annual
 * price in Stripe without setting its env var here would silently downgrade
 * everyone who buys it.
 */
export function planForPriceId(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  for (const plan of ["max", "pro", "basic"] as const) {
    for (const interval of ["month", "year"] as const) {
      const configured = process.env[PRICE_ENV[plan][interval]];
      if (configured && priceId === configured) return plan;
    }
  }
  return null;
}

/**
 * Whether to show the annual option at all. All three annual prices must exist:
 * offering annual on some tiers and not others reads as a mistake, and the
 * toggle would silently do nothing on the tiers that lack one.
 */
export function annualBillingEnabled(): boolean {
  return (["basic", "pro", "max"] as const).every((plan) => !!priceIdForPlan(plan, "year"));
}
