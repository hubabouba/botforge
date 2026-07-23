"use client";

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import type { Project, ProjectFile } from "@/lib/workspace/types";
import { loadPrefs } from "@/lib/workspace/assistantPrefs";
import { readAssistantStream } from "@/lib/ai/streamClient";
import { HostingPanel, formatRuntime, STATUS_META } from "./HostingPanel";
import { MermaidDiagram } from "./MermaidDiagram";
import { useHostingStatus } from "@/hooks/useHostingStatus";
import { CodeIcon, Terminal, ListChecks, Chart, Lock, Play, Bot } from "@/components/icons";
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
              "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] transition-colors",
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
      <div className="rounded-xl border border-ink-800 bg-ink-950 font-mono text-[12px]">
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
                budgetPct >= 90 ? "bg-rose-500" : "bg-gradient-to-r from-[#6366F1] to-[#22D3EE]",
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

// Pull a ```mermaid fenced block out of the plan so it can be drawn as a
// diagram; whatever's left stays as the text plan.
const MERMAID_RE = /```mermaid\s*([\s\S]*?)```/i;
function splitPlan(s: string): { diagram: string | null; text: string } {
  const m = s.match(MERMAID_RE);
  if (!m) return { diagram: null, text: s.trim() };
  return { diagram: m[1].trim(), text: s.replace(m[0], "").trim() };
}

export function PlanningPanel({ project, files }: { project: Project; files: ProjectFile[] }) {
  const { t } = useI18n();
  const [goal, setGoal] = useState(project.description ?? "");
  const [plan, setPlan] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Abort an in-flight plan if the panel unmounts (view switched away).
  useEffect(() => () => abortRef.current?.abort(), []);

  async function generate() {
    const trimmed = goal.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError("");
    setPlan("");

    const controller = new AbortController();
    abortRef.current = controller;
    let acc = "";
    let hadError = false;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: { name: project.name, platform: project.platform, language: project.language },
          files,
          messages: [{ role: "user", content: `Plan how to build: ${trimmed}` }],
          preferences: loadPrefs(),
          intent: "plan",
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
          setPlan(acc);
        } else if (event.type === "error") {
          hadError = true;
          setError(event.message || t("panel.couldntGeneratePlan"));
        }
        // "edit" events don't occur in planning mode; ignore if any slip through.
      }
      if (!hadError && !acc.trim()) setPlan(t("panel.noPlanReturned"));
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // unmounted
      setError(t("chat.networkError"));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }

  const { diagram, text } = splitPlan(plan);

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
      <button
        onClick={generate}
        disabled={!goal.trim() || busy}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
      >
        <Bot className="h-3.5 w-3.5" />
        {busy ? t("panel.planning") : plan ? t("panel.regeneratePlan") : t("panel.generatePlan")}
      </button>

      {error && <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-300">{error}</div>}

      {plan &&
        (busy ? (
          // While streaming, show the raw text (the diagram block may be
          // half-written); render the real diagram once generation finishes.
          <div className="mt-4 whitespace-pre-wrap rounded-xl border border-ink-800 bg-ink-900/50 p-4 text-[13px] leading-relaxed text-neutral-300">
            {plan}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {diagram && <MermaidDiagram code={diagram} />}
            {text && (
              <div className="whitespace-pre-wrap rounded-xl border border-ink-800 bg-ink-900/50 p-4 text-[13px] leading-relaxed text-neutral-300">
                {text}
              </div>
            )}
          </div>
        ))}
    </PanelShell>
  );
}
