"use client";

/**
 * Thin wrapper over the Meta/Facebook Pixel's global `fbq`, mirroring
 * `lib/analytics.ts`: a closed set of Meta's own standard event names — using
 * their vocabulary rather than custom ones is what makes ad-account-side
 * optimization and reporting work at all — guarded so a missing pixel (no env
 * var) or one an ad blocker killed never breaks the product.
 *
 * The pixel itself — script injection, the `PageView` fired on load — lives in
 * MetaPixelProvider; this module only fires events from call sites elsewhere
 * in the app once it's (maybe) running.
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export type MetaPixelEvent = "Lead" | "InitiateCheckout" | "Purchase";

export function fbTrack(event: MetaPixelEvent, params?: Record<string, unknown>): void {
  try {
    window.fbq?.("track", event, params);
  } catch {
    /* best-effort — an ad blocker or a missing pixel must never surface here */
  }
}

/**
 * Handoff for the one event the pixel can't observe directly. A purchase is
 * confirmed server-side, by the Stripe webhook — by the time that happens
 * there is no browser tab left to fire a client-side pixel event from. The
 * price is stashed here at the one point it's known client-side (the moment
 * checkout is attempted) and consumed once the user lands back on
 * `?checkout=success` — the same signal `checkout_completed` already treats
 * as "the purchase went through".
 */
const PENDING_PURCHASE_KEY = "bf:pending-purchase";

export function stashPendingPurchase(value: number): void {
  try {
    localStorage.setItem(PENDING_PURCHASE_KEY, String(value));
  } catch {
    /* Purchase still fires — just without a value attached */
  }
}

/** Reads and clears the stashed value — consumed at most once per checkout. */
export function consumePendingPurchase(): number | null {
  try {
    const raw = localStorage.getItem(PENDING_PURCHASE_KEY);
    localStorage.removeItem(PENDING_PURCHASE_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}
