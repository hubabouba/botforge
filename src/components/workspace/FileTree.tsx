"use client";

import { useState } from "react";
import { buildTree, langOf, type ProjectFile, type TreeNode } from "@/lib/workspace/types";
import { cn } from "@/lib/utils";

/** A small colored square keyed to the file's language — quiet visual anchor. */
function FileIcon({ path }: { path: string }) {
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
              ? "bg-[#42a5f5]"
              : lang === "env"
                ? "bg-[#eab308]"
                : "bg-neutral-500";
  return <span className={cn("h-2.5 w-2.5 shrink-0 rounded-[3px]", color)} />;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-3 w-3 shrink-0 text-neutral-500 transition-transform", open && "rotate-90")}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function Node({
  node,
  depth,
  activePath,
  onOpen,
}: {
  node: TreeNode;
  depth: number;
  activePath: string;
  onOpen: (path: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const pad = { paddingLeft: `${depth * 12 + 8}px` };

  if (node.type === "dir") {
    return (
      <div>
        <button
          onClick={() => setOpen((v) => !v)}
          style={pad}
          className="flex w-full items-center gap-1.5 py-1 pr-2 text-left text-[13px] text-neutral-300 transition-colors hover:bg-white/[0.04]"
        >
          <Chevron open={open} />
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {open &&
          node.children?.map((child) => (
            <Node key={child.path} node={child} depth={depth + 1} activePath={activePath} onOpen={onOpen} />
          ))}
      </div>
    );
  }

  const active = node.path === activePath;
  return (
    <button
      onClick={() => onOpen(node.path)}
      style={pad}
      className={cn(
        "flex w-full items-center gap-2 py-1 pr-2 text-left text-[13px] transition-colors",
        active ? "bg-accent/15 text-white" : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200",
      )}
    >
      <span className="w-3" />
      <FileIcon path={node.path} />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export function FileTree({
  files,
  activePath,
  onOpen,
  name,
}: {
  files: ProjectFile[];
  activePath: string;
  onOpen: (path: string) => void;
  name: string;
}) {
  const tree = buildTree(files);
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Explorer</span>
        <span className="font-mono text-[10px] text-neutral-600">{files.length} files</span>
      </div>
      <div className="mb-1 flex items-center gap-1.5 px-3 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
        <Chevron open />
        <span className="truncate">{name}</span>
      </div>
      <div className="flex-1 overflow-y-auto pb-3">
        {tree.map((node) => (
          <Node key={node.path} node={node} depth={0} activePath={activePath} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
