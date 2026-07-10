"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/marketing/Logo";
import { Close } from "@/components/icons";
import {
  addFile,
  addFolder,
  deleteFile,
  deleteFolder,
  getProject,
  normalizePath,
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
import { WorkspaceChat } from "./WorkspaceChat";
import { ViewSwitcher, LogsPanel, PlanningPanel, MetricsPanel, type WorkView } from "./panels";
import { UpgradeModal } from "@/components/upgrade/UpgradeModal";
import { usePlan } from "@/hooks/usePlan";
import { planMeta, requiredPlan, type Capability, type Plan } from "@/lib/plan";
import { cn } from "@/lib/utils";

// Which capability each non-code view requires.
const CAP_FOR_VIEW: Record<Exclude<WorkView, "code">, Capability> = {
  logs: "panel.logs",
  planning: "panel.planning",
  metrics: "panel.metrics",
};

const VIEW_LABEL: Record<WorkView, string> = {
  code: "Code",
  logs: "Logs",
  planning: "AI Planning",
  metrics: "Metrics",
};

type LoadState = "loading" | "ready" | "missing";

export function Workspace({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<StoredProject | null>(null);
  const [load, setLoad] = useState<LoadState>("loading");
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [activePath, setActivePath] = useState("");
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [runOpen, setRunOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [view, setView] = useState<WorkView>("code");
  const [upgrade, setUpgrade] = useState<{ highlight: Plan; reason: string } | null>(null);
  const { plan, allows, hostingBeta } = usePlan();
  // Bumped when the assistant applies an edit, to remount the editor with fresh content.
  const [editorNonce, setEditorNonce] = useState(0);
  // Debounced autosave: hold the latest unsaved edit and flush it after a pause
  // (or immediately on Ctrl+S, file switch or unmount) so we don't POST per keystroke.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<{ id: string; path: string; content: string } | null>(null);

  // Load the project from Supabase on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getProject(projectId);
      if (cancelled) return;
      if (!p) {
        setLoad("missing");
        return;
      }
      setProject(p);
      setOpenPaths([p.entry]);
      setActivePath(p.entry);
      setLoad("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const refresh = useCallback((next: StoredProject | null) => {
    if (next) setProject({ ...next });
  }, []);

  // Persist whatever edit is pending right now (if any). Fire-and-forget.
  const flushSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    writeFile(p.id, p.path, p.content)
      .then(() => {
        // A newer edit may already be pending — don't claim "saved" over it.
        if (!pending.current) setStatus("saved");
      })
      .catch(() => setStatus("error"));
  }, []);

  // Last-resort flush when the tab/window closes before the debounce fires —
  // without it, up to 700ms of typing silently vanishes. keepalive lets the
  // request outlive the page.
  useEffect(() => {
    const onPageHide = () => {
      const p = pending.current;
      if (!p) return;
      pending.current = null;
      clearTimeout(saveTimer.current);
      void writeFile(p.id, p.path, p.content, { keepalive: true }).catch(() => {});
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  const onEditorChange = useCallback(
    (content: string) => {
      if (!project) return;
      // If the pending write is for a different file, flush it first so no edit is lost.
      if (pending.current && pending.current.path !== activePath) flushSave();
      // Optimistic local update so chat / download / tab-switch see fresh content.
      setProject((prev) =>
        prev ? { ...prev, files: prev.files.map((f) => (f.path === activePath ? { ...f, content } : f)) } : prev,
      );
      pending.current = { id: project.id, path: activePath, content };
      setStatus("saving");
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flushSave, 700);
    },
    [project, activePath, flushSave],
  );

  // Flush any unsaved edit when leaving the workspace.
  useEffect(() => () => flushSave(), [flushSave]);

  const openFile = useCallback((path: string) => {
    setActivePath(path);
    setOpenPaths((prev) => (prev.includes(path) ? prev : [...prev, path]));
  }, []);

  const closeTab = useCallback(
    (path: string, e: React.MouseEvent) => {
      e.stopPropagation();
      // Compute outside the updater — setState inside another updater re-runs
      // under StrictMode/concurrent rendering.
      const next = openPaths.filter((p) => p !== path);
      setOpenPaths(next);
      if (path === activePath) setActivePath(next[next.length - 1] ?? project?.entry ?? "");
    },
    [openPaths, activePath, project],
  );

  const onAddFile = useCallback(
    async (path: string) => {
      if (!project) return;
      const clean = normalizePath(path);
      refresh(await addFile(project.id, path));
      if (clean) openFile(clean);
    },
    [project, refresh, openFile],
  );

  const onAddFolder = useCallback(
    async (path: string) => {
      if (!project) return;
      refresh(await addFolder(project.id, path));
    },
    [project, refresh],
  );

  const onDeleteFolder = useCallback(
    async (path: string) => {
      if (!project) return;
      const updated = await deleteFolder(project.id, path);
      refresh(updated);
      const prefix = `${path}/`;
      const next = openPaths.filter((p) => p !== path && !p.startsWith(prefix));
      setOpenPaths(next);
      if (!next.includes(activePath)) setActivePath(next[next.length - 1] ?? updated?.entry ?? "");
    },
    [project, openPaths, activePath, refresh],
  );

  const onRenameFile = useCallback(
    async (oldPath: string, newPath: string) => {
      if (!project) return;
      const clean = normalizePath(newPath) || newPath;
      refresh(await renameFile(project.id, oldPath, newPath));
      setOpenPaths((prev) => prev.map((p) => (p === oldPath ? clean : p)));
      setActivePath((p) => (p === oldPath ? clean : p));
    },
    [project, refresh],
  );

  const onDeleteFile = useCallback(
    async (path: string) => {
      if (!project) return;
      const updated = await deleteFile(project.id, path);
      refresh(updated);
      const next = openPaths.filter((p) => p !== path);
      setOpenPaths(next);
      if (path === activePath) setActivePath(next[next.length - 1] ?? updated?.entry ?? "");
    },
    [project, openPaths, activePath, refresh],
  );

  const onRenameProject = useCallback(
    async (name: string) => {
      if (!project) return;
      refresh(await renameProject(project.id, name));
    },
    [project, refresh],
  );

  // Apply an edit proposed by the AI assistant: write (or create) the file,
  // open it, and remount the editor so the new content shows immediately.
  const onApplyEdit = useCallback(
    async (path: string, content: string) => {
      if (!project) return;
      try {
        const exists = project.files.some((f) => f.path === path);
        if (exists) {
          setProject((prev) =>
            prev ? { ...prev, files: prev.files.map((f) => (f.path === path ? { ...f, content } : f)) } : prev,
          );
          await writeFile(project.id, path, content);
        } else {
          refresh(await addFile(project.id, path, content));
        }
        setStatus("saved");
      } catch {
        setStatus("error");
      }
      openFile(path);
      setEditorNonce((n) => n + 1);
    },
    [project, refresh, openFile],
  );

  const isLocked = (v: WorkView) => v !== "code" && !allows(CAP_FOR_VIEW[v as Exclude<WorkView, "code">]);

  const selectView = (v: WorkView) => {
    if (!isLocked(v)) {
      setView(v);
      return;
    }
    const need = requiredPlan(CAP_FOR_VIEW[v as Exclude<WorkView, "code">]);
    setUpgrade({
      highlight: need,
      reason: `${VIEW_LABEL[v]} is part of the ${planMeta(need).name} plan.`,
    });
  };

  // ---- Render states ----
  if (load === "loading") {
    return (
      <div className="forge dark grid h-screen place-items-center bg-[#0A0B0F] text-white/50">
        <div className="flex items-center gap-2 text-sm">
          <Logo className="h-5 w-5 animate-pulse" /> Loading workspace…
        </div>
      </div>
    );
  }

  if (load === "missing" || !project) {
    return (
      <div className="forge dark grid h-screen place-items-center bg-[#0A0B0F] px-6 text-center">
        <div className="max-w-sm">
          <Logo className="mx-auto h-8 w-8 opacity-70" />
          <h1 className="mt-4 font-display text-lg font-semibold text-white">Project not found</h1>
          <p className="mt-1 text-sm text-white/50">
            It may have been created on another device. Pick a template to start a new one.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#6366F1] to-[#4F46E5] px-4 py-2 text-sm font-medium text-white shadow-[0_10px_30px_-10px_rgba(99,102,241,0.9)] transition-transform hover:-translate-y-0.5"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const activeFile = project.files.find((f) => f.path === activePath) ?? project.files[0];

  return (
    <div className="forge dark relative flex h-screen flex-col overflow-hidden bg-[#0A0B0F] text-neutral-200">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-[1] h-64 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(99,102,241,0.14),transparent_70%)]"
      />
      <TopBar
        project={project}
        status={status}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen((v) => !v)}
        onRename={onRenameProject}
        onDownload={() => downloadZip(project.name, project.files)}
        onRun={() => setRunOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-white/[0.06] bg-[#0A0B0F]/70 backdrop-blur-sm md:block">
          <FileTree
            files={project.files}
            folders={project.folders ?? []}
            activePath={activePath}
            onOpen={openFile}
            onAddFile={onAddFile}
            onAddFolder={onAddFolder}
            onRename={onRenameFile}
            onDelete={onDeleteFile}
            onDeleteFolder={onDeleteFolder}
            name={project.name}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <ViewSwitcher view={view} onSelect={selectView} isLocked={isLocked} />

          {view !== "code" ? (
            <div className="min-h-0 flex-1">
              {view === "logs" ? (
                <LogsPanel project={project} hostingAvailable={hostingBeta} onRun={() => setRunOpen(true)} />
              ) : view === "planning" ? (
                <PlanningPanel project={project} files={project.files} />
              ) : (
                <MetricsPanel project={project} hostingAvailable={hostingBeta} />
              )}
            </div>
          ) : (
            <>
          {/* Open-file tabs */}
          <div className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-white/[0.06] bg-[#0A0B0F]/70 px-1.5">
            {openPaths.map((path) => {
              const name = path.split("/").pop();
              const active = path === activePath;
              return (
                <div
                  key={path}
                  onClick={() => setActivePath(path)}
                  onMouseDown={(e) => {
                    if (e.button === 1) closeTab(path, e); // middle-click closes
                  }}
                  className={cn(
                    "group/tab relative flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md pl-2.5 pr-1.5 text-[12px] transition-colors",
                    active
                      ? "bg-white/[0.06] text-white"
                      : "text-neutral-500 hover:bg-white/[0.04] hover:text-neutral-300",
                  )}
                >
                  <span className="font-mono">{name}</span>
                  <button
                    aria-label={`Close ${name}`}
                    onClick={(e) => closeTab(path, e)}
                    className={cn(
                      "grid h-4 w-4 place-items-center rounded transition-colors hover:bg-white/10 hover:text-neutral-200",
                      active ? "text-neutral-400" : "text-neutral-600 opacity-60 group-hover/tab:opacity-100",
                    )}
                  >
                    <Close className="h-3 w-3" />
                  </button>
                  {active && (
                    <span className="pointer-events-none absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-[#6366F1] to-[#22D3EE]" />
                  )}
                </div>
              );
            })}
          </div>

          <div className="min-h-0 flex-1">
            {activeFile ? (
              <CodeEditor
                key={`${activeFile.path}#${editorNonce}`}
                file={activeFile}
                onChange={onEditorChange}
                onSave={flushSave}
              />
            ) : (
              <div className="grid h-full place-items-center text-sm text-neutral-600">No file open</div>
            )}
          </div>
            </>
          )}
        </div>

        {chatOpen && (
          <aside className="hidden w-[340px] shrink-0 border-l border-white/[0.06] bg-[#0A0B0F]/50 lg:block xl:w-[380px]">
            <WorkspaceChat
              project={project}
              files={project.files}
              onApplyEdit={onApplyEdit}
              onCollapse={() => setChatOpen(false)}
            />
          </aside>
        )}
      </div>

      {runOpen && <RunGuideModal project={project} onClose={() => setRunOpen(false)} />}

      {upgrade && (
        <UpgradeModal
          current={plan}
          highlight={upgrade.highlight}
          reason={upgrade.reason}
          onClose={() => setUpgrade(null)}
        />
      )}
    </div>
  );
}
