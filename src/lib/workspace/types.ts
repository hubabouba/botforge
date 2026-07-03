/**
 * Types for the code-gen workspace (Phase 3).
 *
 * A project is a set of real source files the AI writes and the user owns.
 * The same shape will later be persisted in Supabase and produced by Claude —
 * for now the UI is seeded from a sample project so the screen feels alive.
 */

export type Platform = "telegram" | "discord";
export type Language = "python" | "node";

/** Languages we can syntax-highlight. Derived from the file extension. */
export type Lang = "python" | "typescript" | "javascript" | "json" | "markdown" | "text" | "env";

export interface ProjectFile {
  /** POSIX path relative to project root, e.g. "bot/handlers.py". */
  path: string;
  content: string;
}

export interface Project {
  id: string;
  name: string;
  platform: Platform;
  language: Language;
  /** Short one-liner shown in the workspace header and dashboard card. */
  description: string;
  files: ProjectFile[];
  /** Path of the file to open first. */
  entry: string;
  /** Explicit folders, including empty ones the tree can't derive from files. */
  folders?: string[];
}

// ---- Chat ----

export type ChatRole = "user" | "assistant";

/** A step the assistant took, rendered as a rich card inside its message. */
export type ChatStep =
  | { kind: "reasoning"; text: string }
  | { kind: "file"; path: string; action: "create" | "edit"; added?: number; removed?: number }
  | { kind: "run"; ok: boolean; text: string }
  | { kind: "error"; text: string; fixable?: boolean };

export interface ChatMessage {
  id: string;
  role: ChatRole;
  /** Plain text bubble (optional when the message is only steps). */
  text?: string;
  steps?: ChatStep[];
  /** True while the assistant is "thinking" — drives the typing indicator. */
  pending?: boolean;
}

// ---- File tree (derived from the flat file list) ----

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: TreeNode[];
}

/** Build a nested folder tree from a flat list of files plus explicit folders. */
export function buildTree(files: ProjectFile[], folders: string[] = []): TreeNode[] {
  const root: TreeNode = { name: "", path: "", type: "dir", children: [] };

  // Walk/create the dir chain for a "a/b/c" path and return the deepest node.
  const ensureDir = (path: string): TreeNode => {
    let node = root;
    let acc = "";
    for (const part of path.split("/").filter(Boolean)) {
      acc = acc ? `${acc}/${part}` : part;
      node.children ??= [];
      let child = node.children.find((c) => c.name === part && c.type === "dir");
      if (!child) {
        child = { name: part, path: acc, type: "dir", children: [] };
        node.children.push(child);
      }
      node = child;
    }
    return node;
  };

  // Seed explicit folders first so empty ones still appear.
  for (const f of folders) {
    const clean = f.replace(/^\/+|\/+$/g, "");
    if (clean) ensureDir(clean);
  }

  for (const file of files) {
    const parts = file.path.split("/");
    const fileName = parts[parts.length - 1];
    const parent = parts.length > 1 ? ensureDir(parts.slice(0, -1).join("/")) : root;
    parent.children ??= [];
    if (!parent.children.find((c) => c.name === fileName && c.type === "file")) {
      parent.children.push({ name: fileName, path: file.path, type: "file" });
    }
  }

  const sort = (nodes: TreeNode[]): TreeNode[] => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => n.children && sort(n.children));
    return nodes;
  };

  return sort(root.children ?? []);
}

/** Map a filename to a highlighter language. */
export function langOf(path: string): Lang {
  const name = path.split("/").pop() ?? "";
  if (name.startsWith(".env")) return "env";
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  switch (ext) {
    case "py":
      return "python";
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
    case "mjs":
      return "javascript";
    case "json":
      return "json";
    case "md":
      return "markdown";
    default:
      return "text";
  }
}
