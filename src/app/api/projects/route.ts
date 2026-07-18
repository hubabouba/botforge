import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserPlan } from "@/lib/subscription";
import { projectLimit } from "@/lib/plan";
import { fetchProjectSummaries } from "@/lib/workspace/serverStore";
import { isSafeProjectPath } from "@/lib/workspace/paths";

export const runtime = "nodejs";

const pathSchema = z.string().max(300).refine(isSafeProjectPath, "unsafe path");
const fileSchema = z.object({ path: pathSchema, content: z.string().max(500000) });
const createSchema = z.object({
  name: z.string().max(120),
  platform: z.string().max(20),
  language: z.string().max(20),
  description: z.string().max(4000).default(""),
  entry: z
    .string()
    .max(300)
    .refine((p) => p === "" || isSafeProjectPath(p), "unsafe path")
    .default(""),
  files: z.array(fileSchema).max(200),
  folders: z.array(pathSchema).max(200).optional(),
});

// Pro's cap is Infinity, which Postgres can't take — send -1 for "unlimited".
function limitParam(limit: number): number {
  return Number.isFinite(limit) ? limit : -1;
}

// GET /api/projects — the signed-in user's projects (newest first).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    return NextResponse.json({ projects: await fetchProjectSummaries(supabase) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Failed to load projects." }, { status: 500 });
  }
}

// POST /api/projects — create a project (atomic, enforces the per-plan cap).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const plan = await getUserPlan(supabase, user.id, user.email);
  const spec = parsed.data;

  const { data, error } = await supabase.rpc("create_project", {
    p_limit: limitParam(projectLimit(plan)),
    p_name: spec.name,
    p_platform: spec.platform,
    p_language: spec.language,
    p_description: spec.description,
    p_entry: spec.entry,
    p_files: spec.files,
    p_folders: spec.folders ?? [],
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data && (data as { error?: string }).error === "limit") {
    return NextResponse.json({ error: "limit", plan }, { status: 403 });
  }
  return NextResponse.json({ project: data });
}
