import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fetchProject } from "@/lib/workspace/serverStore";

export const runtime = "nodejs";

// Both fields optional: renaming and saving the build plan use the same route.
const patchSchema = z.object({
  name: z.string().max(120).optional(),
  plan: z.string().max(20000).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

// GET /api/projects/[id] — one project with its files & folders.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const project = await fetchProject(supabase, id);
    if (!project) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ project });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Failed to load project." }, { status: 500 });
  }
}

// PATCH /api/projects/[id] — rename the project.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const patch: Record<string, string> = {};
  const name = parsed.data.name?.trim();
  if (name) patch.name = name;
  // The plan is set to "" to clear it, so presence — not truthiness — decides.
  if (parsed.data.plan !== undefined) patch.plan = parsed.data.plan;

  if (Object.keys(patch).length) {
    patch.updated_at = new Date().toISOString();
    const { error } = await supabase.from("projects").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const project = await fetchProject(supabase, id);
  if (!project) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ project });
}

// DELETE /api/projects/[id] — delete the project (files/folders cascade).
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // RLS turns "someone else's project" into "zero rows matched", not an error —
  // so without checking what came back, deleting a stranger's id answers
  // `{ ok: true }` and the UI happily drops a card that still exists. Ask for
  // the deleted rows and report a miss as a 404.
  const { data, error } = await supabase.from("projects").delete().eq("id", id).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
