"use client";

import { useEffect, useRef, useState } from "react";
import { buildTree, langOf, type ProjectFile, type TreeNode } from "@/lib/workspace/types";
import { ChevronRight, Plus, Pencil, Trash, FolderIcon } from "@/components/icons";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { cn } from "@/lib/utils";

/**
 * Deleting a file/folder is destructive with no undo — same two-step pattern
 * as project/account deletion: first click arms (button turns red), second
 * click within the window deletes, otherwise it disarms itself.
 */
function useArmedDelete(): [boolean, (onConfirmed: () => void) => void] {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 2500);
    return () => clearTimeout(timer);
  }, [armed]);
  const fire = (onConfirmed: () => void) => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    onConfirmed();
  };
  return [armed, fire];
}

/** A small colored square keyed to the file's language — quiet visual anchor. */
function FileDot({ path }: { path: string }) {
  const lang = langOf(path);
  const color =
    lang === "python"
      ? "bg-[#4b8bbe]"
      : lang === "typescript"
        ? "bg-[#3178c6]"
        : lang === "javascript"
          ? "bg-[#f7df1e]"
          : lang === "json"
            ? "bg-[#cbcb41]"
            : lang === "markdown"
              ? "bg-[#5b9bd5]"
              : lang === "env"
                ? "bg-[#eab308]"
                : "bg-neutral-500";
  return <span className={cn("h-2.5 w-2.5 shrink-0 rounded-[3px]", color)} />;
}

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

interface NodeHandlers {
  activePath: string;
  onOpen: (path: string) => void;
  onRename: (oldPath: string, newPath: string) => void;
  onDelete: (path: string) => void;
  onDeleteFolder: (path: string) => void;
}

function Node({ node, depth, h }: { node: TreeNode; depth: number; h: NodeHandlers }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(node.name);
  // Escape must CANCEL a rename — but unmounting the input can still fire its
  // onBlur, whose commit would save the half-typed draft anyway. The ref makes
  // the cancellation win regardless of event order.
  const renameCancelled = useRef(false);
  const [armed, fireDelete] = useArmedDelete();
  const pad = { paddingLeft: `${depth * 12 + 8}px` };

  if (node.type === "dir") {
    return (
      <div>
        <div
          style={pad}
          className="group/dir flex items-center gap-1.5 py-1 pr-1.5 text-[13px] text-neutral-300 transition-colors hover:bg-white/[0.04]"
        >
          <button onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
            <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-neutral-500 transition-transform", open && "rotate-90")} />
            <span className="truncate font-medium">{node.name}</span>
          </button>
          <button
            aria-label={armed ? t("tree.clickAgainToDelete") : t("tree.deleteFolder")}
            title={armed ? t("tree.clickAgainToDelete") : t("tree.deleteFolder")}
            onClick={() => fireDelete(() => h.onDeleteFolder(node.path))}
            className={cn(
              "grid h-5 w-5 shrink-0 place-items-center rounded transition-opacity group-hover/dir:opacity-100",
              armed
                ? "bg-rose-500/20 text-rose-300 opacity-100"
                : "text-neutral-500 opacity-0 hover:bg-white/10 hover:text-rose-300",
            )}
          >
            <Trash className="h-3 w-3" />
          </button>
        </div>
        {open && node.children?.map((c) => <Node key={c.path} node={c} depth={depth + 1} h={h} />)}
      </div>
    );
  }

  if (renaming) {
    const commit = () => {
      if (renameCancelled.current) {
        renameCancelled.current = false;
        return;
      }
      const name = draft.trim();
      if (name && name !== node.name) {
        const dir = dirOf(node.path);
        h.onRename(node.path, dir ? `${dir}/${name}` : name);
      }
      setRenaming(false);
    };
    return (
      <div style={pad} className="flex items-center gap-2 py-0.5 pr-2">
        <span className="w-3.5" />
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              renameCancelled.current = true;
              setRenaming(false);
            }
          }}
          className="w-full rounded border border-accent/50 bg-ink-900 px-1.5 py-0.5 text-[13px] text-neutral-100 outline-none"
        />
      </div>
    );
  }

  const active = node.path === h.activePath;
  return (
    <div
      style={pad}
      className={cn(
        "group/file flex items-center gap-2 py-1 pr-1.5 text-[13px] transition-colors",
        active ? "bg-accent/15 text-white" : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200",
      )}
    >
      <button onClick={() => h.onOpen(node.path)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className="w-3.5" />
        <FileDot path={node.path} />
        <span className="truncate">{node.name}</span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/file:opacity-100">
        <button
          aria-label={t("tree.rename")}
          onClick={() => {
            setDraft(node.name);
            setRenaming(true);
          }}
          className="grid h-5 w-5 place-items-center rounded text-neutral-500 hover:bg-white/10 hover:text-neutral-200"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          aria-label={armed ? t("tree.clickAgainToDelete") : t("tree.delete")}
          title={armed ? t("tree.clickAgainToDelete") : undefined}
          onClick={() => fireDelete(() => h.onDelete(node.path))}
          className={cn(
            "grid h-5 w-5 place-items-center rounded",
            armed ? "bg-rose-500/20 text-rose-300" : "text-neutral-500 hover:bg-white/10 hover:text-rose-300",
          )}
        >
          <Trash className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export function FileTree({
  files,
  folders,
  activePath,
  onOpen,
  onAddFile,
  onAddFolder,
  onRename,
  onDelete,
  onDeleteFolder,
  name,
  error,
}: {
  files: ProjectFile[];
  folders: string[];
  activePath: string;
  onOpen: (path: string) => void;
  onAddFile: (path: string) => void;
  onAddFolder: (path: string) => void;
  onRename: (oldPath: string, newPath: string) => void;
  onDelete: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  name: string;
  /** A failed file operation to surface (empty = none). */
  error?: string;
}) {
  const { t } = useI18n();
  const [adding, setAdding] = useState<null | "file" | "folder">(null);
  const [draft, setDraft] = useState("");
  const tree = buildTree(files, folders);

  function commitAdd() {
    const path = draft.trim();
    if (path) (adding === "folder" ? onAddFolder : onAddFile)(path);
    setDraft("");
    setAdding(null);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">{t("tree.explorer")}</span>
        <div className="flex items-center gap-0.5">
          <button
            aria-label={t("tree.newFile")}
            title={t("tree.newFile")}
            onClick={() => {
              setDraft("");
              setAdding("file");
            }}
            className="grid h-5 w-5 place-items-center rounded text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            aria-label={t("tree.newFolder")}
            title={t("tree.newFolder")}
            onClick={() => {
              setDraft("");
              setAdding("folder");
            }}
            className="grid h-5 w-5 place-items-center rounded text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200"
          >
            <FolderIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mb-1 flex items-center gap-1.5 px-3 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
        <ChevronRight className="h-3.5 w-3.5 rotate-90 text-neutral-500" />
        <span className="truncate">{name}</span>
      </div>

      {error && <div className="px-3 pb-1.5 text-[11px] leading-snug text-rose-300">{error}</div>}

      {adding && (
        <div className="px-3 pb-1 pl-6">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitAdd}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitAdd();
              if (e.key === "Escape") {
                setDraft("");
                setAdding(null);
              }
            }}
            placeholder={adding === "folder" ? t("tree.folderPlaceholder") : t("tree.filePlaceholder")}
            className="w-full rounded border border-accent/50 bg-ink-900 px-1.5 py-0.5 text-[13px] text-neutral-100 outline-none placeholder:text-neutral-600"
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto pb-3">
        {tree.map((node) => (
          <Node
            key={node.path}
            node={node}
            depth={0}
            h={{ activePath, onOpen, onRename, onDelete, onDeleteFolder }}
          />
        ))}
      </div>
    </div>
  );
}
