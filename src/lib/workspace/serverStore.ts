/**
 * Server-side project reads — maps Supabase rows into the `StoredProject` shape
 * the client store/components already expect. Used by the /api/projects routes;
 * always called with the RLS-scoped server client, so a user only ever sees
 * their own rows (never the service-role/admin client here).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoredProject } from "./store";

// Nested select pulls a project with its files and folders in one round-trip.
export const PROJECT_SELECT =
  "id, name, platform, language, description, entry, created_at, updated_at, project_files(path, content), project_folders(path)";

// Lightweight list select: file PATHS only, no contents. The dashboard list
// needs the file *count* (project.files.length), never the bodies — pulling
// every file's full text just to render cards was pure over-fetch.
export const PROJECT_LIST_SELECT =
  "id, name, platform, language, description, entry, created_at, updated_at, project_files(path), project_folders(path)";

interface ProjectRow {
  id: string;
  name: string;
  platform: string;
  language: string;
  description: string | null;
  entry: string | null;
  created_at: string;
  updated_at: string;
  project_files: { path: string; content: string }[] | null;
  project_folders: { path: string }[] | null;
}

export function mapRow(row: ProjectRow): StoredProject {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform as StoredProject["platform"],
    language: row.language as StoredProject["language"],
    description: row.description ?? "",
    entry: row.entry ?? "",
    // content is absent in the lightweight list select — default to "".
    files: (row.project_files ?? []).map((f) => ({ path: f.path, content: f.content ?? "" })),
    folders: (row.project_folders ?? []).map((f) => f.path),
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

/**
 * All of the signed-in user's projects as lightweight summaries (file paths but
 * no contents), newest first — for the dashboard list. `content` is returned as
 * "" so the existing StoredProject shape (and `files.length`) still works.
 */
export async function fetchProjectSummaries(supabase: SupabaseClient): Promise<StoredProject[]> {
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_LIST_SELECT)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as ProjectRow[]).map(mapRow);
}

/** A single project by id (null if it doesn't exist or isn't the user's). */
export async function fetchProject(supabase: SupabaseClient, id: string): Promise<StoredProject | null> {
  const { data, error } = await supabase.from("projects").select(PROJECT_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapRow(data as unknown as ProjectRow) : null;
}
