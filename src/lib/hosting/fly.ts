/**
 * Thin wrapper over the Fly.io Machines API — the single external dependency of
 * bot hosting. One Fly App (FLY_APP_NAME) owns one Machine per running bot; we
 * create/stop/destroy them by user action. Auth is a Fly org token
 * (`fly tokens create org`) in FLY_API_TOKEN. This is the only module that talks
 * to Fly, so a different provider later means rewriting just this file.
 *
 * https://fly.io/docs/machines/api/
 */
import type { Language } from "../workspace/types";

const FLY_API = "https://api.machines.dev/v1";

export interface FlyConfig {
  token: string;
  appName: string;
  region?: string;
}

/**
 * Reads the base Fly config from env; throws if hosting isn't configured at
 * all. Deliberately does NOT require a runner image — stop/status/reconcile
 * never touch one (only creating a Machine does), so a Python-only site keeps
 * working even before a Node runner image is pushed.
 */
export function flyConfig(): FlyConfig {
  const token = process.env.FLY_API_TOKEN;
  const appName = process.env.FLY_APP_NAME;
  if (!token || !appName) {
    throw new Error("Fly hosting is not configured (FLY_API_TOKEN / FLY_APP_NAME).");
  }
  return { token, appName, region: process.env.FLY_REGION || undefined };
}

/** One Fly app hosts Machines of BOTH languages, picked by image at create-time. */
const RUNNER_IMAGE_ENV: Record<Language, string> = {
  python: "FLY_RUNNER_IMAGE_PYTHON",
  node: "FLY_RUNNER_IMAGE_NODE",
};

/** The runner image for a project's language; throws if that language's image isn't configured. */
export function runnerImageFor(language: Language): string {
  const envVar = RUNNER_IMAGE_ENV[language];
  const image = process.env[envVar];
  if (!image) throw new Error(`Hosting for ${language} bots isn't configured (${envVar}).`);
  return image;
}

export type FlyMachineState =
  | "created" | "starting" | "started" | "stopping" | "stopped"
  | "suspended" | "replacing" | "destroying" | "destroyed" | string;

interface FlyMachine {
  id: string;
  state: FlyMachineState;
  region?: string;
}

async function flyFetch(cfg: FlyConfig, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${FLY_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

/**
 * Create and start a fresh Machine running the bot. We create-then-destroy per
 * run (rather than reuse) so every start launches the latest files/secrets/env
 * with clean state; reusing a stopped machine to skip dep installs is a v2
 * optimization. restart.policy="no" means a crashed process leaves the machine
 * stopped (v1 = manual restart), not an auto-heal loop.
 */
export async function createRunMachine(
  cfg: FlyConfig,
  opts: { image: string; env: Record<string, string>; memoryMb?: number; name?: string },
): Promise<{ id: string; region?: string }> {
  const res = await flyFetch(cfg, `/apps/${cfg.appName}/machines`, {
    method: "POST",
    body: JSON.stringify({
      name: opts.name,
      region: cfg.region,
      config: {
        image: opts.image,
        env: opts.env,
        auto_destroy: false,
        restart: { policy: "no" },
        guest: { cpu_kind: "shared", cpus: 1, memory_mb: opts.memoryMb ?? 256 },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Fly create machine failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const machine = (await res.json()) as FlyMachine;
  return { id: machine.id, region: machine.region };
}

/** Stop a running Machine (keeps it around; does not destroy). Best-effort. */
export async function stopMachine(cfg: FlyConfig, machineId: string): Promise<void> {
  const res = await flyFetch(cfg, `/apps/${cfg.appName}/machines/${machineId}/stop`, { method: "POST" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Fly stop machine failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
}

/** Destroy a Machine (force). Best-effort — used to clean up the previous run. */
export async function destroyMachine(cfg: FlyConfig, machineId: string): Promise<void> {
  const res = await flyFetch(cfg, `/apps/${cfg.appName}/machines/${machineId}?force=true`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Fly destroy machine failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
}

/** Current Machine state, or null if it no longer exists (404). */
export async function getMachineState(cfg: FlyConfig, machineId: string): Promise<FlyMachineState | null> {
  const res = await flyFetch(cfg, `/apps/${cfg.appName}/machines/${machineId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Fly get machine failed (${res.status}).`);
  const machine = (await res.json()) as FlyMachine;
  return machine.state;
}
