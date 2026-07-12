import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPlan } from "@/lib/subscription";
import { projectLimit } from "@/lib/plan";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/projects/[id]/duplicate — copy the project (enforces the per-plan cap).
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const plan = await getUserPlan(supabase, user.id, user.email);
  const limit = projectLimit(plan);

  const { data, error } = await supabase.rpc("duplicate_project", {
    p_limit: Number.isFinite(limit) ? limit : -1,
    p_source_id: id,
    p_new_name: null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if ((data as { error?: string }).error === "limit") {
    return NextResponse.json({ error: "limit", plan }, { status: 403 });
  }
  return NextResponse.json({ project: data });
}
