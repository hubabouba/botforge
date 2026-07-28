import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPlan } from "@/lib/subscription";
import { effectiveHostingPlan } from "@/lib/plan";
import { hostingAccessAllowed } from "@/lib/hosting/config";
import { annualBillingEnabled } from "@/lib/stripe";

export const runtime = "nodejs";

// GET /api/plan — the signed-in user's current plan. Client-side gating reads
// this; server routes still re-check independently (never trust the client).
// `hostingAvailable` tells the UI whether to surface the run controls (a real
// plan check now, not a beta allow-list). `annualBilling` says whether every
// annual Stripe price is configured — it comes from here rather than a second
// NEXT_PUBLIC_ flag so the toggle can't be switched on while a price is still
// missing, which would 503 at checkout.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const annualBilling = annualBillingEnabled();
  if (!user) {
    return NextResponse.json({ plan: "free", signedIn: false, hostingAvailable: false, annualBilling });
  }
  const plan = await getUserPlan(supabase, user.id, user.email);
  return NextResponse.json({
    plan,
    signedIn: true,
    hostingAvailable: hostingAccessAllowed(effectiveHostingPlan(plan, user.email)),
    annualBilling,
  });
}
