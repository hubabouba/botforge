"use client";

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import type { Project, ProjectFile } from "@/lib/workspace/types";
import { loadPrefs } from "@/lib/workspace/assistantPrefs";
import { readAssistantStream } from "@/lib/ai/streamClient";
import { HostingPanel, formatRuntime } from "./HostingPanel";
import { useHostingStatus } from "@/hooks/useHostingStatus";
import { CodeIcon, Terminal, ListChecks, Chart, Lock, Play, Bot } from "@/components/icons";
import { cn } from "@/lib/utils";

export type WorkView = "code" | "logs" | "planning" | "metrics";

interface ViewDef {
  id: WorkView;
  label: string;
  icon: (p: { className?: string }) => ReactElement;
}

export const VIEWS: ViewDef[] = [
  { id: "code", label: "Code", icon: CodeIcon },
  { id: "logs", label: "Logs", icon: Terminal },
  { id: "planning", label: "Planning", icon: ListChecks },
  { id: "metrics", label: "Metrics", icon: Chart },
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
            {v.label}
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
}: {
  icon: (p: { className?: string }) => ReactElement;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl">
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
  // Basic+ accounts get the real hosting control; everyone else keeps the honest
  // "run locally" path (also a good fallback if hosting ever has an incident).
  if (hostingAvailable) {
    return (
      <PanelShell icon={Terminal} title="Run & Logs">
        <HostingPanel project={project} />
        <button
          onClick={onRun}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-white/[0.06]"
        >
          <Play className="h-3.5 w-3.5" /> Run locally instead
        </button>
      </PanelShell>
    );
  }

  return (
    <PanelShell icon={Terminal} title="Logs">
      <div className="rounded-xl border border-ink-800 bg-ink-950 font-mono text-[12px]">
        <div className="border-b border-ink-800 px-3 py-2 text-neutral-500">console</div>
        <div className="p-4 text-neutral-500">
          <p className="text-neutral-400">No live logs yet.</p>
          <p className="mt-2 leading-relaxed">
            Hosted runs are on the way. Until then, run your bot locally and logs stream to your
            own terminal.
          </p>
        </div>
      </div>
      <button
        onClick={onRun}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
      >
        <Play className="h-3.5 w-3.5" /> Run locally
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
  const { status } = useHostingStatus(project.id, hostingAvailable);
  const running = status?.status === "running";

  if (!hostingAvailable) {
    return (
      <PanelShell icon={Chart} title="Metrics">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {["Active users", "Messages", "Errors", "Uptime"].map((label) => (
            <Tile key={label} label={label} value="—" hint="" muted />
          ))}
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-neutral-500">
          Metrics light up once your bot runs on Botforge hosting. Deploy is coming — for now these
          are placeholders, not sample data.
        </p>
      </PanelShell>
    );
  }

  return (
    <PanelShell icon={Chart} title="Metrics">
      {/* Real process health (cheap — straight from the deployment record). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="Status" value={running ? "Running" : (status?.status ?? "Stopped").replace(/_/g, " ")} hint="live" />
        <Tile label="Uptime" value={uptimeLabel(status?.startedAt ?? null, running)} hint="since start" />
        <Tile label="Restarts" value={String(status?.restartCount ?? 0)} hint="this deployment" />
      </div>
      {/* Honestly-labelled "coming later" — needs the bot to report its own events. */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile
          label="Runtime"
          value={status?.usage ? formatRuntime(status.usage.usedSeconds) : "—"}
          hint={
            status?.usage && status.usage.limitSeconds >= 0
              ? `of ${formatRuntime(status.usage.limitSeconds)} this month`
              : "this month"
          }
        />
        <Tile label="Active users" value="—" hint="coming later" muted />
        <Tile label="Messages" value="—" hint="coming later" muted />
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-neutral-500">
        Status, uptime, restarts and runtime are live. Active-users and message counts need your bot
        to report its own events — that instrumentation is coming in a later update, not faked here.
      </p>
    </PanelShell>
  );
}

// ---- Planning (real, AI-driven) ------------------------------------------

export function PlanningPanel({ project, files }: { project: Project; files: ProjectFile[] }) {
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
        setError(data?.error || "Couldn't generate a plan.");
        return;
      }

      for await (const event of readAssistantStream(res.body)) {
        if (event.type === "text") {
          acc += event.delta;
          setPlan(acc);
        } else if (event.type === "error") {
          hadError = true;
          setError(event.message || "Couldn't generate a plan.");
        }
        // "edit" events don't occur in planning mode; ignore if any slip through.
      }
      if (!hadError && !acc.trim()) setPlan("No plan returned.");
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // unmounted
      setError("Network error — please try again.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }

  return (
    <PanelShell icon={ListChecks} title="AI Planning">
      <p className="mb-3 text-[13px] leading-relaxed text-neutral-400">
        Describe what you want your bot to do — the assistant drafts a concrete, step-by-step build
        plan you can then hand to the chat to implement.
      </p>
      <textarea
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        rows={3}
        placeholder="e.g. A bot that takes food orders, confirms them, and notifies an admin channel."
        className="w-full resize-none rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-[13px] text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-accent/50"
      />
      <button
        onClick={generate}
        disabled={!goal.trim() || busy}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
      >
        <Bot className="h-3.5 w-3.5" />
        {busy ? "Planning…" : plan ? "Regenerate plan" : "Generate plan"}
      </button>

      {error && <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-300">{error}</div>}

      {plan && (
        <div className="mt-4 whitespace-pre-wrap rounded-xl border border-ink-800 bg-ink-900/50 p-4 text-[13px] leading-relaxed text-neutral-300">
          {plan}
        </div>
      )}
    </PanelShell>
  );
}
