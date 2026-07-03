/**
 * Server-side Stripe helpers. Everything is env-gated: with no STRIPE_SECRET_KEY
 * the app runs exactly as before (the upgrade CTA stays "coming soon") — only
 * once the keys are set does checkout/webhook go live.
 */
import Stripe from "stripe";
import type { Plan } from "./plan";

const secret = process.env.STRIPE_SECRET_KEY;

export const stripe = secret ? new Stripe(secret) : null;

export function stripeEnabled(): boolean {
  return Boolean(secret);
}

/** Stripe Price ID for a paid plan (from env). */
export function priceIdForPlan(plan: Plan): string | null {
  if (plan === "basic") return process.env.STRIPE_PRICE_BASIC ?? null;
  if (plan === "pro") return process.env.STRIPE_PRICE_PRO ?? null;
  return null;
}

/** Reverse map: which plan a Stripe Price ID corresponds to. */
export function planForPriceId(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === process.env.STRIPE_PRICE_BASIC) return "basic";
  return null;
}
