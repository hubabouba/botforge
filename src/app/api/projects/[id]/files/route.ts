import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fetchProject } from "@/lib/workspace/serverStore";
import { isSafeProjectPath } from "@/lib/workspace/paths";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const pathSchema = z.string().max(300).refine(isSafeProjectPath, "unsafe path");
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("write"), path: pathSchema, content: z.string().max(500000) }),
  z.object({ action: z.literal("add"), path: pathSchema, content: z.string().max(500000).optional() }),
  z.object({ action: z.literal("rename"), oldPath: pathSchema, newPath: pathSchema }),
  z.object({ action: z.literal("delete"), path: pathSchema }),
]);

// POST /api/projects/[id]/files — file operations (write | add | rename | delete).
// "write" is the hot autosave path: a single UPDATE, no project re-fetch.
// The others are infrequent and return the refreshed project for the client to render.
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

  try {
    if (op.action === "write") {
      const { error } = await supabase
        .from("project_files")
        .update({ content: op.content, updated_at: new Date().toISOString() })
        .eq("project_id", id)
        .eq("path", op.path);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (op.action === "add") {
      const { error } = await supabase
        .from("project_files")
        .upsert(
          { project_id: id, path: op.path, content: op.content ?? "" },
          { onConflict: "project_id,path", ignoreDuplicates: true },
        );
      if (error) throw error;
      return NextResponse.json({ project: await fetchProject(supabase, id) });
    }

    // rename & delete need the current file set (last-file guard, entry repoint).
    const project = await fetchProject(supabase, id);
    if (!project) return NextResponse.json({ error: "Not found." }, { status: 404 });

    if (op.action === "rename") {
      const exists = project.files.some((f) => f.path === op.oldPath);
      const taken = project.files.some((f) => f.path === op.newPath);
      if (exists && !taken) {
        const { error } = await supabase
          .from("project_files")
          .update({ path: op.newPath })
          .eq("project_id", id)
          .eq("path", op.oldPath);
        if (error) throw error;
        if (project.entry === op.oldPath) {
          await supabase.from("projects").update({ entry: op.newPath }).eq("id", id);
        }
      }
      return NextResponse.json({ project: await fetchProject(supabase, id) });
    }

    // delete — keep at least one file, repoint entry if it pointed at the deleted file.
    if (project.files.length > 1 && project.files.some((f) => f.path === op.path)) {
      const { error } = await supabase
        .from("project_files")
        .delete()
        .eq("project_id", id)
        .eq("path", op.path);
      if (error) throw error;
      if (project.entry === op.path) {
        const nextEntry = project.files.find((f) => f.path !== op.path)?.path ?? "";
        await supabase.from("projects").update({ entry: nextEntry }).eq("id", id);
      }
    }
    return NextResponse.json({ project: await fetchProject(supabase, id) });
  } catch (e) {
    const message = (e as Error).message || "File operation failed.";
    // The DB trigger caps files per project — surface it as an honest 400.
    if (message.includes("project_file_limit")) {
      return NextResponse.json({ error: "This project has reached its 200-file limit." }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
