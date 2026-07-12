import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { flyConfig, destroyMachine } from "@/lib/hosting/fly";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/account/delete — irreversibly erase the signed-in user and all their
// data (GDPR Art. 17). Deleting the auth user cascades every public row
// (projects, files, secrets, deployments, logs, usage, subscription) via the
// `on delete cascade` FKs. Two things live OUTSIDE Postgres and must be torn
// down first, while we can still read the rows: the Stripe customer (holds PII
// and would keep billing) and any running Fly Machine (a billable orphan).
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();

  // 1. Tear down any Fly Machines this user still has running — the DB cascade
  //    can't reach an external VM, and a leaked one keeps costing money.
  try {
    const cfg = flyConfig();
    const { data: deps } = await admin
      .from("project_deployments")
      .select("provider_machine_id")
      .eq("user_id", user.id)
      .not("provider_machine_id", "is", null);
    for (const d of (deps as { provider_machine_id: string | null }[] | null) ?? []) {
      if (d.provider_machine_id) {
        try {
          await destroyMachine(cfg, d.provider_machine_id);
        } catch {
          /* best effort — Fly may already have reaped it */
        }
      }
    }
  } catch {
    /* hosting not configured, or no deployments — nothing to tear down */
  }

  // 2. Delete the Stripe customer (cancels active subscriptions and removes the
  //    stored PII/payment method). Best effort — never block erasure on Stripe.
  try {
    if (stripe) {
      const { data: sub } = await admin
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const customerId = (sub as { stripe_customer_id: string | null } | null)?.stripe_customer_id;
      if (customerId) await stripe.customers.del(customerId);
    }
  } catch {
    /* best effort */
  }

  // 3. Delete the auth user — cascades all of their Postgres rows.
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ error: "Couldn't delete the account. Please try again." }, { status: 500 });
  }

  // Invalidate the now-orphaned session cookie on this device.
  try {
    await supabase.auth.signOut();
  } catch {
    /* the user is already gone; the cookie is inert */
  }

  return NextResponse.json({ ok: true });
}
