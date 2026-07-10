/**
 * Browser-side hosting API wrappers (parallel to workspace/store.ts). Keeps
 * components out of raw fetch and normalizes the { error, code } shape the
 * routes return.
 */
import type { DeploymentView, LogLine } from "./types";

export interface ApiError {
  error: string;
  code?: string;
  required?: string;
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

const base = (id: string) => `/api/hosting/projects/${id}`;

export async function getStatus(id: string, signal?: AbortSignal): Promise<DeploymentView | null> {
  const res = await fetch(`${base(id)}/status`, { signal });
  if (!res.ok) return null;
  return json<DeploymentView>(res);
}

export async function startBot(id: string): Promise<{ ok: boolean } & ApiError> {
  const res = await fetch(`${base(id)}/start`, { method: "POST" });
  const data = await json<ApiError & { ok?: boolean }>(res);
  return { ok: res.ok, ...data };
}

export async function stopBot(id: string): Promise<{ ok: boolean } & ApiError> {
  const res = await fetch(`${base(id)}/stop`, { method: "POST" });
  const data = await json<ApiError & { ok?: boolean }>(res);
  return { ok: res.ok, ...data };
}

export async function getLogs(id: string, after: number, signal?: AbortSignal): Promise<LogLine[]> {
  const res = await fetch(`${base(id)}/logs?after=${after}`, { signal });
  if (!res.ok) return [];
  const data = await json<{ lines: LogLine[] }>(res);
  return data.lines ?? [];
}

export interface SecretInfo {
  key: string;
  updatedAt: number;
}

export async function listSecrets(id: string): Promise<SecretInfo[]> {
  const res = await fetch(`${base(id)}/secrets`);
  if (!res.ok) return [];
  const data = await json<{ secrets: SecretInfo[] }>(res);
  return data.secrets ?? [];
}

export async function setSecret(id: string, key: string, value: string): Promise<{ ok: boolean } & ApiError> {
  const res = await fetch(`${base(id)}/secrets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  const data = await json<ApiError & { ok?: boolean }>(res);
  return { ok: res.ok, ...data };
}

export async function deleteSecret(id: string, key: string): Promise<boolean> {
  const res = await fetch(`${base(id)}/secrets?key=${encodeURIComponent(key)}`, { method: "DELETE" });
  return res.ok;
}
