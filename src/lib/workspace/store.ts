/**
 * Project store — the single place the workspace/dashboard read & write projects.
 *
 * Backed by localStorage for now: everything works instantly with zero setup.
 * Every function is intentionally small and side-effect-local so this module can
 * be reimplemented against Supabase later without touching any component.
 */
import type { Project, ProjectFile } from "./types";
import type { Template } from "./templates";

const KEY = "bf:projects";

export interface StoredProject extends Project {
  createdAt: number;
  updatedAt: number;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const hasWindow = () => typeof window !== "undefined";

function readAll(): StoredProject[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as StoredProject[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeAll(list: StoredProject[]): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
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
