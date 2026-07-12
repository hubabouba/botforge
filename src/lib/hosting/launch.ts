/**
 * Bringing a bot's Machine up — the steps shared by the manual Start route and
 * the crash auto-restart path. Kept in one module so the two launch flows can't
 * quietly drift apart (same env contract, same "one machine per bot" teardown).
 *
 * Trusted, admin-client-only code: the ONLY place ciphertext is decrypted, and
 * the caller has already verified ownership / reserved the run slot.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "./secrets";
import { createRunMachine, destroyMachine, type FlyConfig } from "./fly";
import { appendLogs, getDeployment, setRunning } from "./deployments";

/**
 * Decrypt every stored secret for a project into a plain env map. Throws if any
 * row can't be decrypted (wrong/rotated key) — callers surface that distinctly.
 */
export async function decryptProjectSecrets(
  admin: SupabaseClient,
  projectId: string,
): Promise<Record<string, string>> {
  const { data: secretRows } = await admin
    .from("project_secrets")
    .select("key_name, ciphertext, nonce, key_version")
    .eq("project_id", projectId);

  const env: Record<string, string> = {};
  for (const row of secretRows ?? []) {
    env[row.key_name] = decryptSecret({ ciphertext: row.ciphertext, nonce: row.nonce, keyVersion: row.key_version });
  }
  return env;
}

export interface LaunchInput {
  projectId: string;
  /** Entry file to exec, e.g. "main.py". */
  entry: string;
  /** Decrypted bot secrets (e.g. TELEGRAM_TOKEN) to inject as real env vars. */
  env: Record<string, string>;
  /** Fresh run-scoped bearer token (raw; only its hash is stored). */
  runToken: string;
  /** Public base URL the Machine calls back to (files / logs / exit). */
  publicUrl: string;
}

/**
 * Tear down any prior Machine for this project (exactly one per running bot),
 * create+start a fresh one with the run's env, and mark the deployment running.
 * Returns the new machine id.
 *
 * Guarantees no leaked Machine on failure: if the post-create status write
 * fails, the just-created Machine is destroyed before the error propagates — so
 * a throw always means "nothing left running", and the caller only has to free
 * the reserved slot.
 */
export async function launchMachine(admin: SupabaseClient, cfg: FlyConfig, input: LaunchInput): Promise<string> {
  const prev = await getDeployment(admin, input.projectId);
  if (prev?.provider_machine_id) {
    try {
      await destroyMachine(cfg, prev.provider_machine_id);
    } catch {
      /* best effort — reconcile will catch a straggler */
    }
  }

  const machine = await createRunMachine(cfg, {
    name: `bot-${input.projectId.slice(0, 8)}-${Date.now().toString(36)}`,
    env: {
      ...input.env,
      BOTFORGE_PUBLIC_URL: input.publicUrl,
      BOTFORGE_RUN_TOKEN: input.runToken,
      BOTFORGE_ENTRY: input.entry,
    },
  });

  try {
    await setRunning(admin, input.projectId, machine.id, machine.region ?? null);
  } catch (e) {
    try {
      await destroyMachine(cfg, machine.id);
    } catch {
      /* reconcile will catch it */
    }
    throw e;
  }

  await appendLogs(admin, input.projectId, [{ stream: "system", line: "Launching bot on Botforge hosting…" }]);
  return machine.id;
}
