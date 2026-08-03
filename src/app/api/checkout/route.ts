import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { stripe, stripeEnabled, priceIdForPlan, publicOrigin } from "@/lib/stripe";
import { allowAction, rateLimitMessage } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";

export const runtime = "nodejs";

/** Subscription states Stripe will still let us change the price on. */
const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

/**
 * If this account already has a live Stripe subscription, swap its price in
 * place instead of letting a second Checkout Session mint a second one.
 * Returns true when it handled the change (caller must not also open
 * Checkout); false when there was nothing to update and Checkout should run
 * as normal — that covers a brand-new subscriber, a fully churned one, and
 * (deliberately) any failure here: this must never be the reason a paying
 * customer can't complete an upgrade.
 */
async function tryUpdateExistingSubscription(
  supabase: SupabaseClient,
  userId: string,
  priceId: string,
): Promise<boolean> {
  if (!stripe) return false;
  try {
    const { data } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("user_id", userId)
      .maybeSingle();
    const subId = (data as { stripe_subscription_id: string | null } | null)?.stripe_subscription_id;
    if (!subId) return false;

    // Re-fetched live rather than trusted from our own row: a canceled
    // subscription's id stays on the row (the webhook's upsert only flips
    // `plan`/`status`, it never clears `stripe_subscription_id`), and only
    // Stripe's own current status tells the two apart.
    const sub = await stripe.subscriptions.retrieve(subId);
    if (!LIVE_STATUSES.has(sub.status)) return false;

    const item = sub.items.data[0];
    if (!item) return false;
    if (item.price.id === priceId) return true; // already on it — nothing to do, not an error

    // `always_invoice` bills the prorated difference immediately, off-session,
    // against the card on file — the customer clicked "upgrade" expecting the
    // new plan now, not at the next renewal. If that charge needs 3-D Secure
    // or the card fails, Stripe marks the subscription past_due and emails a
    // hosted invoice link; our webhook already handles that transition and
    // already emails the customer on invoice.payment_failed.
    await stripe.subscriptions.update(subId, {
      items: [{ id: item.id, price: priceId }],
      proration_behavior: "always_invoice",
    });
    return true;
  } catch (e) {
    Sentry.captureException(e, { extra: { where: "tryUpdateExistingSubscription", userId } });
    return false;
  }
}

const bodySchema = z.object({
  plan: z.enum(["basic", "pro", "max"]),
  // Absent means monthly, so an older client that doesn't know about annual
  // keeps working exactly as before.
  interval: z.enum(["month", "year"]).optional(),
});

// POST /api/checkout — start a Stripe Checkout session for a paid plan.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!stripeEnabled() || !stripe) {
    return NextResponse.json({ error: "Payments aren't enabled yet." }, { status: 503 });
  }

  // Nothing stopped a signed-in account from opening Checkout sessions in a
  // loop. It's not a hole in the money path — Stripe still has to be paid — but
  // it's noise in the payments account, and Stripe detecting abuse on us is a
  // worse outcome than a 429 here.
  if (!(await allowAction(user.id, "checkout"))) {
    return NextResponse.json({ error: rateLimitMessage("checkout") }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const interval = parsed.data.interval ?? "month";
  const priceId = priceIdForPlan(parsed.data.plan, interval);
  if (!priceId) {
    return NextResponse.json(
      { error: `No ${interval === "year" ? "annual" : "monthly"} price configured for ${parsed.data.plan}.` },
      { status: 503 },
    );
  }

  // An account that already has a live Stripe subscription must never go
  // through Checkout again — Checkout in subscription mode always mints a
  // BRAND NEW customer + subscription, since no `customer:` is passed. The one
  // path that already knew this (UpgradeModal's same-plan interval switch)
  // routes to the billing portal instead; every OTHER change of plan — the
  // single most common thing a paying customer does — fell straight through to
  // here and silently created a second, parallel subscription. The first one
  // was never touched: it stayed active in Stripe and kept billing forever,
  // invisible to us the moment our one-row-per-user `subscriptions` upsert
  // pointed at the new one instead.
  //
  // Enforced here rather than trusted from the client for the same reason
  // resolveTier ignores the client's tier choice — a UI button being disabled
  // is not a server-side guarantee.
  const upgraded = await tryUpdateExistingSubscription(supabase, user.id, priceId);
  if (upgraded) return NextResponse.json({ updated: true });

  // Our own public URL first. The Origin header is set by whoever made the
  // request, and it lands in success_url — so trusting it lets anyone build a
  // link that takes a customer to their page the instant the payment goes
  // through, at the moment the customer trusts us most. Same reasoning as the
  // `next` guard in /auth/callback.
  const origin = publicOrigin(req);

  // Both opt-in and default OFF: each depends on a Stripe Dashboard setting
  // that must exist first (a Terms of Service URL; Stripe Tax registrations).
  // Turning them on before that setup is done would make checkout start
  // failing outright, so they're separate switches from "Stripe is enabled".
  const requireTosConsent = process.env.STRIPE_REQUIRE_TOS_CONSENT === "true";
  const automaticTax = process.env.STRIPE_AUTOMATIC_TAX === "true";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: user.email ?? undefined,
      client_reference_id: user.id,
      subscription_data: { metadata: { user_id: user.id, plan: parsed.data.plan, interval } },
      metadata: { user_id: user.id, plan: parsed.data.plan, interval },
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/dashboard?checkout=cancel`,
      allow_promotion_codes: true,
      ...(requireTosConsent
        ? {
            consent_collection: { terms_of_service: "required" as const },
            custom_text: {
              terms_of_service_acceptance: {
                message: `I agree to Botforge's [Terms of Service](${origin}/terms).`,
              },
            },
          }
        : {}),
      ...(automaticTax
        ? {
            automatic_tax: { enabled: true },
            billing_address_collection: "required" as const,
          }
        : {}),
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    // Stripe's own message named the price id and what was wrong with it. Useful
    // to us, reconnaissance to anyone else — and it reached the person who
    // clicked Upgrade, who can do nothing with it either way.
    return serverError(e, "Couldn't start checkout. Try again in a moment.", "checkout", {
      plan: parsed.data.plan,
      interval,
    });
  }
}
