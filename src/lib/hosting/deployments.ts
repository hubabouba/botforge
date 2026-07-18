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
import { effectiveHostingPlan, hostingLimitsFor } from "../plan";
import { getUserPlan } from "../subscription";
import type { Language } from "../workspace/types";
import type { DeploymentStatus } from "./types";
import { destroyMachine, getMachineState, type FlyConfig, type FlyMachineState } from "./fly";
import { globalMachineCeiling } from "./config";
import { generateRunToken, hashRunToken } from "./runToken";
import { decryptProjectSecrets, defaultEntryFor, launchMachine } from "./launch";
import { sendHostingBudgetEmail } from "../email";

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

/**
 * Rows the reconcile cron must visit: those occupying a machine slot, PLUS
 * 'crashed' ones awaiting an auto-restart attempt (a bot nobody is watching
 * would otherwise never get restarted, since the lazy path only fires when its
 * owner has the panel open).
 */
export async function getActiveDeployments(admin: SupabaseClient): Promise<DeploymentRow[]> {
  const { data } = await admin
    .from("project_deployments")
    .select(COLS)
    .in("status", ["starting", "running", "stopping", "crashed"]);
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

// Crashes closer together than this window are one "streak"; a gap longer than
// the window starts a fresh streak (an isolated crash after days of uptime
// shouldn't inherit an old count). Manual Start resets the count to 0 outright
// (begin_project_run).
const CRASH_WINDOW_MS = 10 * 60_000;
/** Auto-restart attempts per streak before giving up as crash_looping. */
export const MAX_AUTO_RESTARTS = 3;

/**
 * The bot process exited on its own. Within a streak restart_count climbs by 1
 * per crash; once it passes MAX_AUTO_RESTARTS the deployment goes terminal
 * 'crash_looping' — auto-restart stops and only a manual Start revives it.
 * Returns the status it wrote so callers can report it without a re-read.
 */
export async function recordCrash(admin: SupabaseClient, dep: DeploymentRow): Promise<DeploymentStatus> {
  const withinWindow = dep.last_crash_at !== null && Date.now() - Date.parse(dep.last_crash_at) < CRASH_WINDOW_MS;
  const nextCount = withinWindow ? dep.restart_count + 1 : 1;
  const looping = nextCount > MAX_AUTO_RESTARTS;
  const status: DeploymentStatus = looping ? "crash_looping" : "crashed";
  await admin
    .from("project_deployments")
    .update({
      status,
      last_crash_at: new Date().toISOString(),
      restart_count: nextCount,
      run_token_hash: null,
      updated_at: new Date().toISOString(),
    })
    .eq("project_id", dep.project_id);
  if (looping) {
    await appendLogs(admin, dep.project_id, [
      {
        stream: "system",
        line: `Auto-restart gave up after ${MAX_AUTO_RESTARTS} attempts in a row. Fix the error above, then press Start.`,
      },
    ]);
  }
  return status;
}

// Wait before each auto-restart, indexed by the streak position about to be
// retried (restart_count is 1-based and already counts the crash that just
// happened). Growing gaps stop a fast crash-loop from hammering Fly / the budget.
const RESTART_BACKOFF_MS = [15_000, 60_000, 180_000];

/**
 * A 'crashed' deployment is a pending auto-restart. Once its backoff has
 * elapsed, atomically re-reserve the run (re-checking concurrency, budget and
 * the global ceiling — WITHOUT resetting the streak counter) and relaunch. Any
 * refusal (budget/ceiling gone, plan dropped hosting) just leaves it 'crashed'
 * for the user to Start manually. Never throws: it's called from reconcile.
 */
async function maybeAutoRestart(admin: SupabaseClient, cfg: FlyConfig, dep: DeploymentRow): Promise<DeploymentStatus> {
  const attempt = dep.restart_count; // 1..MAX_AUTO_RESTARTS (past that recordCrash wrote crash_looping)
  if (attempt < 1 || attempt > MAX_AUTO_RESTARTS) return dep.status;

  const backoff = RESTART_BACKOFF_MS[attempt - 1] ?? RESTART_BACKOFF_MS[RESTART_BACKOFF_MS.length - 1];
  const since = dep.last_crash_at ? Date.parse(dep.last_crash_at) : 0;
  if (Date.now() - since < backoff) return dep.status; // too soon — a later reconcile pass retries

  // Out-of-band (cron / a background reconcile) has no request origin, so the
  // machine's callback URL must come from env. Without it we can't launch.
  const publicUrl = (process.env.BOTFORGE_PUBLIC_URL || "").replace(/\/$/, "");
  if (!publicUrl) return dep.status;

  const { data: userData } = await admin.auth.admin.getUserById(dep.user_id);
  const email = userData?.user?.email ?? null;
  // The real plan (env allow-list OR the Stripe-backed subscriptions table —
  // `admin` bypasses RLS, so this can resolve any user's row), not just the
  // allow-list a background path used to be limited to.
  const plan = effectiveHostingPlan(await getUserPlan(admin, dep.user_id, email), email);
  const limits = hostingLimitsFor(plan);
  if (limits.concurrent <= 0) return dep.status; // plan no longer includes hosting

  const runToken = generateRunToken();
  const { data: reserve, error } = await admin.rpc("attempt_auto_restart", {
    p_user_id: dep.user_id,
    p_project_id: dep.project_id,
    p_concurrent_limit: limits.concurrent,
    p_runtime_budget_seconds: limits.budgetSeconds,
    p_run_token_hash: hashRunToken(runToken),
    p_global_ceiling: globalMachineCeiling(),
  });
  if (error) return dep.status;
  if (!(reserve as { ok?: boolean } | null)?.ok) return dep.status; // budget/ceiling/not-crashed → stay put

  // Reserved: status is now 'starting'. Relaunch the machine.
  await appendLogs(admin, dep.project_id, [
    { stream: "system", line: `Auto-restarting after a crash (attempt ${attempt}/${MAX_AUTO_RESTARTS})…` },
  ]);
  const { data: proj } = await admin.from("projects").select("entry, language").eq("id", dep.project_id).maybeSingle();
  const projectRow = proj as { entry: string | null; language: Language } | null;
  const language: Language = projectRow?.language ?? "python";
  const entry = projectRow?.entry || defaultEntryFor(language);

  try {
    const env = await decryptProjectSecrets(admin, dep.project_id);
    await launchMachine(admin, cfg, { projectId: dep.project_id, language, entry, env, runToken, publicUrl });
    return "running";
  } catch (e) {
    // Launch failed after reserving. Record it as another crash so the streak
    // advances toward the cap instead of stranding in 'starting'. dep still
    // holds the pre-reserve counter/timestamp, exactly what recordCrash needs.
    await appendLogs(admin, dep.project_id, [{ stream: "system", line: `Auto-restart failed: ${(e as Error).message}` }]);
    return recordCrash(admin, dep);
  }
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
    .replace(/[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,}/g, "[REDACTED]")
    // OpenAI-style keys (sk-…, sk-proj-…) — bots calling third-party APIs log these too
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED]")
    // Any long bearer credential in a dumped request header
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]{20,}={0,2}/gi, "$1[REDACTED]");
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
  // 'crashed' isn't a machine state to reconcile — it's a pending auto-restart.
  if (dep.status === "crashed") return maybeAutoRestart(admin, cfg, dep);

  if (dep.status !== "starting" && dep.status !== "running" && dep.status !== "stopping") return dep.status;

  if (dep.status === "starting") {
    // A fresh reservation still carries the PREVIOUS run's machine id (the SQL
    // reserve doesn't clear it; launchMachine destroys that machine as its
    // first step). Judging the old/gone machine here would misread an in-flight
    // launch as a crash — and recordCrash nulls run_token_hash, 401-ing the new
    // machine's callbacks. So during the grace window: hands off entirely.
    const attempted = dep.last_start_attempt_at ? Date.parse(dep.last_start_attempt_at) : 0;
    if (Date.now() - attempted <= START_GRACE_MS) return dep.status;
    // Past grace with no machine recorded — the start route died mid-flight.
    // Release the slot as a crash so the user isn't stuck with "already running".
    if (!dep.provider_machine_id) return recordCrash(admin, dep);
    // Past grace WITH a machine id: fall through to the live-state check.
  }

  if (!dep.provider_machine_id) return dep.status;

  let state: FlyMachineState | null;
  try {
    state = await getMachineState(cfg, dep.provider_machine_id);
  } catch {
    return dep.status; // transient Fly error — don't flip state on a blip
  }

  const next = mapFlyState(dep.status, state);
  if (next && next !== dep.status) {
    if (next === "crashed") return recordCrash(admin, dep);
    await setStopped(admin, dep.project_id, next);
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

// How long a 'starting' row is left alone before reconcile may judge it (see
// reconcileWithFly) — covers the create→setRunning window of a normal launch.
const START_GRACE_MS = 3 * 60_000;

/**
 * Credit the runtime since the last checkpoint to the owner's current month.
 * Returns the month's new running total in seconds, or null when nothing was
 * accrued (checkpoint too fresh, another reconcile claimed the interval, or
 * the RPC failed).
 */
async function accrueRuntime(admin: SupabaseClient, dep: DeploymentRow): Promise<number | null> {
  const since = dep.last_accrued_at ?? dep.last_started_at;
  if (!since) return null;
  const now = Date.now();
  const elapsed = Math.floor((now - Date.parse(since)) / 1000);
  if (elapsed < ACCRUE_MIN_SECONDS) return null;

  // Claim the interval FIRST via compare-and-swap on the checkpoint: of N
  // concurrent reconciles holding the same snapshot (two tabs polling, the
  // cron overlapping a poll) only the one that flips last_accrued_at bumps
  // usage — the same interval can never be billed twice. If the bump then
  // fails, that slice goes unmetered (undercount ≤ one slice — the honest
  // direction to err in).
  const claimQuery = admin
    .from("project_deployments")
    .update({ last_accrued_at: new Date(now).toISOString(), updated_at: new Date().toISOString() })
    .eq("project_id", dep.project_id);
  const { data: claimed, error: claimError } = await (dep.last_accrued_at === null
    ? claimQuery.is("last_accrued_at", null)
    : claimQuery.eq("last_accrued_at", dep.last_accrued_at)
  ).select("project_id");
  if (claimError || !claimed?.length) return null;

  const { data, error } = await admin.rpc("bump_hosting_usage", { p_user_id: dep.user_id, p_seconds: elapsed });
  if (error) return null;
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
  const plan = effectiveHostingPlan(await getUserPlan(admin, dep.user_id, email), email);
  const { budgetSeconds } = hostingLimitsFor(plan);
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
  // Best-effort heads-up — the panel only shows this if the user opens it.
  if (email) {
    try {
      await sendHostingBudgetEmail(email);
    } catch {
      /* email is a no-op unless configured; never block the stop on it */
    }
  }
  return true;
}

/** Decide our status from (current status, live Fly state). null = no change. Exported for tests. */
export function mapFlyState(current: DeploymentStatus, state: FlyMachineState | null): DeploymentStatus | null {
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
