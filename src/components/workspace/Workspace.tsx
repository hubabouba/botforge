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
  saveProjectPlan,
  writeFile,
  type StoredProject,
} from "@/lib/workspace/store";
import { nextProgress, PROGRESS_PATH, type ProgressEntry } from "@/lib/workspace/progress";
import { parsePlan, withDone } from "@/lib/workspace/plan";
import { downloadZip } from "@/lib/workspace/zip";
import { TopBar, type SaveStatus } from "./TopBar";
import { FileTree, FileDot } from "./FileTree";
import { CodeEditor } from "./CodeEditor";
import { RunGuideModal } from "./RunGuideModal";
import { WorkspaceChat } from "./WorkspaceChat";
import { FirstRunChecklist } from "./FirstRunChecklist";
import { useHostingStatus } from "@/hooks/useHostingStatus";
import { ViewSwitcher, LogsPanel, PlanningPanel, MetricsPanel, type WorkView } from "./panels";
import { UpgradeModal } from "@/components/upgrade/UpgradeModal";
import { usePlan } from "@/hooks/usePlan";
import { useCompactViewport } from "@/hooks/useCompactViewport";
import { planMeta, requiredPlan, type Capability, type Plan } from "@/lib/plan";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { cn } from "@/lib/utils";

// Which capability each non-code view requires.
/**
 * How many times a failed autosave retries itself before giving up and simply
 * staying pending. Bounded so a server that refuses every write (a 400 on a
 * file that outgrew a limit, say) doesn't retry forever at the user's expense.
 */
const SAVE_RETRIES = 3;

/**
 * How many plan steps one click on Run may work through.
 *
 * Each step is a full assistant message — same cost, same quota. A twelve-step
 * plan run in one go is twelve messages before the user has seen whether the
 * first one was any good, and on Basic that is more than half a day's
 * allowance. Five is enough to feel like real progress and small enough that a
 * wrong plan costs little to discover.
 */
const RUN_BATCH_STEPS = 5;

const CAP_FOR_VIEW: Record<Exclude<WorkView, "code">, Capability> = {
  logs: "panel.logs",
  planning: "panel.planning",
  metrics: "panel.metrics",
};

const VIEW_LABEL_KEY: Record<WorkView, string> = {
  code: "ws.viewCode",
  logs: "ws.viewLogs",
  planning: "ws.viewPlanning",
  metrics: "ws.viewMetrics",
};

type LoadState = "loading" | "ready" | "missing";

export function Workspace({ projectId }: { projectId: string }) {
  const { t, lang } = useI18n();
  const [project, setProject] = useState<StoredProject | null>(null);
  const [load, setLoad] = useState<LoadState>("loading");
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [activePath, setActivePath] = useState("");
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [runOpen, setRunOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [view, setView] = useState<WorkView>("code");
  // Narrow screens can't fit tree + editor + chat side by side, so they get a
  // two-tab layout instead. Chat is the default tab: building a bot by asking
  // for it is the part that genuinely works on a phone — typing code doesn't.
  const compact = useCompactViewport();
  const [mobileTab, setMobileTab] = useState<"chat" | "code">("chat");
  // In compact mode the tree isn't a sidebar; it takes over the code pane until
  // a file is picked.
  const [treeOpen, setTreeOpen] = useState(false);
  // The build plan lives here, not inside PlanningPanel: that panel unmounts
  // the moment the user switches to Code (or to the Chat tab on a phone), which
  // used to throw the freshly generated plan away. Persisted per project so a
  // reload doesn't lose it either.
  // ("buildPlan", not "plan" — `plan` in this file is the subscription tier.)
  const [buildPlan, setBuildPlan] = useState("");
  // A plan run: the assistant works through these steps one message at a time,
  // ticking each off as it reports the step finished. Lives here, not in the
  // chat or the panel, because the user is expected to move between the two
  // tabs while it runs — either component unmounting would kill the run.
  const [planRun, setPlanRun] = useState<{ steps: string[]; index: number } | null>(null);
  // Why the last run ended before the end of the list.
  const [runNote, setRunNote] = useState("");
  // Goal handed the other way — the assistant decided this is a planning
  // request and called open_plan, so we switch to Planning and build it there.
  const [planGoal, setPlanGoal] = useState("");
  // First-run progress. Real state, not guesses: whether they've talked to the
  // assistant, whether a bot token exists, whether the bot has ever started.
  const [hasChatted, setHasChatted] = useState(false);
  const [upgrade, setUpgrade] = useState<{ highlight: Plan; reason: string } | null>(null);
  // A failed file-tree operation (add/rename/delete) would otherwise be silent.
  const [treeError, setTreeError] = useState("");
  const { plan, allows, hostingAvailable } = usePlan();
  // Drives the first-run checklist: a stored token and a past start are real
  // signals, so the checklist reflects the account rather than this browser.
  const { status: hostingStatus } = useHostingStatus(projectId, hostingAvailable);
  const hosting = {
    hasToken: (hostingStatus?.secretNames.length ?? 0) > 0,
    hasRun: !!hostingStatus?.startedAt || (hostingStatus?.restartCount ?? 0) > 0,
  };
  // Bumped when the assistant applies an edit, to remount the editor with fresh content.
  const [editorNonce, setEditorNonce] = useState(0);
  // Debounced autosave: hold the latest unsaved edit and flush it after a pause
  // (or immediately on Ctrl+S, file switch or unmount) so we don't POST per keystroke.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<{ id: string; path: string; content: string } | null>(null);
  /** Consecutive failed saves, so a server that keeps refusing isn't retried forever. */
  const saveRetries = useRef(0);

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
      setBuildPlan(p.plan ?? "");
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

  // ---- Build plan persistence (server-side, so it follows the account) ----
  // Debounced: the plan streams in token by token, and one PATCH per token
  // would hammer the API for no benefit.
  const planSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const onPlanChange = useCallback(
    (next: string) => {
      setBuildPlan(next);
      clearTimeout(planSaveTimer.current);
      planSaveTimer.current = setTimeout(() => void saveProjectPlan(projectId, next), 800);
    },
    [projectId],
  );

  useEffect(() => () => clearTimeout(planSaveTimer.current), []);

  // ---- Plan run ------------------------------------------------------------

  // The step's result arrives long after the message was sent, from a callback
  // the chat captured at send time. Read the run and the plan through refs so a
  // Stop pressed mid-step is actually honoured, instead of the stale closure
  // quietly restarting the run it just cancelled.
  const runRef = useRef<{ steps: string[]; index: number } | null>(null);
  const planRef = useRef("");
  useEffect(() => {
    runRef.current = planRun;
  }, [planRun]);
  useEffect(() => {
    planRef.current = buildPlan;
  }, [buildPlan]);

  /** Set when a run was cut to a batch, so the closing note says so. */
  const batchedRef = useRef(false);

  const startRun = useCallback((steps: string[]) => {
    if (!steps.length) return;
    setRunNote("");
    // One click here sends one full assistant message per step, and a generated
    // plan routinely has a dozen. Unbatched, a single click could spend a Basic
    // account's whole day of messages before the user saw a single result they
    // might not even want. Run a batch, then let them look at it and decide —
    // the remaining steps stay unticked, so Run picks up exactly where this
    // left off.
    const batch = steps.slice(0, RUN_BATCH_STEPS);
    batchedRef.current = batch.length < steps.length;
    setPlanRun({ steps: batch, index: 0 });
  }, []);

  const stopRun = useCallback(() => setPlanRun(null), []);

  /**
   * One step came back. A clean "done" ticks it off and moves on; anything else
   * stops the run. Ploughing ahead past a step that didn't happen just builds
   * the later ones on top of a hole — and the user is right there in the chat,
   * reading whatever the assistant said instead.
   */
  const onStepResult = useCallback(
    ({ done, blocked, failed }: { done: boolean; blocked: boolean; failed: boolean }) => {
      const current = runRef.current;
      if (!current) return; // stopped while this step was in flight
      if (!done) {
        setPlanRun(null);
        setRunNote(
          (blocked ? t("panel.runBlocked") : failed ? t("panel.runFailed") : t("panel.runNotDone")).replace(
            "{n}",
            String(current.index + 1),
          ),
        );
        return;
      }
      onPlanChange(withDone(planRef.current, [...parsePlan(planRef.current).done, current.steps[current.index]]));
      const next = current.index + 1;
      if (next < current.steps.length) {
        setPlanRun({ ...current, index: next });
      } else {
        setPlanRun(null);
        // "Finished" would be a lie when the batch was only part of the plan.
        setRunNote(batchedRef.current ? t("panel.runBatchDone") : t("panel.runFinished"));
      }
    },
    [onPlanChange, t],
  );

  // Persist whatever edit is pending right now (if any). Fire-and-forget.
  const flushSave = useCallback(function flush() {
    clearTimeout(saveTimer.current);
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    writeFile(p.id, p.path, p.content)
      .then(() => {
        saveRetries.current = 0;
        // A newer edit may already be pending — don't claim "saved" over it.
        if (!pending.current) setStatus("saved");
      })
      .catch(() => {
        setStatus("error");
        // Put the edit back, and try again.
        //
        // It used to be dropped here: cleared before the write, never restored,
        // so a single failed request lost that text permanently. The pagehide
        // handler below could not rescue it either — it reads pending.current,
        // which was already null. All the user got was a rose dot reading
        // "save failed", in 11px, and `hidden sm:flex` means on a phone not
        // even that. Then they close the tab and the work is gone.
        //
        // Only restore if nothing newer arrived while we were away; a fresher
        // edit for the same file supersedes this one and must not be rolled
        // back over.
        if (pending.current) return;
        pending.current = p;
        if (saveRetries.current >= SAVE_RETRIES) return; // stop; the edit stays pending for pagehide
        saveRetries.current += 1;
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(flush, 1500 * saveRetries.current);
      });
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
    // Compact layout only: picking a file hands the pane back to the editor.
    setTreeOpen(false);
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
      const updated = await addFile(project.id, path);
      refresh(updated);
      setTreeError(updated ? "" : t("tree.fileOpFailed"));
      // Only open a tab for a file that really got created — a failed request
      // must not leave a phantom tab pointing at nothing (the editor would
      // then silently show a different file than the highlighted tab).
      if (clean && updated?.files.some((f) => f.path === clean)) openFile(clean);
    },
    [project, refresh, openFile, t],
  );

  const onAddFolder = useCallback(
    async (path: string) => {
      if (!project) return;
      const updated = await addFolder(project.id, path);
      refresh(updated);
      setTreeError(updated ? "" : t("tree.fileOpFailed"));
    },
    [project, refresh, t],
  );

  const onDeleteFolder = useCallback(
    async (path: string) => {
      if (!project) return;
      const updated = await deleteFolder(project.id, path);
      refresh(updated);
      setTreeError(updated ? "" : t("tree.fileOpFailed"));
      if (!updated) return;
      const prefix = `${path}/`;
      const next = openPaths.filter((p) => p !== path && !p.startsWith(prefix));
      setOpenPaths(next);
      if (!next.includes(activePath)) setActivePath(next[next.length - 1] ?? updated?.entry ?? "");
    },
    [project, openPaths, activePath, refresh, t],
  );

  const onRenameFile = useCallback(
    async (oldPath: string, newPath: string) => {
      if (!project) return;
      const clean = normalizePath(newPath) || newPath;
      const updated = await renameFile(project.id, oldPath, newPath);
      refresh(updated);
      setTreeError(updated ? "" : t("tree.fileOpFailed"));
      if (!updated) return;
      setOpenPaths((prev) => prev.map((p) => (p === oldPath ? clean : p)));
      setActivePath((p) => (p === oldPath ? clean : p));
    },
    [project, refresh, t],
  );

  const onDeleteFile = useCallback(
    async (path: string) => {
      if (!project) return;
      const updated = await deleteFile(project.id, path);
      refresh(updated);
      setTreeError(updated ? "" : t("tree.fileOpFailed"));
      if (!updated) return;
      const next = openPaths.filter((p) => p !== path);
      setOpenPaths(next);
      if (path === activePath) setActivePath(next[next.length - 1] ?? updated?.entry ?? "");
    },
    [project, openPaths, activePath, refresh, t],
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
      // A debounced autosave may still hold pre-Apply keystrokes. For the SAME
      // file the AI content supersedes them — letting that stale timer fire
      // would silently overwrite the applied edit back in the DB. A pending
      // edit to a DIFFERENT file is flushed as usual so nothing is lost.
      if (pending.current) {
        if (pending.current.path === path) {
          pending.current = null;
          clearTimeout(saveTimer.current);
        } else {
          flushSave();
        }
      }
      try {
        const exists = project.files.some((f) => f.path === path);
        if (exists) {
          setProject((prev) =>
            prev ? { ...prev, files: prev.files.map((f) => (f.path === path ? { ...f, content } : f)) } : prev,
          );
          await writeFile(project.id, path, content);
        } else {
          // Show the new file before the round-trip finishes. During a plan run
          // the next step is sent the moment this one reports back, and it has
          // to see the file this step just created — waiting on the server
          // would hand the model a project that's one step out of date.
          setProject((prev) => (prev ? { ...prev, files: [...prev.files, { path, content }] } : prev));
          const created = await addFile(project.id, path, content);
          // addFile answers null on a rejected write rather than throwing, so
          // this branch used to fall straight through to setStatus("saved").
          // The optimistic file stayed in the tree, the status bar said the
          // work was safe, and the file was gone at the next reload — with the
          // user having built on top of it in between. A project at the 200-file
          // limit is enough to trigger it.
          if (!created) {
            setProject((prev) =>
              prev ? { ...prev, files: prev.files.filter((f) => f.path !== path) } : prev,
            );
            setStatus("error");
            setTreeError(t("tree.fileOpFailed"));
            return; // don't open a tab for a file that doesn't exist
          }
          refresh(created);
        }
        setStatus("saved");
      } catch {
        setStatus("error");
      }
      openFile(path);
      setEditorNonce((n) => n + 1);
    },
    [project, refresh, openFile, flushSave, t],
  );

  /**
   * Record one finished exchange in the project's journal (see progress.ts).
   *
   * Deliberately quiet: no open tab, no editor remount, no save-status flicker.
   * It runs after the reply is already on screen, and if it fails the user has
   * lost a line in a log, not any work — so it must not interrupt anything.
   */
  const onProgressNote = useCallback(
    async (entry: ProgressEntry) => {
      if (!project) return;
      const existing = project.files.find((f) => f.path === PROGRESS_PATH);
      // A pending keystroke in this very file would be flushed on top of what we
      // write, undoing it. Rare — nobody edits the journal mid-conversation —
      // but the loser is the entry, so skip this one rather than fight over it.
      if (pending.current?.path === PROGRESS_PATH) return;

      const content = nextProgress(
        existing?.content ?? null,
        entry,
        {
          title: t("progress.title"),
          intro: t("progress.intro"),
          asked: t("progress.asked"),
          changed: t("progress.changed"),
          reply: t("progress.reply"),
        },
        lang,
      );
      // null = a PROGRESS.md the user wrote themselves. Leave it alone.
      if (content === null) return;

      try {
        if (existing) {
          setProject((prev) =>
            prev
              ? { ...prev, files: prev.files.map((f) => (f.path === PROGRESS_PATH ? { ...f, content } : f)) }
              : prev,
          );
          await writeFile(project.id, PROGRESS_PATH, content);
        } else {
          const created = await addFile(project.id, PROGRESS_PATH, content);
          if (created) refresh(created);
        }
      } catch {
        /* the journal is a convenience — never let it disturb the session */
      }
    },
    [project, refresh, t, lang],
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
      reason: t("ws.viewLockedReason")
        .replace("{view}", t(VIEW_LABEL_KEY[v]))
        .replace("{plan}", planMeta(need).name),
    });
  };

  // ---- Render states ----
  if (load === "loading") {
    return (
      <div className="forge dark grid h-screen place-items-center bg-ink-950 text-white/50">
        <div className="flex items-center gap-2 text-sm">
          <Logo className="h-5 w-5 animate-pulse" /> {t("ws.loading")}
        </div>
      </div>
    );
  }

  if (load === "missing" || !project) {
    return (
      <div className="forge dark grid h-screen place-items-center bg-ink-950 px-6 text-center">
        <div className="max-w-sm">
          <Logo className="mx-auto h-8 w-8 opacity-70" />
          <h1 className="mt-4 font-display text-lg font-semibold text-white">{t("ws.projectNotFound")}</h1>
          <p className="mt-1 text-sm text-white/50">{t("ws.projectNotFoundHint")}</p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            {t("ws.backToDashboard")}
          </Link>
        </div>
      </div>
    );
  }

  const activeFile = project.files.find((f) => f.path === activePath) ?? project.files[0];

  return (
    <div className="forge dark relative flex h-screen flex-col overflow-hidden bg-ink-950 text-neutral-200">
      <TopBar
        project={project}
        status={status}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen((v) => !v)}
        onRename={onRenameProject}
        onDownload={() => downloadZip(project.name, project.files)}
        // Green "Run" = run on Botforge hosting: jump to the Logs/Hosting panel
        // for anyone whose plan can host; free users fall back to the local guide.
        onRun={() => (hostingAvailable ? selectView("logs") : setRunOpen(true))}
      />

      {/* The path from "code exists" to "my bot answered me". Disappears for
          good once every step is done. */}
      <FirstRunChecklist
        project={project}
        hasChatted={hasChatted}
        hasToken={hosting.hasToken}
        hasRun={hosting.hasRun}
        onOpenRun={() => (hostingAvailable ? selectView("logs") : setRunOpen(true))}
      />

      {/* Tab bar for the compact layout. Visibility is CSS (`lg:hidden`), not
          the `compact` flag, so a phone gets the right layout on the very first
          paint instead of flashing the desktop columns until the hook resolves.
          Above `lg` all three panes fit at once and there's nothing to switch. */}
      <div className="flex shrink-0 items-center gap-1 border-b border-ink-800 bg-ink-950 px-2 py-1.5 lg:hidden">
        {(["chat", "code"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              mobileTab === tab
                ? "bg-ink-800 text-white"
                : "text-neutral-500 hover:bg-white/[0.04] hover:text-neutral-300",
            )}
          >
            {tab === "chat" ? t("ws.tabChat") : t("ws.tabCode")}
          </button>
        ))}
        {mobileTab === "code" && (
          <button
            onClick={() => setTreeOpen((v) => !v)}
            aria-pressed={treeOpen}
            className={cn(
              "ml-auto rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
              treeOpen
                ? "border-accent/40 bg-accent/15 text-[#a5b4fc]"
                : "border-ink-700 text-neutral-400 hover:text-neutral-200",
            )}
          >
            {t("ws.tabFiles")}
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar above `lg`; below it, a full-width file list that takes over
            the code pane until a file is picked. */}
        <aside
          className={cn(
            "w-full shrink-0 bg-ink-950/70 backdrop-blur-sm lg:block lg:w-60 lg:border-r lg:border-ink-800",
            mobileTab === "code" && treeOpen ? "block" : "hidden",
          )}
        >
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
            error={treeError}
          />
        </aside>

        <div
          className={cn(
            "min-w-0 flex-1 flex-col lg:flex",
            mobileTab === "code" && !treeOpen ? "flex" : "hidden",
          )}
        >
          <ViewSwitcher view={view} onSelect={selectView} isLocked={isLocked} />

          {view !== "code" ? (
            // Keyed on the view so React remounts it — without that the class
            // sits on an element that never re-enters and the animation runs
            // once, on the first switch only.
            <div key={view} className="panel-swap min-h-0 flex-1">
              {view === "logs" ? (
                <LogsPanel project={project} hostingAvailable={hostingAvailable} onRun={() => setRunOpen(true)} />
              ) : view === "planning" ? (
                <PlanningPanel
                  project={project}
                  files={project.files}
                  plan={buildPlan}
                  onPlanChange={onPlanChange}
                  incomingGoal={planGoal}
                  onGoalConsumed={() => setPlanGoal("")}
                  run={planRun}
                  runNote={runNote}
                  onStopRun={stopRun}
                  // Start the run and make sure the chat is visible: the steps
                  // are built there, and watching it work is half the point.
                  onRunSteps={(steps) => {
                    startRun(steps);
                    setChatOpen(true);
                    // On a phone the panel and the chat are separate tabs, so
                    // reaching the chat means leaving Planning. On a desktop
                    // both are on screen at once — stay put.
                    if (compact) {
                      setView("code");
                      setMobileTab("chat");
                    }
                  }}
                />
              ) : (
                <MetricsPanel project={project} hostingAvailable={hostingAvailable} />
              )}
            </div>
          ) : (
            <>
          {/* Open-file tabs */}
          <div className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-ink-800 bg-ink-950/70 px-1.5">
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
                    "group/tab relative flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md pl-2.5 pr-1.5 text-xs transition-colors",
                    active
                      ? "bg-ink-800 text-white"
                      : "text-neutral-500 hover:bg-white/[0.04] hover:text-neutral-300",
                  )}
                >
                  <FileDot path={path} />
                  <span className="font-mono">{name}</span>
                  <button
                    aria-label={`${t("ws.close")} ${name}`}
                    onClick={(e) => closeTab(path, e)}
                    className={cn(
                      "grid h-4 w-4 place-items-center rounded transition-colors hover:bg-white/10 hover:text-neutral-200",
                      active ? "text-neutral-400" : "text-neutral-600 opacity-60 group-hover/tab:opacity-100",
                    )}
                  >
                    <Close className="h-3 w-3" />
                  </button>
                  {active && (
                    <span className="pointer-events-none absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />
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
              <div className="grid h-full place-items-center text-sm text-neutral-600">{t("ws.noFileOpen")}</div>
            )}
          </div>
            </>
          )}
        </div>

        {/* Kept mounted when collapsed (CSS-hidden): unmounting would wipe the
            conversation and abort a mid-stream reply every time the user
            toggles the panel for more editor room — or switches tabs on a
            phone, where that would happen constantly. */}
        <aside
          className={cn(
            "w-full shrink-0 bg-ink-950/50 lg:w-[340px] lg:border-l lg:border-ink-800 xl:w-[380px]",
            mobileTab === "chat" ? "block" : "hidden",
            chatOpen ? "lg:block" : "lg:hidden",
          )}
        >
          <WorkspaceChat
            project={project}
            files={project.files}
            onApplyEdit={onApplyEdit}
            onProgressNote={onProgressNote}
            // Compact layout: opening a file from an edit card has to switch
            // the pane back to the editor, or the file opens behind the chat.
            onOpenFile={(path) => {
              openFile(path);
              setMobileTab("code");
            }}
            compact={compact}
            buildPlan={buildPlan}
            run={planRun}
            onStepResult={onStepResult}
            onStopRun={stopRun}
            onActivity={() => setHasChatted(true)}
            // The assistant asked for the Planning tab — take the user there.
            onOpenPlan={(goal) => {
              setPlanGoal(goal);
              if (!isLocked("planning")) setView("planning");
              setMobileTab("code");
            }}
            // On a phone there's no "rest of the workspace" to reveal by
            // collapsing — closing the chat just moves to the code tab.
            onCollapse={() => (compact ? setMobileTab("code") : setChatOpen(false))}
          />
        </aside>
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
