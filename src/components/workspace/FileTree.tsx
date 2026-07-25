"use client";

import { useEffect, useRef, useState } from "react";
import { buildTree, langOf, type ProjectFile, type TreeNode } from "@/lib/workspace/types";
import { ChevronRight, Plus, Pencil, Trash, FolderIcon, FilePlus, FolderPlus } from "@/components/icons";
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
export function FileDot({ path }: { path: string }) {
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

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

type Creating = { parent: string; type: "file" | "folder" };

interface NodeHandlers {
  activePath: string;
  onOpen: (path: string) => void;
  onRename: (oldPath: string, newPath: string) => void;
  /** Move a file to a new folder (a rename under the hood). */
  onMove: (oldPath: string, newPath: string) => void;
  onDelete: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  /** Open the inline creator scoped to `parent` ("" = project root). */
  requestCreate: (parent: string, type: "file" | "folder") => void;
  // Inline creator — controlled at the tree root so only one is open at a time.
  creating: Creating | null;
  draft: string;
  setDraft: (s: string) => void;
  commitCreate: () => void;
  cancelCreate: () => void;
  // Drag & drop — the path currently being dragged (a file), shared so drop
  // targets can decide whether they'd accept it before the drop happens.
  dragging: string | null;
  setDragging: (p: string | null) => void;
}

/** The inline "new file / new folder" input, reused at root and inside folders. */
function CreatorInput({ depth, h }: { depth: number; h: NodeHandlers }) {
  const { t } = useI18n();
  if (!h.creating) return null;
  const { type, parent } = h.creating;
  const nested = parent !== "";
  const placeholder =
    type === "folder"
      ? t(nested ? "tree.folderNameInFolderPlaceholder" : "tree.folderPlaceholder")
      : t(nested ? "tree.nameInFolderPlaceholder" : "tree.filePlaceholder");
  return (
    <div style={{ paddingLeft: `${depth * 12 + 8}px` }} className="flex items-center gap-1.5 py-0.5 pr-2">
      <span className="w-3.5 shrink-0" />
      {type === "folder" ? (
        <FolderPlus className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
      ) : (
        <FilePlus className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
      )}
      <input
        autoFocus
        value={h.draft}
        onChange={(e) => h.setDraft(e.target.value)}
        onBlur={h.commitCreate}
        onKeyDown={(e) => {
          if (e.key === "Enter") h.commitCreate();
          if (e.key === "Escape") h.cancelCreate();
        }}
        placeholder={placeholder}
        className="w-full rounded border border-accent/50 bg-ink-900 px-1.5 py-0.5 text-[13px] text-neutral-100 outline-none placeholder:text-neutral-600"
      />
    </div>
  );
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
  const [dragOver, setDragOver] = useState(false);
  const pad = { paddingLeft: `${depth * 12 + 8}px` };

  if (node.type === "dir") {
    // A drop is valid when we're dragging a file that isn't already in here.
    const wouldAccept = h.dragging != null && dirOf(h.dragging) !== node.path;
    return (
      <div>
        <div
          style={pad}
          onDragOver={(e) => {
            if (!wouldAccept) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(false);
            const src = h.dragging;
            if (src && dirOf(src) !== node.path) h.onMove(src, `${node.path}/${baseName(src)}`);
            h.setDragging(null);
          }}
          className={cn(
            "group/dir flex items-center gap-1.5 py-1 pr-1.5 text-[13px] text-neutral-300 transition-colors",
            dragOver ? "bg-accent/15 ring-1 ring-inset ring-accent/40" : "hover:bg-white/[0.04]",
          )}
        >
          <button onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
            <ChevronRight
              className={cn("h-3.5 w-3.5 shrink-0 text-neutral-500 transition-transform", open && "rotate-90")}
            />
            <FolderIcon className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
            <span className="truncate font-medium">{node.name}</span>
          </button>
          <div
            className={cn(
              "flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/dir:opacity-100",
              armed && "opacity-100",
            )}
          >
            <button
              aria-label={t("tree.newFileHere")}
              title={t("tree.newFileHere")}
              onClick={() => {
                setOpen(true);
                h.requestCreate(node.path, "file");
              }}
              className="grid h-5 w-5 place-items-center rounded text-neutral-500 hover:bg-white/10 hover:text-neutral-200"
            >
              <FilePlus className="h-3 w-3" />
            </button>
            <button
              aria-label={t("tree.newFolderHere")}
              title={t("tree.newFolderHere")}
              onClick={() => {
                setOpen(true);
                h.requestCreate(node.path, "folder");
              }}
              className="grid h-5 w-5 place-items-center rounded text-neutral-500 hover:bg-white/10 hover:text-neutral-200"
            >
              <FolderPlus className="h-3 w-3" />
            </button>
            <button
              aria-label={armed ? t("tree.clickAgainToDelete") : t("tree.deleteFolder")}
              title={armed ? t("tree.clickAgainToDelete") : t("tree.deleteFolder")}
              onClick={() => fireDelete(() => h.onDeleteFolder(node.path))}
              className={cn(
                "grid h-5 w-5 place-items-center rounded transition-colors",
                armed ? "bg-rose-500/20 text-rose-300" : "text-neutral-500 hover:bg-white/10 hover:text-rose-300",
              )}
            >
              <Trash className="h-3 w-3" />
            </button>
          </div>
        </div>
        {open && (
          <>
            {h.creating?.parent === node.path && <CreatorInput depth={depth + 1} h={h} />}
            {node.children?.map((c) => <Node key={c.path} node={c} depth={depth + 1} h={h} />)}
          </>
        )}
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
  const isDragging = h.dragging === node.path;
  return (
    <div
      style={pad}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", node.path);
        e.dataTransfer.effectAllowed = "move";
        h.setDragging(node.path);
      }}
      onDragEnd={() => h.setDragging(null)}
      className={cn(
        "group/file flex items-center gap-2 py-1 pr-1.5 text-[13px] transition-colors",
        active ? "bg-accent/15 text-white" : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200",
        isDragging && "opacity-40",
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
  const [creating, setCreating] = useState<Creating | null>(null);
  const [draft, setDraft] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [rootDragOver, setRootDragOver] = useState(false);
  const tree = buildTree(files, folders);

  function requestCreate(parent: string, type: "file" | "folder") {
    setDraft("");
    setCreating({ parent, type });
  }
  function commitCreate() {
    const nm = draft.trim();
    if (nm && creating) {
      const full = creating.parent ? `${creating.parent}/${nm}` : nm;
      (creating.type === "folder" ? onAddFolder : onAddFile)(full);
    }
    setDraft("");
    setCreating(null);
  }
  function cancelCreate() {
    setDraft("");
    setCreating(null);
  }

  const h: NodeHandlers = {
    activePath,
    onOpen,
    onRename,
    onMove: onRename,
    onDelete,
    onDeleteFolder,
    requestCreate,
    creating,
    draft,
    setDraft,
    commitCreate,
    cancelCreate,
    dragging,
    setDragging,
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">{t("tree.explorer")}</span>
        <div className="flex items-center gap-0.5">
          <button
            aria-label={t("tree.newFile")}
            title={t("tree.newFile")}
            onClick={() => requestCreate("", "file")}
            className="grid h-5 w-5 place-items-center rounded text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            aria-label={t("tree.newFolder")}
            title={t("tree.newFolder")}
            onClick={() => requestCreate("", "folder")}
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

      {/* The tree body doubles as the "move to project root" drop target. Folder
          rows stop propagation on their own drop, so a drop reaches here only
          when it lands on empty space or a root-level file. */}
      <div
        className={cn("flex-1 overflow-y-auto pb-3", rootDragOver && "bg-accent/[0.06]")}
        onDragOver={(e) => {
          if (!dragging || dirOf(dragging) === "") return; // already at root
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setRootDragOver(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setRootDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setRootDragOver(false);
          if (dragging && dirOf(dragging) !== "") onRename(dragging, baseName(dragging));
          setDragging(null);
        }}
      >
        {creating?.parent === "" && <CreatorInput depth={0} h={h} />}
        {tree.map((node) => (
          <Node key={node.path} node={node} depth={0} h={h} />
        ))}
      </div>
    </div>
  );
}
