import { NextResponse } from "next/server";
import { authenticateRun } from "@/lib/hosting/internalAuth";
import { fetchProject } from "@/lib/workspace/serverStore";
import { isSafeProjectPath } from "@/lib/workspace/paths";

export const runtime = "nodejs";

// GET /api/internal/hosting/files — the runner pulls its project's files at boot.
// Authenticated by the run token (Bearer). Never returns a .env* file: secrets
// arrive as injected env vars and a dotenv file could shadow them. Traversal-
// shaped paths (pre-dating the write-side validation) are dropped too — the
// supervisors also contain writes on their side, this is defense in depth.
export async function GET(req: Request) {
  const ctx = await authenticateRun(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const project = await fetchProject(ctx.admin, ctx.dep.project_id);
  if (!project) return NextResponse.json({ error: "Project gone." }, { status: 404 });

  const files = project.files.filter((f) => {
    if (!isSafeProjectPath(f.path)) return false;
    const base = f.path.split("/").pop() ?? "";
    return base !== ".env" && !base.startsWith(".env.");
  });

  return NextResponse.json({ entry: project.entry || "main.py", files }, { headers: { "Cache-Control": "no-store" } });
}
