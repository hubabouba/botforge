"use client";

import type { ReactNode } from "react";
import type { Project } from "@/lib/workspace/types";

function Card({
  title,
  sub,
  tone = "default",
  icon,
}: {
  title: string;
  sub?: string;
  tone?: "default" | "accent" | "green" | "amber";
  icon?: ReactNode;
}) {
  const ring =
    tone === "accent"
      ? "border-accent/40 bg-accent/10"
      : tone === "green"
        ? "border-emerald-500/30 bg-emerald-500/5"
        : tone === "amber"
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-ink-700 bg-ink-900";
  return (
    <div className={`rounded-xl border ${ring} px-3.5 py-2.5`}>
      <div className="flex items-center gap-2">
        {icon && <span className="text-neutral-400">{icon}</span>}
        <span className="text-[13px] font-medium text-neutral-100">{title}</span>
      </div>
      {sub && <p className="mt-0.5 font-mono text-[11px] text-neutral-500">{sub}</p>}
    </div>
  );
}

function Lane({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex-1">
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-neutral-600">{label}</div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

/** A static, layered map of how the generated bot fits together. */
export function Architecture({ project }: { project: Project }) {
  return (
    <div className="h-full overflow-auto bg-ink-950 p-6 sm:p-10">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-lg font-semibold text-neutral-100">How this bot is wired</h2>
        <p className="mt-1 text-sm text-neutral-500">
          A live map generated from your files. Updates as the AI adds features.
        </p>

        <div className="relative mt-8 flex items-stretch gap-3">
          <Lane label="Entry">
            <Card
              title={project.platform === "telegram" ? "Telegram" : "Discord"}
              sub="ApplicationBuilder"
              tone="accent"
              icon={<Dot />}
            />
            <Card title="main.py" sub="run_polling()" />
          </Lane>

          <Arrow />

          <Lane label="Handlers">
            <Card title="/start" sub="handlers.py" />
            <Card title="/price" sub="handlers.py" />
            <Card title="/subscribe" sub="handlers.py" />
            <Card title="09:00 job" sub="jobs.py" tone="amber" icon={<Clock />} />
          </Lane>

          <Arrow />

          <Lane label="Services & data">
            <Card title="get_price()" sub="services.py" />
            <Card title="CoinGecko API" sub="httpx · external" tone="green" icon={<Globe />} />
            <Card title="subscribers" sub="database.py" tone="green" icon={<Db />} />
          </Lane>
        </div>

        <div className="mt-8 rounded-xl border border-ink-800 bg-ink-900/60 p-4 text-[13px] text-neutral-400">
          <span className="text-neutral-200">Flow:</span> an update hits the entrypoint → the matching command
          handler runs → it calls a service (price lookup or the subscriber store) → the reply goes back to the user.
          The daily job pushes reports on a schedule.
        </div>
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex items-center pt-6 text-ink-700">
      <svg viewBox="0 0 40 24" className="h-6 w-10" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 12h34" strokeLinecap="round" strokeDasharray="1 4" />
        <path d="m30 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
const iconCls = "h-3.5 w-3.5";
function Dot() {
  return <span className="block h-2 w-2 rounded-full bg-accent" />;
}
function Clock() {
  return (
    <svg viewBox="0 0 24 24" className={iconCls} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  );
}
function Globe() {
  return (
    <svg viewBox="0 0 24 24" className={iconCls} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
    </svg>
  );
}
function Db() {
  return (
    <svg viewBox="0 0 24 24" className={iconCls} fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </svg>
  );
}
