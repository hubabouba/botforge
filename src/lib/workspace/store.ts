/**
 * Project store — the single place the workspace/dashboard read & write projects.
 *
 * Backed by localStorage for now: everything works instantly with zero setup.
 * Every function is intentionally small and side-effect-local so this module can
 * be reimplemented against Supabase later without touching any component.
 */
import type { Project, ProjectFile } from "./types";
import type { Template } from "./templates";

export interface StoredProject extends Project {
  createdAt: number;
  updatedAt: number;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const hasWindow = () => typeof window !== "undefined";

// localStorage is shared per-browser, so scope each user's projects under their
// own key — otherwise switching accounts would show the previous user's projects.
const LEGACY_KEY = "bf:projects";
const NS = "bf:projects:v2:";
const ACTIVE_UID_KEY = "bf:active-uid";

let activeUserId: string | null = null;

function resolveUid(): string {
  if (activeUserId) return activeUserId;
  if (hasWindow()) {
    const stored = window.localStorage.getItem(ACTIVE_UID_KEY);
    if (stored) return stored;
  }
  return "anon";
}

function projectsKey(): string {
  return NS + resolveUid();
}

/**
 * Bind the store to the signed-in user. Call as early as possible on authed
 * pages (dashboard/workspace) so reads/writes hit that user's own bucket.
 */
export function setStoreUser(userId: string | null): void {
  activeUserId = userId;
  if (!hasWindow() || !userId) return;
  window.localStorage.setItem(ACTIVE_UID_KEY, userId);
  migrateLegacy(userId);
}

// One-time: the first account to open the app on this device adopts any
// pre-namespace projects; the legacy bucket is then removed so other accounts
// start clean (fixes cross-account project leakage).
function migrateLegacy(userId: string): void {
  try {
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (!legacy) return;
    const key = NS + userId;
    if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, legacy);
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

function readAll(): StoredProject[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(projectsKey());
    const list = raw ? (JSON.parse(raw) as StoredProject[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeAll(list: StoredProject[]): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(projectsKey(), JSON.stringify(list));
  // Let other open tabs / listeners refresh.
  window.dispatchEvent(new Event("bf:projects-changed"));
}

/** All projects, newest first. */
export function listProjects(): StoredProject[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProject(id: string): StoredProject | null {
  return readAll().find((p) => p.id === id) ?? null;
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

/** Create a project from an explicit spec (files are deep-copied). */
export function createProject(spec: ProjectSpec): StoredProject {
  const now = Date.now();
  const project: StoredProject = {
    id: uid(),
    name: spec.name.trim() || "my-bot",
    platform: spec.platform,
    language: spec.language,
    description: spec.description,
    entry: spec.entry,
    files: spec.files.map((f) => ({ ...f })),
    folders: spec.folders ? [...spec.folders] : [],
    createdAt: now,
    updatedAt: now,
  };
  writeAll([project, ...readAll()]);
  return project;
}

/** Create a project from a template. */
export function createProjectFromTemplate(template: Template, name?: string): StoredProject {
  return createProject({
    name: name?.trim() || template.name,
    platform: template.platform,
    language: template.language,
    description: template.description,
    entry: template.entry,
    files: template.files,
  });
}

/** Duplicate an existing project (deep copy, "(copy)" suffix). */
export function duplicateProject(id: string): StoredProject | null {
  const src = getProject(id);
  if (!src) return null;
  return createProject({
    name: `${src.name} (copy)`,
    platform: src.platform,
    language: src.language,
    description: src.description,
    entry: src.entry,
    files: src.files,
    folders: src.folders,
  });
}

function mutate(id: string, fn: (p: StoredProject) => void): StoredProject | null {
  const list = readAll();
  const project = list.find((p) => p.id === id);
  if (!project) return null;
  fn(project);
  project.updatedAt = Date.now();
  writeAll(list);
  return project;
}

export function renameProject(id: string, name: string): StoredProject | null {
  return mutate(id, (p) => {
    p.name = name.trim() || p.name;
  });
}

export function deleteProject(id: string): void {
  writeAll(readAll().filter((p) => p.id !== id));
}

// ---- File operations ----

export function writeFile(id: string, path: string, content: string): StoredProject | null {
  return mutate(id, (p) => {
    const file = p.files.find((f) => f.path === path);
    if (file) file.content = content;
  });
}

export function addFile(id: string, path: string, content = ""): StoredProject | null {
  const clean = normalizePath(path);
  if (!clean) return getProject(id);
  return mutate(id, (p) => {
    if (!p.files.some((f) => f.path === clean)) {
      p.files.push({ path: clean, content });
    }
  });
}

/** Create an (initially empty) folder that persists in the tree. */
export function addFolder(id: string, path: string): StoredProject | null {
  const clean = normalizePath(path).replace(/\/+$/, "");
  if (!clean) return getProject(id);
  return mutate(id, (p) => {
    p.folders ??= [];
    if (!p.folders.includes(clean)) p.folders.push(clean);
  });
}

/** Delete a folder and everything under it (files and nested folders). */
export function deleteFolder(id: string, path: string): StoredProject | null {
  const clean = normalizePath(path).replace(/\/+$/, "");
  if (!clean) return getProject(id);
  const prefix = `${clean}/`;
  return mutate(id, (p) => {
    const survivors = p.files.filter((f) => f.path !== clean && !f.path.startsWith(prefix));
    if (survivors.length >= 1) {
      p.files = survivors;
      if (p.entry && !p.files.some((f) => f.path === p.entry)) p.entry = p.files[0]?.path ?? "";
    }
    p.folders = (p.folders ?? []).filter((f) => f !== clean && !f.startsWith(prefix));
  });
}

export function renameFile(id: string, oldPath: string, newPath: string): StoredProject | null {
  const clean = normalizePath(newPath);
  if (!clean) return getProject(id);
  return mutate(id, (p) => {
    const file = p.files.find((f) => f.path === oldPath);
    if (file && !p.files.some((f) => f.path === clean)) {
      file.path = clean;
      if (p.entry === oldPath) p.entry = clean;
    }
  });
}

export function deleteFile(id: string, path: string): StoredProject | null {
  return mutate(id, (p) => {
    if (p.files.length <= 1) return; // keep at least one file
    p.files = p.files.filter((f) => f.path !== path);
    if (p.entry === path) p.entry = p.files[0]?.path ?? "";
  });
}

/** Trim, strip leading slashes/dots, collapse spaces. Returns "" if invalid. */
export function normalizePath(path: string): string {
  const clean = path
    .trim()
    .replace(/^[./\\]+/, "")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");
  return clean;
}

export type { Project, ProjectFile };
