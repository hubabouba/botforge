import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { stripe, stripeEnabled, priceIdForPlan, publicOrigin } from "@/lib/stripe";
import { allowAction, rateLimitMessage } from "@/lib/rateLimit";

export const runtime = "nodejs";

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
    return NextResponse.json({ error: (e as Error).message || "Checkout failed." }, { status: 500 });
  }
}
