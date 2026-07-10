import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRun } from "@/lib/hosting/internalAuth";
import { appendLogs } from "@/lib/hosting/deployments";

export const runtime = "nodejs";

const schema = z.object({
  lines: z
    .array(z.object({ stream: z.enum(["stdout", "stderr", "system"]), line: z.string().max(2000) }))
    .max(200),
});

// POST /api/internal/hosting/logs — the runner ships batched stdout/stderr here.
// The DB trigger ring-buffers them per project.
export async function POST(req: Request) {
  const ctx = await authenticateRun(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid." }, { status: 400 });

  await appendLogs(ctx.admin, ctx.dep.project_id, parsed.data.lines);
  return NextResponse.json({ ok: true });
}
