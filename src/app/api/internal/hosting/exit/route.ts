import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRun } from "@/lib/hosting/internalAuth";
import { appendLogs, recordCrash, setStopped } from "@/lib/hosting/deployments";
import { destroyMachine, flyConfig } from "@/lib/hosting/fly";

export const runtime = "nodejs";

const schema = z.object({ code: z.number().int() });

// POST /api/internal/hosting/exit — the runner reports its process exited.
// A bot is meant to run forever, so any exit is a crash UNLESS we were already
// stopping it (user pressed Stop). Either way the Machine is torn down so nothing
// lingers (v1 recreates a fresh Machine on the next Start anyway).
export async function POST(req: Request) {
  const ctx = await authenticateRun(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid." }, { status: 400 });

  const { admin, dep } = ctx;

  // Best-effort teardown — never let a Fly hiccup block recording the exit.
  if (dep.provider_machine_id) {
    try {
      await destroyMachine(flyConfig(), dep.provider_machine_id);
    } catch {
      /* reconcile / next start will clean it up */
    }
  }

  // Idempotent: only record from an active state, so a status-poll reconcile
  // that already handled this exit can't double-count the crash / restart.
  if (dep.status === "stopping") {
    await setStopped(admin, dep.project_id, "stopped");
  } else if (dep.status === "running" || dep.status === "starting") {
    await appendLogs(admin, dep.project_id, [
      { stream: "system", line: `Bot stopped unexpectedly (exit ${parsed.data.code}).` },
    ]);
    await recordCrash(admin, dep);
  }

  return NextResponse.json({ ok: true });
}
