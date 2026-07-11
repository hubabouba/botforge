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
import { hostingLimitsFor } from "../plan";
import type { DeploymentStatus } from "./types";
import { destroyMachine, getMachineState, type FlyConfig, type FlyMachineState } from "./fly";

export interface DeploymentRow {
  project_id: string;
  user_id: string;
  status: DeploymentStatus;
  provider_machine_id: string | null;
  region: string | null;
  restart_count: number;
  run_token_hash: string | null;
  last_start_attempt_at: string | null;
  last_started_at: string | null;
  last_stopped_at: string | null;
  last_crash_at: string | null;
  last_accrued_at: string | null;
  updated_at: string;
}

const COLS =
  "project_id, user_id, status, provider_machine_id, region, restart_count, run_token_hash, last_start_attempt_at, last_started_at, last_stopped_at, last_crash_at, last_accrued_at, updated_at";

/** Every row currently occupying a machine slot — the reconcile cron's work list. */
export async function getActiveDeployments(admin: SupabaseClient): Promise<DeploymentRow[]> {
  const { data } = await admin
    .from("project_deployments")
    .select(COLS)
    .in("status", ["starting", "running", "stopping"]);
  return (data as DeploymentRow[] | null) ?? [];
}

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
  if (dep.status !== "starting" && dep.status !== "running" && dep.status !== "stopping") return dep.status;

  if (!dep.provider_machine_id) {
    // Slot reserved but no machine ever recorded — the start route died
    // mid-flight. After a grace window, release the slot as a crash so the
    // user isn't stuck with "already running" forever.
    const attempted = dep.last_start_attempt_at ? Date.parse(dep.last_start_attempt_at) : 0;
    if (dep.status === "starting" && Date.now() - attempted > 3 * 60_000) {
      await recordCrash(admin, dep.project_id, dep.restart_count);
      return "crashed";
    }
    return dep.status;
  }

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

  // Machine confirmed alive → meter the runtime and enforce the monthly budget.
  // Doing it only on the confirmed-alive path means a died-mid-interval machine
  // leaves its tail un-metered — undercounting by at most one cron period, which
  // is the honest direction to err in.
  if (dep.status === "running") {
    const monthTotal = await accrueRuntime(admin, dep);
    if (monthTotal !== null && (await stopIfOverBudget(admin, cfg, dep, monthTotal))) return "killed";
  }
  return dep.status;
}

// Status polls arrive every ~2.5s; batch metering into ≥60s slices so each
// running bot costs at most one RPC per minute, not one per poll.
const ACCRUE_MIN_SECONDS = 60;

/**
 * Credit the runtime since the last checkpoint to the owner's current month.
 * Returns the month's new running total in seconds, or null when nothing was
 * accrued (checkpoint too fresh, or the RPC failed — next pass retries, since
 * the checkpoint only advances after a successful bump).
 */
async function accrueRuntime(admin: SupabaseClient, dep: DeploymentRow): Promise<number | null> {
  const since = dep.last_accrued_at ?? dep.last_started_at;
  if (!since) return null;
  const now = Date.now();
  const elapsed = Math.floor((now - Date.parse(since)) / 1000);
  if (elapsed < ACCRUE_MIN_SECONDS) return null;

  const { data, error } = await admin.rpc("bump_hosting_usage", { p_user_id: dep.user_id, p_seconds: elapsed });
  if (error) return null;
  await admin
    .from("project_deployments")
    .update({ last_accrued_at: new Date(now).toISOString(), updated_at: new Date().toISOString() })
    .eq("project_id", dep.project_id);
  return typeof data === "number" ? data : Number(data);
}

/**
 * If the month's total exceeds the owner's plan budget, tear the run down:
 * destroy the machine, free the slot ('killed' = platform-enforced stop, unlike
 * a user-clicked 'stopped'), and tell the user why in their console.
 */
async function stopIfOverBudget(
  admin: SupabaseClient,
  cfg: FlyConfig,
  dep: DeploymentRow,
  monthTotalSeconds: number,
): Promise<boolean> {
  const { data } = await admin.auth.admin.getUserById(dep.user_id);
  const email = data?.user?.email ?? null;
  const { budgetSeconds } = hostingLimitsFor(email);
  if (budgetSeconds < 0 || monthTotalSeconds < budgetSeconds) return false;

  if (dep.provider_machine_id) {
    try {
      await destroyMachine(cfg, dep.provider_machine_id);
    } catch {
      // Machine may still be alive — keep the row 'running' so the next
      // reconcile pass retries the destroy. Marking 'killed' now would hide a
      // live billable machine from every future scan.
      return false;
    }
  }
  await setStopped(admin, dep.project_id, "killed");
  await appendLogs(admin, dep.project_id, [
    { stream: "system", line: "Stopped: this month's hosting hours are used up. The budget resets next month." },
  ]);
  return true;
}

/** Decide our status from (current status, live Fly state). null = no change. */
function mapFlyState(current: DeploymentStatus, state: FlyMachineState | null): DeploymentStatus | null {
  // "started" = healthy: never a transition here. Promotion to 'running' is
  // setRunning's job — routing it through the setStopped writer would wipe
  // run_token_hash and break the live run's log/exit callbacks.
  if (state === "started") return null;
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
