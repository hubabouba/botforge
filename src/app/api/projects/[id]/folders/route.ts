import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fetchProject } from "@/lib/workspace/serverStore";
import { isSafeProjectPath } from "@/lib/workspace/paths";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// Folder paths may arrive with a trailing slash (stripped below) — validate the
// stripped form.
const pathSchema = z
  .string()
  .max(300)
  .refine((p) => isSafeProjectPath(p.replace(/\/+$/, "")), "unsafe path");
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), path: pathSchema }),
  z.object({ action: z.literal("delete"), path: pathSchema }),
]);

// POST /api/projects/[id]/folders — folder operations (add | delete).
// "delete" removes the folder and everything under it, but keeps at least one
// file in the project and repoints the entry file if needed (mirrors the store).
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const op = parsed.data;
  const clean = op.path.replace(/\/+$/, "");

  try {
    if (op.action === "add") {
      const { error } = await supabase
        .from("project_folders")
        .upsert({ project_id: id, path: clean }, { onConflict: "project_id,path", ignoreDuplicates: true });
      if (error) throw error;
      return NextResponse.json({ project: await fetchProject(supabase, id) });
    }

    // delete
    const project = await fetchProject(supabase, id);
    if (!project) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const prefix = `${clean}/`;
    const inFolder = (p: string) => p === clean || p.startsWith(prefix);
    const filesToDelete = project.files.filter((f) => inFolder(f.path)).map((f) => f.path);
    const survivors = project.files.filter((f) => !inFolder(f.path)).map((f) => f.path).sort();

    // Only remove files if at least one would remain (never empty the project).
    if (survivors.length >= 1 && filesToDelete.length > 0) {
      const { error } = await supabase
        .from("project_files")
        .delete()
        .eq("project_id", id)
        .in("path", filesToDelete);
      if (error) throw error;
      if (project.entry && !survivors.includes(project.entry)) {
        await supabase.from("projects").update({ entry: survivors[0] }).eq("id", id);
      }
    }

    const foldersToDelete = (project.folders ?? []).filter(inFolder);
    if (foldersToDelete.length > 0) {
      const { error } = await supabase
        .from("project_folders")
        .delete()
        .eq("project_id", id)
        .in("path", foldersToDelete);
      if (error) throw error;
    }

    return NextResponse.json({ project: await fetchProject(supabase, id) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Folder operation failed." }, { status: 500 });
  }
}
