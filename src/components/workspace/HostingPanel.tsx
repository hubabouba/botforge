"use client";

import { useEffect, useRef, useState } from "react";
import type { Project } from "@/lib/workspace/types";
import type { DeploymentStatus, LogLine } from "@/lib/hosting/types";
import { useHostingStatus } from "@/hooks/useHostingStatus";
import { getLogs, startBot, stopBot, setSecret, deleteSecret } from "@/lib/hosting/client";
import { Play, Check, Trash, Lock } from "@/components/icons";
import { cn } from "@/lib/utils";

const STATUS_META: Record<DeploymentStatus, { label: string; dot: string; pulse?: boolean }> = {
  stopped: { label: "Stopped", dot: "bg-neutral-500" },
  starting: { label: "Starting…", dot: "bg-amber-400", pulse: true },
  running: { label: "Running", dot: "bg-emerald-400" },
  stopping: { label: "Stopping…", dot: "bg-amber-400", pulse: true },
  crashed: { label: "Crashed", dot: "bg-rose-400" },
  crash_looping: { label: "Crash looping", dot: "bg-rose-400" },
  killed: { label: "Stopped", dot: "bg-neutral-500" },
};

const STREAM_COLOR: Record<LogLine["stream"], string> = {
  stdout: "text-neutral-300",
  stderr: "text-rose-300",
  system: "text-accent",
};

/** The real "Run on Botforge hosting" control — start/stop, secret, live logs. */
export function HostingPanel({ project }: { project: Project }) {
  const { status, loaded, refresh } = useHostingStatus(project.id, true);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const cursor = useRef(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [secretDraft, setSecretDraft] = useState("");
  const [savingSecret, setSavingSecret] = useState(false);
  const logBox = useRef<HTMLDivElement>(null);

  const st: DeploymentStatus = status?.status ?? "stopped";
  const meta = STATUS_META[st];
  const active = st === "starting" || st === "running" || st === "stopping";
  const required = status?.requiredSecret ?? "TELEGRAM_TOKEN";
  const secretSet = status?.secretNames.includes(required) ?? false;

  // Poll logs after the last-seen id while the panel is mounted.
  useEffect(() => {
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const ctrl = new AbortController();
    const tick = async () => {
      if (document.visibilityState === "visible") {
        try {
          const next = await getLogs(project.id, cursor.current, ctrl.signal);
          if (next.length) {
            cursor.current = next[next.length - 1].id;
            setLogs((prev) => [...prev, ...next].slice(-1000));
          }
        } catch {
          /* transient */
        }
      }
      if (!stop) t = setTimeout(tick, 2500);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(t);
      ctrl.abort();
    };
  }, [project.id]);

  // Auto-scroll to the newest line.
  useEffect(() => {
    logBox.current?.scrollTo({ top: logBox.current.scrollHeight });
  }, [logs]);

  async function doStart() {
    setErr("");
    setBusy(true);
    const r = await startBot(project.id);
    if (!r.ok) setErr(r.error || "Couldn't start the bot.");
    await refresh();
    setBusy(false);
  }

  async function doStop() {
    setErr("");
    setBusy(true);
    await stopBot(project.id);
    await refresh();
    setBusy(false);
  }

  async function saveSecret() {
    const value = secretDraft.trim();
    if (!value) return;
    setSavingSecret(true);
    setErr("");
    const r = await setSecret(project.id, required, value);
    if (r.ok) {
      setSecretDraft("");
      await refresh();
    } else {
      setErr(r.error || "Couldn't save the token.");
    }
    setSavingSecret(false);
  }

  return (
    <div className="space-y-4">
      {/* Status + controls */}
      <div className="flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-900/50 px-3.5 py-2.5">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot, meta.pulse && "animate-pulse")} />
        <span className="text-[13px] font-medium text-neutral-200">{meta.label}</span>
        {status && status.restartCount > 0 && (
          <span className="text-[11px] text-neutral-500">· {status.restartCount} restart{status.restartCount === 1 ? "" : "s"}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {active ? (
            <button
              onClick={doStop}
              disabled={busy || st === "stopping"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:bg-white/[0.06] disabled:opacity-40"
            >
              <span className="h-2.5 w-2.5 rounded-[2px] bg-rose-400" /> Stop
            </button>
          ) : (
            <button
              onClick={doStart}
              disabled={busy || !secretSet}
              title={!secretSet ? `Set a ${required} first` : undefined}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5" /> {busy ? "Starting…" : "Start bot"}
            </button>
          )}
        </div>
      </div>

      {err && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-300">{err}</div>
      )}

      {/* Secret (bot token) */}
      <div className="rounded-xl border border-ink-800 bg-ink-900/40 p-3.5">
        <div className="mb-2 flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-neutral-400" />
          <span className="text-[13px] font-medium text-neutral-200">Bot token</span>
          {secretSet && (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
              <Check className="h-3.5 w-3.5" /> set
            </span>
          )}
        </div>
        {secretSet ? (
          <div className="flex items-center justify-between rounded-lg border border-ink-800 bg-ink-950 px-3 py-2">
            <span className="font-mono text-xs text-neutral-400">{required} ••••••••</span>
            <button
              onClick={async () => {
                await deleteSecret(project.id, required);
                await refresh();
              }}
              disabled={active}
              className="grid h-6 w-6 place-items-center rounded text-neutral-500 hover:bg-white/10 hover:text-rose-300 disabled:opacity-30"
              aria-label="Remove token"
              title={active ? "Stop the bot to change its token" : "Remove token"}
            >
              <Trash className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={secretDraft}
              onChange={(e) => setSecretDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveSecret()}
              placeholder={`Paste your ${required} from @BotFather`}
              className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-950 px-2.5 py-1.5 font-mono text-xs text-neutral-200 outline-none placeholder:font-sans placeholder:text-neutral-600 focus:border-accent/50"
            />
            <button
              onClick={saveSecret}
              disabled={!secretDraft.trim() || savingSecret}
              className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
            >
              {savingSecret ? "Saving…" : "Save"}
            </button>
          </div>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-neutral-600">
          Stored encrypted and injected only into your running bot — it never touches your project files or the
          assistant.
        </p>
      </div>

      {/* Live logs */}
      <div className="overflow-hidden rounded-xl border border-ink-800 bg-ink-950">
        <div className="flex items-center justify-between border-b border-ink-800 px-3 py-2">
          <span className="font-mono text-[11px] text-neutral-500">console</span>
          {logs.length > 0 && (
            <button onClick={() => { setLogs([]); }} className="text-[11px] text-neutral-600 hover:text-neutral-400">
              clear
            </button>
          )}
        </div>
        <div ref={logBox} className="max-h-72 min-h-[8rem] overflow-y-auto p-3 font-mono text-[12px] leading-relaxed">
          {logs.length === 0 ? (
            <p className="text-neutral-600">
              {loaded ? "No logs yet — start the bot to see its output here." : "Loading…"}
            </p>
          ) : (
            logs.map((l) => (
              <div key={l.id} className={cn("whitespace-pre-wrap break-words", STREAM_COLOR[l.stream])}>
                {l.stream === "system" ? "› " : ""}
                {l.line}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
