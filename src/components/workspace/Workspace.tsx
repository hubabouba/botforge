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
  const { plan, allows } = usePlan();
  // Bumped when the assistant applies an edit, to remount the editor with fresh content.
  const [editorNonce, setEditorNonce] = useState(0);
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

  const onAddFolder = useCallback(
    (path: string) => {
      if (!project) return;
      refresh(addFolder(project.id, path));
    },
    [project, refresh],
  );

  const onDeleteFolder = useCallback(
    (path: string) => {
      if (!project) return;
      const updated = deleteFolder(project.id, path);
      refresh(updated);
      const prefix = `${path}/`;
      setOpenPaths((prev) => {
        const next = prev.filter((p) => p !== path && !p.startsWith(prefix));
        if (!next.includes(activePath)) setActivePath(next[next.length - 1] ?? updated?.entry ?? "");
        return next;
      });
    },
    [project, activePath, refresh],
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

  // Apply an edit proposed by the AI assistant: write (or create) the file,
  // open it, and remount the editor so the new content shows immediately.
  const onApplyEdit = useCallback(
    (path: string, content: string) => {
      if (!project) return;
      const exists = project.files.some((f) => f.path === path);
      const updated = exists ? writeFile(project.id, path, content) : addFile(project.id, path, content);
      refresh(updated);
      openFile(path);
      setEditorNonce((n) => n + 1);
      pingSaving();
    },
    [project, refresh, openFile, pingSaving],
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
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen((v) => !v)}
        onRename={onRenameProject}
        onDownload={() => downloadZip(project.name, project.files)}
        onRun={() => setRunOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-ink-800 bg-ink-950 md:block">
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
                <LogsPanel onRun={() => setRunOpen(true)} />
              ) : view === "planning" ? (
                <PlanningPanel project={project} files={project.files} />
              ) : (
                <MetricsPanel />
              )}
            </div>
          ) : (
            <>
          {/* Open-file tabs */}
          <div className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-ink-800 bg-ink-950 px-1.5">
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
                    "group/tab flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md pl-2.5 pr-1.5 text-[12px] transition-colors",
                    active ? "bg-ink-800 text-neutral-100" : "text-neutral-500 hover:bg-white/[0.04]",
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
                onSave={pingSaving}
              />
            ) : (
              <div className="grid h-full place-items-center text-sm text-neutral-600">No file open</div>
            )}
          </div>
            </>
          )}
        </div>

        {chatOpen && (
          <aside className="hidden w-[340px] shrink-0 border-l border-ink-800 lg:block xl:w-[380px]">
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
