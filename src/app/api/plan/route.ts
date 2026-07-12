import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPlan } from "@/lib/subscription";
import { effectiveHostingPlan } from "@/lib/plan";
import { hostingAccessAllowed } from "@/lib/hosting/config";

export const runtime = "nodejs";

// GET /api/plan — the signed-in user's current plan. Client-side gating reads
// this; server routes still re-check independently (never trust the client).
// `hostingAvailable` tells the UI whether to surface the run controls (a real
// plan check now, not a beta allow-list).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ plan: "free", signedIn: false, hostingAvailable: false });
  const plan = await getUserPlan(supabase, user.id, user.email);
  return NextResponse.json({
    plan,
    signedIn: true,
    hostingAvailable: hostingAccessAllowed(effectiveHostingPlan(plan, user.email)),
  });
}
