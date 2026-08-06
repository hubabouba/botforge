import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPlan } from "@/lib/subscription";
import { projectLimit } from "@/lib/plan";
import { dbError } from "@/lib/apiError";
import { allowAction, rateLimitMessage } from "@/lib/rateLimit";

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

  // Pro and Max have no project-count cap at all (PROJECT_LIMIT is Infinity),
  // so nothing else stops this from repeating: each call copies up to 200
  // files of up to 100k chars, and duplicate_project's own limit check is a
  // no-op for those tiers (p_limit arrives as -1, meaning unlimited). A loop —
  // deliberate or a client-side bug firing the button repeatedly — has no
  // other backstop.
  if (!(await allowAction(user.id, "project.duplicate"))) {
    return NextResponse.json({ error: rateLimitMessage("project.duplicate") }, { status: 429 });
  }

  const plan = await getUserPlan(supabase, user.id, user.email);
  const limit = projectLimit(plan);

  // Service-role, same reasoning as create_project: a cap the caller supplies
  // isn't a cap. The RPC re-checks that p_source_id belongs to p_user_id, which
  // it has to — RLS is bypassed in there.
  const { data, error } = await createAdminClient().rpc("duplicate_project", {
    p_user_id: user.id,
    p_limit: Number.isFinite(limit) ? limit : -1,
    p_source_id: id,
    p_new_name: null,
  });

  if (error) return dbError(error, "Couldn't duplicate the project. Try again.", "duplicate_project");
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if ((data as { error?: string }).error === "limit") {
    return NextResponse.json({ error: "limit", plan }, { status: 403 });
  }
  return NextResponse.json({ project: data });
}
