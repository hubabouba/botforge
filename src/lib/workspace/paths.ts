/**
 * Server-side guard for project-relative file/folder paths. The runner
 * supervisors already contain writes to /app on their side, but nothing
 * traversal-shaped should ever be STORED either — defense in depth, and it
 * keeps the AI's write_file tool from planting "../" paths in a project.
 */
export function isSafeProjectPath(p: string): boolean {
  if (!p || p.length > 300) return false;
  if (p.includes("\0") || p.includes("\\")) return false;
  if (p.startsWith("/") || /^[A-Za-z]:/.test(p)) return false;
  // Every slash-separated segment must be a real name — no "", "." or "..".
  return p.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}
