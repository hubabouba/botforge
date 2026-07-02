"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/marketing/Logo";
import { Close } from "@/components/icons";
import {
  addFile,
  deleteFile,
  getProject,
  renameFile,
  renameProject,
  writeFile,
  type StoredProject,
} from "@/lib/workspace/store";
import { downloadZip } from "@/lib/workspace/zip";
import { TopBar, type SaveStatus } from "./TopBar";
import { FileTree } from "./FileTree";
import { CodeEditor } from "./CodeEditor";
import { RunGuideModal } from "./RunGuideModal";
import { cn } from "@/lib/utils";

type LoadState = "loading" | "ready" | "missing";

export function Workspace({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<StoredProject | null>(null);
  const [load, setLoad] = useState<LoadState>("loading");
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [activePath, setActivePath] = useState("");
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [runOpen, setRunOpen] = useState(false);
  const savingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Load the project from the store on mount (client-only).
  useEffect(() => {
    const p = getProject(projectId);
    if (!p) {
      setLoad("missing");
      return;
    }
    setProject(p);
    setOpenPaths([p.entry]);
    setActivePath(p.entry);
    setLoad("ready");
  }, [projectId]);

  const refresh = useCallback(
    (next: StoredProject | null) => {
      if (next) setProject({ ...next });
    },
    [],
  );

  const pingSaving = useCallback(() => {
    setStatus("saving");
    clearTimeout(savingTimer.current);
    savingTimer.current = setTimeout(() => setStatus("saved"), 500);
  }, []);

  const onEditorChange = useCallback(
    (content: string) => {
      if (!project) return;
      refresh(writeFile(project.id, activePath, content));
      pingSaving();
    },
    [project, activePath, refresh, pingSaving],
  );

  const openFile = useCallback((path: string) => {
    setActivePath(path);
    setOpenPaths((prev) => (prev.includes(path) ? prev : [...prev, path]));
  }, []);

  const closeTab = useCallback(
    (path: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setOpenPaths((prev) => {
        const next = prev.filter((p) => p !== path);
        if (path === activePath) setActivePath(next[next.length - 1] ?? project?.entry ?? "");
        return next;
      });
    },
    [activePath, project],
  );

  const onAddFile = useCallback(
    (path: string) => {
      if (!project) return;
      const updated = addFile(project.id, path);
      refresh(updated);
      const created = updated?.files[updated.files.length - 1];
      if (created) openFile(created.path);
    },
    [project, refresh, openFile],
  );

  const onRenameFile = useCallback(
    (oldPath: string, newPath: string) => {
      if (!project) return;
      refresh(renameFile(project.id, oldPath, newPath));
      setOpenPaths((prev) => prev.map((p) => (p === oldPath ? newPath : p)));
      setActivePath((p) => (p === oldPath ? newPath : p));
    },
    [project, refresh],
  );

  const onDeleteFile = useCallback(
    (path: string) => {
      if (!project) return;
      const updated = deleteFile(project.id, path);
      refresh(updated);
      setOpenPaths((prev) => {
        const next = prev.filter((p) => p !== path);
        if (path === activePath) setActivePath(next[next.length - 1] ?? updated?.entry ?? "");
        return next;
      });
    },
    [project, activePath, refresh],
  );

  const onRenameProject = useCallback(
    (name: string) => {
      if (!project) return;
      refresh(renameProject(project.id, name));
    },
    [project, refresh],
  );

  // ---- Render states ----
  if (load === "loading") {
    return (
      <div className="grid h-screen place-items-center bg-ink-950 text-neutral-500">
        <div className="flex items-center gap-2 text-sm">
          <Logo className="h-5 w-5 animate-pulse" /> Loading workspace…
        </div>
      </div>
    );
  }

  if (load === "missing" || !project) {
    return (
      <div className="grid h-screen place-items-center bg-ink-950 px-6 text-center">
        <div className="max-w-sm">
          <Logo className="mx-auto h-8 w-8 opacity-70" />
          <h1 className="mt-4 text-lg font-medium text-neutral-100">Project not found</h1>
          <p className="mt-1 text-sm text-neutral-500">
            It may have been created on another device. Pick a template to start a new one.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const activeFile = project.files.find((f) => f.path === activePath) ?? project.files[0];

  return (
    <div className="flex h-screen flex-col bg-ink-950 text-neutral-200">
      <TopBar
        project={project}
        status={status}
        onRename={onRenameProject}
        onDownload={() => downloadZip(project.name, project.files)}
        onRun={() => setRunOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-ink-800 bg-ink-950 md:block">
          <FileTree
            files={project.files}
            activePath={activePath}
            onOpen={openFile}
            onAddFile={onAddFile}
            onRename={onRenameFile}
            onDelete={onDeleteFile}
            name={project.name}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Open-file tabs */}
          <div className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-ink-800 bg-ink-950 px-1.5">
            {openPaths.map((path) => {
              const name = path.split("/").pop();
              const active = path === activePath;
              return (
                <button
                  key={path}
                  onClick={() => setActivePath(path)}
                  className={cn(
                    "group/tab flex h-7 shrink-0 items-center gap-2 rounded-md px-2.5 text-[12px] transition-colors",
                    active ? "bg-ink-800 text-neutral-100" : "text-neutral-500 hover:bg-white/[0.04]",
                  )}
                >
                  <span className="font-mono">{name}</span>
                  <span
                    onClick={(e) => closeTab(path, e)}
                    className="grid h-4 w-4 place-items-center rounded text-neutral-600 opacity-0 transition-opacity hover:bg-white/10 hover:text-neutral-300 group-hover/tab:opacity-100"
                  >
                    <Close className="h-3 w-3" />
                  </span>
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1">
            {activeFile ? (
              <CodeEditor key={activeFile.path} file={activeFile} onChange={onEditorChange} />
            ) : (
              <div className="grid h-full place-items-center text-sm text-neutral-600">No file open</div>
            )}
          </div>
        </div>
      </div>

      {runOpen && <RunGuideModal project={project} onClose={() => setRunOpen(false)} />}
    </div>
  );
}
