import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe, stripeEnabled, publicOrigin } from "@/lib/stripe";
import { allowAction, rateLimitMessage } from "@/lib/rateLimit";

export const runtime = "nodejs";

// POST /api/billing-portal — open Stripe's customer portal so the user can
// update payment details or cancel (cancel-at-period-end).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!stripeEnabled() || !stripe) {
    return NextResponse.json({ error: "Payments aren't enabled yet." }, { status: 503 });
  }

  if (!(await allowAction(user.id, "billing.portal"))) {
    return NextResponse.json({ error: rateLimitMessage("billing.portal") }, { status: 429 });
  }

  const { data } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const customerId = data?.stripe_customer_id as string | undefined;
  if (!customerId) {
    return NextResponse.json({ error: "No active subscription to manage." }, { status: 400 });
  }

  // Our own URL, not the caller's Origin header — see publicOrigin.
  const origin = publicOrigin(req);
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/dashboard`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Portal failed." }, { status: 500 });
  }
}
