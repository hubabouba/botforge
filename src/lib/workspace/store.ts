/**
 * Project store — the single place the workspace/dashboard read & write projects.
 *
 * Backed by Supabase (per-user rows behind RLS) via the /api/projects routes.
 * Every function returns a promise; structural mutations resolve to the refreshed
 * project so callers can re-render. Auth is the Supabase session cookie — there's
 * no client-side user scoping anymore (RLS does it), so `setStoreUser` is gone.
 */
import type { Project, ProjectFile } from "./types";
import type { Template } from "./templates";

export interface StoredProject extends Project {
  createdAt: number;
  updatedAt: number;
}

/** Blueprint for a new project (from the wizard scaffolder or a template). */
export interface ProjectSpec {
  name: string;
  platform: Project["platform"];
  language: Project["language"];
  description: string;
  entry: string;
  files: ProjectFile[];
  folders?: string[];
}

/** Result of a create/duplicate: the project, or a reason it was refused. */
export type CreateResult = { ok: true; project: StoredProject } | { ok: false; error: "limit" | "error" };

const hasWindow = () => typeof window !== "undefined";

interface ApiData {
  projects?: StoredProject[];
  project?: StoredProject;
  error?: string;
  ok?: boolean;
}

async function req(url: string, init?: RequestInit): Promise<{ res: Response; data: ApiData }> {
  const res = await fetch(url, {
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as ApiData;
  return { res, data };
}

const post = (url: string, body?: unknown) =>
  req(url, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

// ---- Reads ----

/** All projects, newest first. */
export async function listProjects(): Promise<StoredProject[]> {
  const { res, data } = await req("/api/projects");
  return res.ok && Array.isArray(data.projects) ? (data.projects as StoredProject[]) : [];
}

export async function getProject(id: string): Promise<StoredProject | null> {
  const { res, data } = await req(`/api/projects/${id}`);
  return res.ok ? ((data.project as StoredProject) ?? null) : null;
}

// ---- Create / duplicate ----

function toCreateResult(res: Response, data: ApiData): CreateResult {
  if (res.status === 403 && data?.error === "limit") return { ok: false, error: "limit" };
  if (!res.ok || !data?.project) return { ok: false, error: "error" };
  return { ok: true, project: data.project };
}

/** Create a project from an explicit spec. */
export async function createProject(spec: ProjectSpec): Promise<CreateResult> {
  const { res, data } = await post("/api/projects", spec);
  return toCreateResult(res, data);
}

/** Create a project from a template. */
export async function createProjectFromTemplate(template: Template, name?: string): Promise<CreateResult> {
  return createProject({
    name: name?.trim() || template.name,
    platform: template.platform,
    language: template.language,
    description: template.description,
    entry: template.entry,
    files: template.files,
  });
}

/** Duplicate an existing project ("(copy)" suffix, applied server-side). */
export async function duplicateProject(id: string): Promise<CreateResult> {
  const { res, data } = await post(`/api/projects/${id}/duplicate`);
  return toCreateResult(res, data);
}

// ---- Project mutations ----

export async function renameProject(id: string, name: string): Promise<StoredProject | null> {
  const { res, data } = await req(`/api/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return res.ok ? ((data.project as StoredProject) ?? null) : null;
}

export async function deleteProject(id: string): Promise<void> {
  await req(`/api/projects/${id}`, { method: "DELETE" });
}

// ---- File operations ----

/** Overwrite an existing file's content (the autosave hot path — returns nothing). */
export async function writeFile(id: string, path: string, content: string): Promise<void> {
  await post(`/api/projects/${id}/files`, { action: "write", path, content });
}

export async function addFile(id: string, path: string, content = ""): Promise<StoredProject | null> {
  const clean = normalizePath(path);
  if (!clean) return getProject(id);
  const { res, data } = await post(`/api/projects/${id}/files`, { action: "add", path: clean, content });
  return res.ok ? ((data.project as StoredProject) ?? null) : null;
}

/** Create an (initially empty) folder that persists in the tree. */
export async function addFolder(id: string, path: string): Promise<StoredProject | null> {
  const clean = normalizePath(path).replace(/\/+$/, "");
  if (!clean) return getProject(id);
  const { res, data } = await post(`/api/projects/${id}/folders`, { action: "add", path: clean });
  return res.ok ? ((data.project as StoredProject) ?? null) : null;
}

/** Delete a folder and everything under it (files and nested folders). */
export async function deleteFolder(id: string, path: string): Promise<StoredProject | null> {
  const clean = normalizePath(path).replace(/\/+$/, "");
  if (!clean) return getProject(id);
  const { res, data } = await post(`/api/projects/${id}/folders`, { action: "delete", path: clean });
  return res.ok ? ((data.project as StoredProject) ?? null) : null;
}

export async function renameFile(id: string, oldPath: string, newPath: string): Promise<StoredProject | null> {
  const clean = normalizePath(newPath);
  if (!clean) return getProject(id);
  const { res, data } = await post(`/api/projects/${id}/files`, { action: "rename", oldPath, newPath: clean });
  return res.ok ? ((data.project as StoredProject) ?? null) : null;
}

export async function deleteFile(id: string, path: string): Promise<StoredProject | null> {
  const { res, data } = await post(`/api/projects/${id}/files`, { action: "delete", path });
  return res.ok ? ((data.project as StoredProject) ?? null) : null;
}

/** Trim, strip leading slashes/dots, collapse spaces. Returns "" if invalid. */
export function normalizePath(path: string): string {
  return path
    .trim()
    .replace(/^[./\\]+/, "")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");
}

// ---- One-time migration of pre-Supabase localStorage projects ----

const LEGACY_KEY = "bf:projects";
const NS = "bf:projects:v2:";
const ACTIVE_UID_KEY = "bf:active-uid";

/**
 * Import any projects still sitting in this browser's localStorage (from before
 * the Supabase migration) into the user's account, then clear those keys so it
 * only ever runs once. Returns how many were imported. Best-effort: failures are
 * swallowed and the local copy is left intact so nothing is lost.
 */
export async function migrateLocalProjects(userId: string): Promise<number> {
  if (!hasWindow()) return 0;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(NS + userId) ?? window.localStorage.getItem(LEGACY_KEY);
  } catch {
    return 0;
  }
  if (!raw) return 0;

  let local: StoredProject[];
  try {
    const parsed = JSON.parse(raw);
    local = Array.isArray(parsed) ? parsed : [];
  } catch {
    return 0;
  }
  if (local.length === 0) {
    clearLegacyKeys(userId);
    return 0;
  }

  let imported = 0;
  let hadError = false;
  for (const p of local) {
    const result = await createProject({
      name: p.name,
      platform: p.platform,
      language: p.language,
      description: p.description ?? "",
      entry: p.entry,
      files: p.files ?? [],
      folders: p.folders,
    });
    if (result.ok) imported++;
    else hadError = true;
  }

  // Only drop the local copy once everything imported cleanly, so a transient
  // failure doesn't lose projects — they'll be retried next load.
  if (!hadError) clearLegacyKeys(userId);
  return imported;
}

function clearLegacyKeys(userId: string): void {
  try {
    window.localStorage.removeItem(NS + userId);
    window.localStorage.removeItem(LEGACY_KEY);
    window.localStorage.removeItem(ACTIVE_UID_KEY);
  } catch {
    /* ignore */
  }
}

export type { Project, ProjectFile };
