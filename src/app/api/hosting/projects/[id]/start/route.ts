import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchProject } from "@/lib/workspace/serverStore";
import { hostingAccessAllowed } from "@/lib/hosting/config";
import { generateRunToken, hashRunToken } from "@/lib/hosting/runToken";
import { decryptSecret } from "@/lib/hosting/secrets";
import { flyConfig, createRunMachine, destroyMachine } from "@/lib/hosting/fly";
import { getDeployment, setRunning, setStopped, appendLogs } from "@/lib/hosting/deployments";

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
  if (!hostingAccessAllowed(user.email)) {
    return NextResponse.json({ error: "Bot hosting isn't available on your account yet." }, { status: 403 });
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

  // Decrypt this project's secrets via the admin client (ownership already
  // verified). This is the ONLY place ciphertext is read back out.
  const admin = createAdminClient();
  const { data: secretRows } = await admin
    .from("project_secrets")
    .select("key_name, ciphertext, nonce, key_version")
    .eq("project_id", id);

  const env: Record<string, string> = {};
  try {
    for (const row of secretRows ?? []) {
      env[row.key_name] = decryptSecret({ ciphertext: row.ciphertext, nonce: row.nonce, keyVersion: row.key_version });
    }
  } catch {
    return NextResponse.json({ error: "A stored secret couldn't be read. Re-enter it and try again." }, { status: 500 });
  }
  if (!env[required]) {
    return NextResponse.json({ error: `Set a ${required} first.`, code: "missing_secret", required }, { status: 400 });
  }

  // Beta limits: 1 concurrent bot (so the concurrency guard is exercisable) and
  // unmetered runtime during the trial. Stage 2 swaps in real plan limits.
  const runToken = generateRunToken();
  const { data: reserve, error: rpcError } = await supabase.rpc("begin_project_run", {
    p_project_id: id,
    p_concurrent_limit: 1,
    p_runtime_budget_seconds: -1,
    p_run_token_hash: hashRunToken(runToken),
  });
  if (rpcError) return NextResponse.json({ error: "Couldn't reserve a run slot." }, { status: 500 });

  const result = reserve as { ok?: boolean; error?: string };
  if (result?.error) {
    const map: Record<string, [number, string]> = {
      concurrent_limit: [409, "You already have a bot running. Stop it first (beta allows one at a time)."],
      already_running: [409, "This bot is already running."],
      budget_exhausted: [402, "You've used up this month's hosting hours."],
      not_found: [404, "Not found."],
      unauthorized: [401, "Not signed in."],
    };
    const [status, message] = map[result.error] ?? [500, "Couldn't start the bot."];
    return NextResponse.json({ error: message, code: result.error }, { status });
  }

  // Tear down any previous machine so exactly one exists per running bot.
  const prev = await getDeployment(admin, id);
  const cfg = flyConfig();
  if (prev?.provider_machine_id) {
    try {
      await destroyMachine(cfg, prev.provider_machine_id);
    } catch {
      /* best effort */
    }
  }

  const publicUrl = (process.env.BOTFORGE_PUBLIC_URL || new URL(req.url).origin).replace(/\/$/, "");
  try {
    const machine = await createRunMachine(cfg, {
      name: `bot-${id.slice(0, 8)}-${Date.now().toString(36)}`,
      env: {
        ...env,
        BOTFORGE_PUBLIC_URL: publicUrl,
        BOTFORGE_RUN_TOKEN: runToken,
        BOTFORGE_ENTRY: project.entry || "main.py",
      },
    });
    await setRunning(admin, id, machine.id, machine.region ?? null);
    await appendLogs(admin, id, [{ stream: "system", line: "Launching bot on Botforge hosting…" }]);
    return NextResponse.json({ ok: true, status: "running" });
  } catch (e) {
    // Fly refused after we reserved — compensate so the slot is freed.
    await setStopped(admin, id, "stopped");
    await appendLogs(admin, id, [{ stream: "system", line: `Failed to launch: ${(e as Error).message}` }]);
    return NextResponse.json({ error: "Couldn't launch the bot. Please try again." }, { status: 502 });
  }
}
