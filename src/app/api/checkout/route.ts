import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { stripe, stripeEnabled, priceIdForPlan } from "@/lib/stripe";

export const runtime = "nodejs";

const bodySchema = z.object({ plan: z.enum(["basic", "pro"]) });

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

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const priceId = priceIdForPlan(parsed.data.plan);
  if (!priceId) {
    return NextResponse.json({ error: `No price configured for ${parsed.data.plan}.` }, { status: 503 });
  }

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;

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
      subscription_data: { metadata: { user_id: user.id, plan: parsed.data.plan } },
      metadata: { user_id: user.id, plan: parsed.data.plan },
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
