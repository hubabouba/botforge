"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Language, Platform } from "@/lib/workspace/types";
import { sampleProject } from "@/lib/workspace/sample";
import { cn } from "@/lib/utils";

const uid = () => Math.random().toString(36).slice(2, 10);

const EXAMPLES = [
  "A Telegram bot that answers FAQs about my shop",
  "A Discord moderation bot with a warn system",
  "A bot that sends me the weather every morning",
];

function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === o.id ? "bg-background text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PlatformDot({ platform }: { platform: Platform }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px]",
        platform === "telegram" ? "bg-[#2aabee]/10 text-[#2aabee]" : "bg-[#5865f2]/10 text-[#5865f2]",
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {platform === "telegram" ? "Telegram" : "Discord"}
    </span>
  );
}

export function DashboardHome({ name }: { name: string }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [platform, setPlatform] = useState<Platform>("telegram");
  const [language, setLanguage] = useState<Language>("python");
  const [creating, setCreating] = useState(false);

  function create() {
    if (creating) return;
    setCreating(true);
    const id = uid();
    const q = new URLSearchParams({ platform, lang: language });
    if (prompt.trim()) q.set("prompt", prompt.trim());
    router.push(`/workspace/${id}?${q.toString()}`);
  }

  return (
    <div className="space-y-10">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {name} 👋</h1>
        <p className="mt-1 text-sm text-muted-foreground">Describe a bot and the AI writes the code. Your projects live below.</p>
      </div>

      {/* Composer */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-background p-5 shadow-soft sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />
        <label className="text-sm font-medium">What should we build?</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") create();
          }}
          rows={3}
          placeholder="e.g. A Telegram bot that tracks crypto prices and sends a daily report at 9:00…"
          className="mt-3 w-full resize-none rounded-xl border border-border bg-muted/40 px-3.5 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/25"
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Seg
            options={[
              { id: "telegram", label: "Telegram" },
              { id: "discord", label: "Discord" },
            ]}
            value={platform}
            onChange={setPlatform}
          />
          <Seg
            options={[
              { id: "python", label: "Python" },
              { id: "node", label: "Node.js" },
            ]}
            value={language}
            onChange={setLanguage}
          />
          <button
            onClick={create}
            disabled={creating}
            className="shine ml-auto inline-flex items-center gap-2 rounded-lg bg-gradient-to-b from-accent to-accent-hover px-4 py-2 text-sm font-medium text-accent-foreground shadow-glow transition-all hover:-translate-y-0.5 hover:shadow-glow-lg disabled:opacity-60"
          >
            <span className="relative z-[2]">{creating ? "Opening…" : "Build bot →"}</span>
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setPrompt(ex)}
              className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Projects */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Your projects</h2>
          <span className="text-xs text-muted-foreground">1 sample</span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Sample project card */}
          <Link
            href="/workspace/demo"
            className="card-hover group flex flex-col rounded-2xl border border-border bg-background p-5 shadow-soft"
          >
            <div className="flex items-center justify-between">
              <PlatformDot platform={sampleProject.platform} />
              <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Python</span>
            </div>
            <h3 className="mt-3 font-medium">{sampleProject.name}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{sampleProject.description}</p>
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
              <span>{sampleProject.files.length} files</span>
              <span className="font-medium text-accent transition-transform group-hover:translate-x-0.5">Open →</span>
            </div>
          </Link>

          {/* New (blank) */}
          <button
            onClick={create}
            className="card-hover flex min-h-[168px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-background/50 p-5 text-center text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent">＋</span>
            <span className="text-sm font-medium">New project</span>
            <span className="text-xs">Start from a description</span>
          </button>
        </div>
      </div>
    </div>
  );
}
