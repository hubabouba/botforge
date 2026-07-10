/**
 * Server-side deployment data helpers (service-role admin client).
 *
 * These run in trusted, non-browser code only — the control-plane routes and the
 * internal callback routes. They bypass RLS deliberately: the internal routes
 * are authenticated by a run token (the caller is a Machine, not a user session),
 * and the control-plane routes have already verified ownership via the RLS
 * client / begin_project_run before calling here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeploymentStatus } from "./types";
import { getMachineState, type FlyConfig, type FlyMachineState } from "./fly";

export interface DeploymentRow {
  project_id: string;
  user_id: string;
  status: DeploymentStatus;
  provider_machine_id: string | null;
  region: string | null;
  restart_count: number;
  run_token_hash: string | null;
  last_started_at: string | null;
  last_stopped_at: string | null;
  last_crash_at: string | null;
  updated_at: string;
}

const COLS =
  "project_id, user_id, status, provider_machine_id, region, restart_count, run_token_hash, last_started_at, last_stopped_at, last_crash_at, updated_at";

export async function getDeployment(admin: SupabaseClient, projectId: string): Promise<DeploymentRow | null> {
  const { data } = await admin.from("project_deployments").select(COLS).eq("project_id", projectId).maybeSingle();
  return (data as DeploymentRow | null) ?? null;
}

/** Look up a deployment by the SHA-256 of a presented run token (internal routes). */
export async function getDeploymentByRunHash(admin: SupabaseClient, hash: string): Promise<DeploymentRow | null> {
  const { data } = await admin.from("project_deployments").select(COLS).eq("run_token_hash", hash).maybeSingle();
  return (data as DeploymentRow | null) ?? null;
}

export async function setRunning(
  admin: SupabaseClient,
  projectId: string,
  machineId: string,
  region: string | null,
): Promise<void> {
  await admin
    .from("project_deployments")
    .update({ status: "running", provider_machine_id: machineId, region, updated_at: new Date().toISOString() })
    .eq("project_id", projectId);
}

/** Compensating write when Fly refuses the launch after begin_project_run reserved. */
export async function setStopped(admin: SupabaseClient, projectId: string, status: DeploymentStatus = "stopped"): Promise<void> {
  await admin
    .from("project_deployments")
    .update({ status, last_stopped_at: new Date().toISOString(), run_token_hash: null, updated_at: new Date().toISOString() })
    .eq("project_id", projectId);
}

/** The bot process exited on its own — record as a crash (restart is manual in v1). */
export async function recordCrash(admin: SupabaseClient, projectId: string, restartCount: number): Promise<void> {
  await admin
    .from("project_deployments")
    .update({
      status: "crashed",
      last_crash_at: new Date().toISOString(),
      restart_count: restartCount + 1,
      run_token_hash: null,
      updated_at: new Date().toISOString(),
    })
    .eq("project_id", projectId);
}

/**
 * Scrub secret-shaped substrings from a log line before it's ever stored.
 * Bot libraries (e.g. python-telegram-bot via httpx) log full request URLs that
 * embed the token, which would otherwise land in project_logs in plaintext and
 * defeat the whole point of encrypting it. Redact by shape, provider-agnostic.
 */
export function redactSecrets(line: string): string {
  return line
    // Telegram bot token: <digits>:<35+ url-safe chars> (also matches inside /bot<token>/)
    .replace(/\d{6,12}:[A-Za-z0-9_-]{30,}/g, "[REDACTED]")
    // Discord bot token: base64.base64.base64-ish, dot-separated
    .replace(/[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,}/g, "[REDACTED]");
}

export async function appendLogs(
  admin: SupabaseClient,
  projectId: string,
  lines: { stream: string; line: string }[],
): Promise<void> {
  if (!lines.length) return;
  await admin
    .from("project_logs")
    .insert(lines.map((l) => ({ project_id: projectId, stream: l.stream, line: redactSecrets(l.line) })));
}

/**
 * Lazy per-project reconcile: when the user polls status and our DB says the bot
 * is active, cross-check the real Machine state and correct drift (e.g. the
 * self-reported exit never arrived). Cheap — one Fly API call per poll, only
 * while active. Returns the (possibly updated) status.
 */
export async function reconcileWithFly(
  admin: SupabaseClient,
  cfg: FlyConfig,
  dep: DeploymentRow,
): Promise<DeploymentStatus> {
  if (!dep.provider_machine_id) return dep.status;
  if (dep.status !== "starting" && dep.status !== "running" && dep.status !== "stopping") return dep.status;

  let state: FlyMachineState | null;
  try {
    state = await getMachineState(cfg, dep.provider_machine_id);
  } catch {
    return dep.status; // transient Fly error — don't flip state on a blip
  }

  const next = mapFlyState(dep.status, state);
  if (next && next !== dep.status) {
    if (next === "crashed") await recordCrash(admin, dep.project_id, dep.restart_count);
    else await setStopped(admin, dep.project_id, next);
    return next;
  }
  return dep.status;
}

/** Decide our status from (current status, live Fly state). null = no change. */
function mapFlyState(current: DeploymentStatus, state: FlyMachineState | null): DeploymentStatus | null {
  if (state === "started") return current === "running" ? null : "running";
  if (state === null || state === "destroyed" || state === "destroying") {
    // Machine is gone. If we were tearing down it's a clean stop, else a crash.
    return current === "stopping" ? "stopped" : "crashed";
  }
  if (state === "stopped" || state === "suspended") {
    // restart.policy="no" → a stopped machine means the process exited.
    return current === "stopping" ? "stopped" : "crashed";
  }
  return null; // created/starting/stopping/replacing → in-flight, leave as-is
}
