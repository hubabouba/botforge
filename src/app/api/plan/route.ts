import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPlan } from "@/lib/subscription";
import { hostingAccessAllowed } from "@/lib/hosting/config";

export const runtime = "nodejs";

// GET /api/plan — the signed-in user's current plan. Client-side gating reads
// this; server routes still re-check independently (never trust the client).
// `hostingBeta` tells the UI whether to surface the (private-beta) run controls.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ plan: "free", signedIn: false, hostingBeta: false });
  return NextResponse.json({
    plan: await getUserPlan(supabase, user),
    signedIn: true,
    hostingBeta: hostingAccessAllowed(user.email),
  });
}
