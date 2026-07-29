"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import type { Project, ProjectFile } from "@/lib/workspace/types";
import { loadPrefs } from "@/lib/workspace/assistantPrefs";
import { mergeGaps, parsePlan, planForModel, withDone } from "@/lib/workspace/plan";
import { readAssistantStream } from "@/lib/ai/streamClient";
import { HostingPanel, formatRuntime, STATUS_META } from "./HostingPanel";
import { MermaidDiagram } from "./MermaidDiagram";
import { useHostingStatus } from "@/hooks/useHostingStatus";
import { CodeIcon, Terminal, ListChecks, Chart, Lock, Play, Bot, Check } from "@/components/icons";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { cn } from "@/lib/utils";

export type WorkView = "code" | "logs" | "planning" | "metrics";

interface ViewDef {
  id: WorkView;
  labelKey: string;
  icon: (p: { className?: string }) => ReactElement;
}

export const VIEWS: ViewDef[] = [
  { id: "code", labelKey: "panel.viewCode", icon: CodeIcon },
  { id: "logs", labelKey: "panel.viewLogs", icon: Terminal },
  { id: "planning", labelKey: "panel.viewPlanning", icon: ListChecks },
  { id: "metrics", labelKey: "panel.viewMetrics", icon: Chart },
];

/** Slim segmented switcher above the editor. Locked views show a padlock. */
export function ViewSwitcher({
  view,
  onSelect,
  isLocked,
}: {
  view: WorkView;
  onSelect: (v: WorkView) => void;
  isLocked: (v: WorkView) => boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-ink-800 bg-ink-950 px-1.5">
      {VIEWS.map((v) => {
        const active = view === v.id;
        const locked = isLocked(v.id);
        return (
          <button
            key={v.id}
            onClick={() => onSelect(v.id)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors",
              active ? "bg-ink-800 text-neutral-100" : "text-neutral-500 hover:bg-white/[0.04] hover:text-neutral-300",
            )}
          >
            <v.icon className="h-3.5 w-3.5" />
            {t(v.labelKey)}
            {locked && <Lock className="h-3 w-3 text-neutral-500" />}
          </button>
        );
      })}
    </div>
  );
}

/** Shared empty-state shell for the panels. */
function PanelShell({
  icon: Icon,
  title,
  children,
  wide,
}: {
  icon: (p: { className?: string }) => ReactElement;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className={cn("mx-auto", wide ? "max-w-4xl" : "max-w-2xl")}>
        <div className="mb-4 flex items-center gap-2 text-neutral-300">
          <Icon className="h-4 w-4 text-neutral-400" />
          <h2 className="text-sm font-medium">{title}</h2>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---- Logs / Run ----------------------------------------------------------

export function LogsPanel({
  project,
  hostingAvailable,
  onRun,
}: {
  project: Project;
  hostingAvailable: boolean;
  onRun: () => void;
}) {
  const { t } = useI18n();
  // Basic+ accounts get the real hosting control; everyone else keeps the honest
  // "run locally" path (also a good fallback if hosting ever has an incident).
  if (hostingAvailable) {
    return (
      <PanelShell icon={Terminal} title={t("panel.runAndLogs")} wide>
        <HostingPanel project={project} />
        <button
          onClick={onRun}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-white/[0.06]"
        >
          <Play className="h-3.5 w-3.5" /> {t("panel.runLocallyInstead")}
        </button>
      </PanelShell>
    );
  }

  return (
    <PanelShell icon={Terminal} title={t("panel.viewLogs")}>
      <div className="rounded-xl border border-ink-800 bg-ink-950 font-mono text-xs">
        <div className="border-b border-ink-800 px-3 py-2 text-neutral-500">{t("hosting.console")}</div>
        <div className="p-4 text-neutral-500">
          <p className="text-neutral-400">{t("panel.noLiveLogsYet")}</p>
          <p className="mt-2 leading-relaxed">{t("panel.hostedRunsComing")}</p>
        </div>
      </div>
      <button
        onClick={onRun}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
      >
        <Play className="h-3.5 w-3.5" /> {t("panel.runLocally")}
      </button>
    </PanelShell>
  );
}

// ---- Metrics -------------------------------------------------------------

function uptimeLabel(startedAt: number | null, running: boolean): string {
  if (!running || !startedAt) return "—";
  const s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

function Tile({ label, value, hint, muted }: { label: string; value: string; hint: string; muted?: boolean }) {
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900/50 p-3.5">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold", muted ? "text-neutral-600" : "text-neutral-200")}>{value}</div>
      <div className="mt-0.5 text-[11px] text-neutral-600">{hint}</div>
    </div>
  );
}

export function MetricsPanel({
  project,
  hostingAvailable,
}: {
  project: Project;
  hostingAvailable: boolean;
}) {
  const { t } = useI18n();
  const { status } = useHostingStatus(project.id, hostingAvailable);
  const running = status?.status === "running";

  if (!hostingAvailable) {
    return (
      <PanelShell icon={Chart} title={t("panel.viewMetrics")}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {["panel.activeUsers", "panel.messages", "panel.errors", "panel.uptime"].map((key) => (
            <Tile key={key} label={t(key)} value="—" hint="" muted />
          ))}
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-neutral-500">{t("panel.metricsComingHint")}</p>
      </PanelShell>
    );
  }

  const usage = status?.usage ?? null;
  const hasBudget = !!usage && usage.limitSeconds >= 0;
  const budgetPct =
    hasBudget && usage!.limitSeconds > 0 ? Math.min(100, Math.round((usage!.usedSeconds / usage!.limitSeconds) * 100)) : 0;
  const budgetLeft = hasBudget ? Math.max(0, usage!.limitSeconds - usage!.usedSeconds) : 0;

  return (
    <PanelShell icon={Chart} title={t("panel.viewMetrics")} wide>
      {/* Real process health (cheap — straight from the deployment record). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label={t("panel.status")} value={t(STATUS_META[status?.status ?? "stopped"].labelKey)} hint={t("panel.live")} />
        <Tile label={t("panel.uptime")} value={uptimeLabel(status?.startedAt ?? null, running)} hint={t("panel.sinceStart")} />
        <Tile label={t("panel.restarts")} value={String(status?.restartCount ?? 0)} hint={t("panel.thisDeployment")} />
        <Tile
          label={t("panel.runtime")}
          value={usage ? formatRuntime(usage.usedSeconds) : "—"}
          hint={hasBudget ? `${t("panel.of")} ${formatRuntime(usage!.limitSeconds)} ${t("hosting.thisMonth")}` : t("hosting.thisMonth")}
        />
      </div>

      {/* Monthly runtime budget — real, straight from hosting_usage. */}
      {hasBudget && (
        <div className="mt-3 rounded-xl border border-ink-800 bg-ink-900/50 p-4">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-neutral-500">
            <span>{t("panel.runtimeBudget")}</span>
            <span className={cn(budgetPct >= 90 && "text-rose-400")}>{budgetPct}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-800">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                budgetPct >= 90 ? "bg-rose-500" : "bg-accent",
              )}
              style={{ width: `${budgetPct}%` }}
            />
          </div>
          <div className="mt-1.5 text-[11px] text-neutral-500">
            {formatRuntime(usage!.usedSeconds)} / {formatRuntime(usage!.limitSeconds)} {t("hosting.thisMonth")} · {t("panel.budgetLeft")}: {formatRuntime(budgetLeft)}
          </div>
        </div>
      )}

      {/* Honestly-labelled "coming later" — needs the bot to report its own events. */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Tile label={t("panel.activeUsers")} value="—" hint={t("panel.comingLater")} muted />
        <Tile label={t("panel.messages")} value="—" hint={t("panel.comingLater")} muted />
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-neutral-500">{t("panel.liveMetricsHint")}</p>
    </PanelShell>
  );
}

// ---- Planning (real, AI-driven) ------------------------------------------

export function PlanningPanel({
  project,
  files,
  plan,
  onPlanChange,
  onRunSteps,
  onStopRun,
  run,
  runNote,
  incomingGoal,
  onGoalConsumed,
}: {
  project: Project;
  files: ProjectFile[];
  /** Owned by Workspace so it outlives this panel's unmount (view switch). */
  plan: string;
  onPlanChange: (plan: string) => void;
  /** Hand steps to the assistant and let it work through them on its own. */
  onRunSteps: (steps: string[]) => void;
  onStopRun: () => void;
  /** The run in progress, if any — also owned by Workspace. */
  run: { steps: string[]; index: number } | null;
  /** Why the last run ended early, if it did. */
  runNote?: string;
  /** Goal handed over from the chat (assistant called open_plan). */
  incomingGoal?: string;
  onGoalConsumed?: () => void;
}) {
  const { t } = useI18n();
  const [goal, setGoal] = useState(incomingGoal || project.description || "");
  const [busy, setBusy] = useState<"plan" | "review" | null>(null);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const setPlan = onPlanChange;

  // Abort an in-flight request if the panel unmounts (view switched away).
  useEffect(() => () => abortRef.current?.abort(), []);

  /**
   * Runs a planning request and streams the answer somewhere.
   * `intent: "plan"` writes a fresh plan; `"review"` reads the project against
   * the existing plan and returns only what's still missing.
   */
  const generatePlan = useCallback(
    async (mode: "plan" | "review", prompt: string, onDone: (out: string) => void) => {
      setBusy(mode);
      setError("");
      const controller = new AbortController();
      abortRef.current = controller;
      let acc = "";
      let hadError = false;

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project: { name: project.name, platform: project.platform, language: project.language, entry: project.entry },
            files,
            messages: [{ role: "user", content: prompt }],
            preferences: loadPrefs(),
            intent: mode,
            // The review pass has to see the plan it's reviewing against —
            // without the bookkeeping markers, which mean nothing to the model.
            ...(mode === "review" && plan.trim() ? { plan: planForModel(plan) } : {}),
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          setError(data?.error || t("panel.couldntGeneratePlan"));
          return;
        }

        for await (const event of readAssistantStream(res.body)) {
          if (event.type === "text") {
            acc += event.delta;
            onDone(acc);
          } else if (event.type === "error") {
            hadError = true;
            setError(event.message || t("panel.couldntGeneratePlan"));
          }
          // "edit" events don't occur in planning mode; ignore if any slip through.
        }
        if (!hadError && !acc.trim()) onDone(t("panel.noPlanReturned"));
      } catch (e) {
        if ((e as Error).name === "AbortError") return; // unmounted
        setError(t("chat.networkError"));
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setBusy(null);
      }
    },
    [project.name, project.platform, project.language, files, plan, t],
  );

  const generate = useCallback(
    (forGoal?: string) => {
      const trimmed = (forGoal ?? goal).trim();
      if (!trimmed || busy) return;
      // A fresh plan starts with nothing ticked — the marker block goes with it.
      setPlan("");
      void generatePlan("plan", `Plan how to build: ${trimmed}`, setPlan);
    },
    [goal, busy, generatePlan, setPlan],
  );

  /**
   * Compare the plan against the code that actually exists and fold the gaps
   * back into the plan as further steps — so "what's left" is part of the plan
   * the assistant works from, not a separate report the user has to relay.
   */
  function review() {
    if (!plan.trim() || busy) return;
    const before = plan;
    void generatePlan(
      "review",
      "Review the build plan against the project's current files and list what is still missing or done poorly.",
      (out) => setPlan(mergeGaps(before, out, t("panel.gapsHeading"))),
    );
  }

  // The assistant handed a plan request over from the chat — build it at once,
  // so switching to this tab already shows work in progress.
  const consumed = useRef(false);
  useEffect(() => {
    if (!incomingGoal || consumed.current) return;
    consumed.current = true;
    setGoal(incomingGoal);
    generate(incomingGoal);
    onGoalConsumed?.();
  }, [incomingGoal, generate, onGoalConsumed]);

  const { diagram, text, steps, done } = parsePlan(plan);
  const doneCount = steps.filter((s) => done.has(s)).length;
  const remaining = steps.filter((s) => !done.has(s));
  const running = !!run;
  // While a run is going, the plan text must not be edited underneath it —
  // regenerate/review both rewrite the very steps being built.
  const locked = running || !!busy;

  function toggle(step: string) {
    const next = new Set(done);
    if (!next.delete(step)) next.add(step);
    setPlan(withDone(plan, next));
  }

  return (
    <PanelShell icon={ListChecks} title={t("ws.viewPlanning")} wide>
      <p className="mb-3 text-[13px] leading-relaxed text-neutral-400">{t("panel.planningHint")}</p>
      <textarea
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        rows={3}
        placeholder={t("panel.planningPlaceholder")}
        className="w-full resize-none rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-[13px] text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-accent/50"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => generate()}
          disabled={!goal.trim() || locked}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
        >
          <Bot className="h-3.5 w-3.5" />
          {busy === "plan" ? t("panel.planning") : plan ? t("panel.regeneratePlan") : t("panel.generatePlan")}
        </button>
        {/* Checks the plan against the code that actually exists and folds the
            gaps back in as steps — the loop that makes a plan worth keeping. */}
        {plan && (
          <button
            onClick={review}
            disabled={locked}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 px-3.5 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-ink-800 hover:text-white disabled:opacity-40"
          >
            {busy === "review" ? t("panel.reviewing") : t("panel.reviewPlan")}
          </button>
        )}
        {/* The whole point of the checklist: hand the unticked steps over and
            let the assistant work through them, ticking each off as it lands. */}
        {remaining.length > 0 && !busy && (
          <button
            onClick={() => (running ? onStopRun() : onRunSteps(remaining))}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors",
              running
                ? "border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15"
                : "border-ink-700 text-neutral-300 hover:bg-ink-800 hover:text-white",
            )}
          >
            {running ? t("panel.stopRun") : t("panel.runPlan")}
          </button>
        )}
      </div>

      {/* One message per step, so say so before they spend eight of them. */}
      {remaining.length > 0 && !running && !busy && (
        <p className="mt-2 text-[11px] leading-relaxed text-neutral-600">
          {t("panel.runHint").replace("{n}", String(remaining.length))}
        </p>
      )}

      {running && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-[13px] text-[#a5b4fc]">
          <Bot className="h-3.5 w-3.5 shrink-0 animate-pulse" />
          <span className="min-w-0 flex-1">
            {t("panel.runningStep")
              .replace("{n}", String(run.index + 1))
              .replace("{total}", String(run.steps.length))}
          </span>
        </div>
      )}

      {/* A run that ended early says why here — the alternative is a checklist
          that quietly stopped moving. */}
      {!running && runNote && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-200">
          {runNote}
        </div>
      )}

      {error && <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-300">{error}</div>}

      {plan &&
        (busy ? (
          // While streaming, show the plain text (the diagram block may be
          // half-written); render the real diagram once generation finishes.
          // Markers are stripped — they're bookkeeping, not something to read.
          <div className="mt-4 whitespace-pre-wrap rounded-xl border border-ink-800 bg-ink-900/50 p-4 text-[13px] leading-relaxed text-neutral-300">
            {parsePlan(plan).clean}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {diagram && <MermaidDiagram code={diagram} />}

            {steps.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900/50">
                <div className="flex items-center justify-between border-b border-ink-800 px-4 py-2 text-[11px] uppercase tracking-wide text-neutral-500">
                  <span>{t("panel.steps")}</span>
                  <span>
                    {doneCount}/{steps.length}
                  </span>
                </div>
                <ul>
                  {steps.map((step, i) => {
                    const isDone = done.has(step);
                    const active = running && run.steps[run.index] === step;
                    return (
                      <li
                        key={`${i}-${step.slice(0, 24)}`}
                        className={cn(
                          "group flex items-start gap-3 border-b border-ink-800/60 px-4 py-2.5 last:border-b-0",
                          active && "bg-accent/[0.07]",
                        )}
                      >
                        <button
                          onClick={() => toggle(step)}
                          aria-pressed={isDone}
                          aria-label={step}
                          className={cn(
                            "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors",
                            isDone
                              ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                              : active
                                ? "animate-pulse border-accent/60 text-transparent"
                                : "border-ink-700 text-transparent hover:border-neutral-500",
                          )}
                        >
                          <Check className={cn("h-3 w-3", isDone && "animate-tick")} />
                        </button>
                        <span
                          className={cn(
                            "min-w-0 flex-1 text-[13px] leading-relaxed",
                            isDone ? "text-neutral-600 line-through" : active ? "text-neutral-100" : "text-neutral-300",
                          )}
                        >
                          {step}
                        </span>
                        {!isDone && !running && (
                          <button
                            onClick={() => onRunSteps([step])}
                            className="shrink-0 rounded-md border border-ink-700 px-2 py-0.5 text-[11px] text-neutral-400 opacity-0 transition-opacity hover:text-neutral-100 focus-visible:opacity-100 group-hover:opacity-100"
                          >
                            {t("panel.buildStep")}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              text && (
                <div className="whitespace-pre-wrap rounded-xl border border-ink-800 bg-ink-900/50 p-4 text-[13px] leading-relaxed text-neutral-300">
                  {text}
                </div>
              )
            )}
          </div>
        ))}
    </PanelShell>
  );
}
