import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchProject } from "@/lib/workspace/serverStore";
import { getUserPlan } from "@/lib/subscription";
import { effectiveHostingPlan, hostingLimitsFor } from "@/lib/plan";
import { globalMachineCeiling, hostingAccessAllowed } from "@/lib/hosting/config";
import { generateRunToken, hashRunToken } from "@/lib/hosting/runToken";
import { flyConfig, type FlyConfig } from "@/lib/hosting/fly";
import { setStopped, appendLogs } from "@/lib/hosting/deployments";
import { decryptProjectSecrets, launchMachine } from "@/lib/hosting/launch";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

const requiredSecretFor = (platform: string) => (platform === "discord" ? "DISCORD_TOKEN" : "TELEGRAM_TOKEN");

// POST /api/hosting/projects/[id]/start — launch the project's bot on a Fly Machine.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Resolve once, reuse for both the access gate and the concurrency/budget
  // limits below — a single source of truth so they can never disagree.
  const plan = effectiveHostingPlan(await getUserPlan(supabase, user.id, user.email), user.email);
  if (!hostingAccessAllowed(plan)) {
    return NextResponse.json({ error: "Bot hosting isn't included in your plan." }, { status: 403 });
  }

  // Ownership + shape via the RLS client.
  const project = await fetchProject(supabase, id);
  if (!project) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Stage 1 supports Python Telegram bots only — say so honestly.
  if (project.platform !== "telegram" || project.language !== "python") {
    return NextResponse.json(
      { error: "Hosting is in beta and currently runs Python Telegram bots only." },
      { status: 400 },
    );
  }

  const required = requiredSecretFor(project.platform);

  // Fail fast if Fly isn't configured — BEFORE reserving a run slot below, so a
  // config error can never strand the deployment in 'starting'.
  let cfg: FlyConfig;
  try {
    cfg = flyConfig();
  } catch {
    return NextResponse.json({ error: "Hosting isn't fully configured on the server yet." }, { status: 503 });
  }

  // Decrypt this project's secrets via the admin client (ownership already
  // verified). This is the ONLY place ciphertext is read back out.
  const admin = createAdminClient();
  let env: Record<string, string>;
  try {
    env = await decryptProjectSecrets(admin, id);
  } catch {
    return NextResponse.json({ error: "A stored secret couldn't be read. Re-enter it and try again." }, { status: 500 });
  }
  if (!env[required]) {
    return NextResponse.json({ error: `Set a ${required} first.`, code: "missing_secret", required }, { status: 400 });
  }

  // Real plan limits (from the same `plan` the access gate already checked),
  // plus the platform-wide machine ceiling — all enforced atomically in the RPC.
  const limits = hostingLimitsFor(plan);
  const runToken = generateRunToken();
  const { data: reserve, error: rpcError } = await supabase.rpc("begin_project_run", {
    p_project_id: id,
    p_concurrent_limit: limits.concurrent,
    p_runtime_budget_seconds: limits.budgetSeconds,
    p_run_token_hash: hashRunToken(runToken),
    p_global_ceiling: globalMachineCeiling(),
  });
  if (rpcError) return NextResponse.json({ error: "Couldn't reserve a run slot." }, { status: 500 });

  const result = reserve as { ok?: boolean; error?: string };
  if (result?.error) {
    const map: Record<string, [number, string]> = {
      concurrent_limit: [409, "You've reached your plan's limit of bots running at once. Stop one first."],
      already_running: [409, "This bot is already running."],
      budget_exhausted: [402, "You've used up this month's hosting hours."],
      global_ceiling: [503, "Hosting is at capacity right now. Please try again in a few minutes."],
      not_found: [404, "Not found."],
      unauthorized: [401, "Not signed in."],
    };
    const [status, message] = map[result.error] ?? [500, "Couldn't start the bot."];
    return NextResponse.json({ error: message, code: result.error }, { status });
  }

  // From here on the slot is reserved: any failure must compensate by freeing it
  // (launchMachine guarantees it leaves no orphaned machine when it throws), or
  // the deployment would be stranded in 'starting'.
  const publicUrl = (process.env.BOTFORGE_PUBLIC_URL || new URL(req.url).origin).replace(/\/$/, "");
  try {
    await launchMachine(admin, cfg, {
      projectId: id,
      entry: project.entry || "main.py",
      env,
      runToken,
      publicUrl,
    });
    return NextResponse.json({ ok: true, status: "running" });
  } catch (e) {
    try {
      await setStopped(admin, id, "stopped");
      await appendLogs(admin, id, [{ stream: "system", line: `Failed to launch: ${(e as Error).message}` }]);
    } catch {
      /* status poll's stale-start heal will free the slot */
    }
    return NextResponse.json({ error: "Couldn't launch the bot. Please try again." }, { status: 502 });
  }
}
