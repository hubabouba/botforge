"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { templates, blankTemplate, type Template } from "@/lib/workspace/templates";
import {
  createProjectFromTemplate,
  deleteProject,
  listProjects,
  renameProject,
  type StoredProject,
} from "@/lib/workspace/store";
import { Telegram, Discord, Plus, Trash, Pencil, ArrowRight } from "@/components/icons";
import { cn } from "@/lib/utils";

function PlatformTag({ platform }: { platform: Template["platform"] }) {
  const telegram = platform === "telegram";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium",
        telegram ? "bg-[#2aabee]/10 text-[#2aabee]" : "bg-[#5865f2]/10 text-[#5865f2]",
      )}
    >
      {telegram ? <Telegram className="h-3 w-3" /> : <Discord className="h-3 w-3" />}
      {telegram ? "Telegram" : "Discord"}
    </span>
  );
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

export function DashboardHome({ name }: { name: string }) {
  const router = useRouter();
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(() => setProjects(listProjects()), []);

  useEffect(() => {
    reload();
    setLoaded(true);
    window.addEventListener("bf:projects-changed", reload);
    return () => window.removeEventListener("bf:projects-changed", reload);
  }, [reload]);

  function use(template: Template) {
    const project = createProjectFromTemplate(template);
    router.push(`/workspace/${project.id}`);
  }

  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Start from a template, edit the code, and download a ready-to-run bot.
        </p>
      </div>

      {/* Your projects (only when there are some) */}
      {loaded && projects.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold">Your projects</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} onChange={reload} />
            ))}
          </div>
        </section>
      )}

      {/* Templates */}
      <section>
        <h2 className="text-sm font-semibold">{projects.length > 0 ? "Start something new" : "Start from a template"}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <button
              key={t.slug}
              onClick={() => use(t)}
              className="card-hover group flex flex-col rounded-2xl border border-border bg-background p-5 text-left shadow-soft"
            >
              <div className="flex items-center justify-between">
                <PlatformTag platform={t.platform} />
                <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {t.language === "python" ? "Python" : "Node.js"}
                </span>
              </div>
              <h3 className="mt-3 font-medium">{t.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {t.highlights.map((h) => (
                  <li key={h} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {h}
                  </li>
                ))}
              </ul>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
                Use template
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          ))}

          {/* Blank */}
          <button
            onClick={() => use(blankTemplate)}
            className="card-hover flex min-h-[176px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-background/50 p-5 text-center text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent">
              <Plus className="h-5 w-5" />
            </span>
            <span className="text-sm font-medium">Blank project</span>
            <span className="text-xs">Start from an empty file</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function ProjectCard({ project, onChange }: { project: StoredProject; onChange: () => void }) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const [confirmDel, setConfirmDel] = useState(false);

  function open() {
    router.push(`/workspace/${project.id}`);
  }
  function commitRename() {
    renameProject(project.id, draft);
    setRenaming(false);
    onChange();
  }

  return (
    <div className="group relative flex flex-col rounded-2xl border border-border bg-background p-5 shadow-soft transition-colors hover:border-border">
      <div className="flex items-center justify-between">
        <PlatformTag platform={project.platform} />
        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          {project.language === "python" ? "Python" : "Node.js"}
        </span>
      </div>

      {renaming ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setRenaming(false);
          }}
          className="mt-3 w-full rounded-md border border-accent/50 bg-background px-2 py-1 text-sm outline-none"
        />
      ) : (
        <button onClick={open} className="mt-3 text-left font-medium hover:text-accent">
          {project.name}
        </button>
      )}

      <p className="mt-1 line-clamp-2 flex-1 text-sm text-muted-foreground">{project.description}</p>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
        <span>
          {project.files.length} files · {timeAgo(project.updatedAt)}
        </span>
        <div className="flex items-center gap-1">
          <button
            aria-label="Rename"
            onClick={() => {
              setDraft(project.name);
              setRenaming(true);
            }}
            className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {confirmDel ? (
            <button
              onClick={() => {
                deleteProject(project.id);
                onChange();
              }}
              onBlur={() => setConfirmDel(false)}
              autoFocus
              className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[11px] font-medium text-rose-500"
            >
              Delete?
            </button>
          ) : (
            <button
              aria-label="Delete"
              onClick={() => setConfirmDel(true)}
              className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-rose-500"
            >
              <Trash className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
