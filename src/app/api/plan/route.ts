import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlan } from "@/lib/plan";

export const runtime = "nodejs";

// GET /api/plan — the signed-in user's current plan. Client-side gating reads
// this; server routes still re-check independently (never trust the client).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ plan: "free", signedIn: false });
  return NextResponse.json({ plan: getPlan(user.email), signedIn: true });
}
