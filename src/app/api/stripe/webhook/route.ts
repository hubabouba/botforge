import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { planForPriceId } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPaymentFailedEmail, sendSubscriptionEndedEmail } from "@/lib/email";

export const runtime = "nodejs";

// Stripe needs the raw, unparsed body to verify the signature.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Stripe not configured." }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (e) {
    return NextResponse.json({ error: `Invalid signature: ${(e as Error).message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await upsert(sub, session.metadata?.user_id ?? sub.metadata?.user_id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        // Re-fetch instead of trusting the embedded object: Stripe doesn't
        // guarantee delivery order, so an out-of-order retry could otherwise
        // overwrite a newer state with a stale one. (Subscriptions stay
        // retrievable after cancellation — they just carry status "canceled".)
        const stub = event.data.object as Stripe.Subscription;
        const sub = await stripe.subscriptions.retrieve(stub.id);
        await upsert(sub, sub.metadata?.user_id);
        // Tell the user when their paid plan actually ends (back on Free).
        if (event.type === "customer.subscription.deleted") {
          const to = await emailForUser(sub.metadata?.user_id);
          if (to) await sendSubscriptionEndedEmail(to);
        }
        break;
      }
      case "invoice.payment_failed": {
        // Make the failure visible two ways: an ops signal to Sentry, and a
        // heads-up email to the customer (Stripe will keep retrying, but they
        // should know to fix their card). The subscription's own status
        // transition (-> past_due/unpaid) still flows through the handler above.
        const invoice = event.data.object as Stripe.Invoice;
        const invoiceSub = invoice.parent?.subscription_details?.subscription;
        const subId = typeof invoiceSub === "string" ? invoiceSub : invoiceSub?.id;
        const userId = subId ? (await stripe.subscriptions.retrieve(subId)).metadata?.user_id : undefined;
        Sentry.captureMessage("Stripe invoice payment failed", {
          level: "warning",
          extra: {
            invoiceId: invoice.id,
            customerId: typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id,
            subscriptionId: subId,
            userId,
            amountDue: invoice.amount_due,
          },
        });
        const to = invoice.customer_email ?? (await emailForUser(userId));
        if (to) await sendPaymentFailedEmail(to);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    Sentry.captureException(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/** Resolve a user's email from their id via the admin client (for notifications). */
async function emailForUser(userId?: string | null): Promise<string | null> {
  if (!userId) return null;
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch {
    return null;
  }
}

/** Read the subscription's period end (unix seconds) defensively across API versions. */
function periodEndIso(sub: Stripe.Subscription): string | null {
  const top = (sub as unknown as { current_period_end?: number }).current_period_end;
  const item = sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined;
  const secs = top ?? item?.current_period_end;
  return secs ? new Date(secs * 1000).toISOString() : null;
}

async function upsert(sub: Stripe.Subscription, userId?: string | null) {
  if (!userId) return; // nothing to key on
  const priceId = sub.items?.data?.[0]?.price?.id;
  const mapped = planForPriceId(priceId);
  const canceled = sub.status === "canceled" || sub.status === "incomplete_expired";
  // An ACTIVE subscription whose price doesn't map to a plan means the
  // STRIPE_PRICE_* env is missing/rotated out of sync — the customer paid and
  // would silently land on free. Fail toward free (safe for the platform) but
  // make the misconfiguration impossible to miss.
  if (mapped === null && !canceled) {
    Sentry.captureMessage("Stripe price id doesn't map to a plan — paying subscriber written as free", {
      level: "error",
      extra: { priceId, subscriptionId: sub.id, status: sub.status, userId },
    });
  }
  const plan = mapped ?? "free";

  const admin = createAdminClient();
  await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      plan: canceled ? "free" : plan,
      status: sub.status,
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
      stripe_subscription_id: sub.id,
      current_period_end: periodEndIso(sub),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}
