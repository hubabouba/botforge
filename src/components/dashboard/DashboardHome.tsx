"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { templates, type Template } from "@/lib/workspace/templates";
import {
  createProjectFromTemplate,
  deleteProject,
  duplicateProject,
  listProjects,
  renameProject,
  type StoredProject,
} from "@/lib/workspace/store";
import { downloadZip } from "@/lib/workspace/zip";
import { CreateProjectModal } from "./CreateProjectModal";
import { UpgradeModal } from "@/components/upgrade/UpgradeModal";
import { usePlan } from "@/hooks/usePlan";
import { projectLimit, nextPlanUp, planMeta } from "@/lib/plan";
import {
  Telegram,
  Discord,
  Plus,
  Trash,
  Pencil,
  Download,
  Copy,
  MoreVertical,
  Bot,
  ArrowRight,
} from "@/components/icons";
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
  const { plan } = usePlan();
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [upgrade, setUpgrade] = useState(false);

  const reload = useCallback(() => setProjects(listProjects()), []);

  useEffect(() => {
    reload();
    setLoaded(true);
    window.addEventListener("bf:projects-changed", reload);
    return () => window.removeEventListener("bf:projects-changed", reload);
  }, [reload]);

  const limit = projectLimit(plan);
  const atLimit = projects.length >= limit;

  /** Run a create action, or prompt to upgrade if the plan's project cap is hit. */
  function guardedCreate(fn: () => void) {
    if (atLimit) setUpgrade(true);
    else fn();
  }

  function startNewProject() {
    guardedCreate(() => setCreating(true));
  }

  function useTemplate(template: Template) {
    guardedCreate(() => {
      const project = createProjectFromTemplate(template);
      router.push(`/workspace/${project.id}`);
    });
  }

  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Build a Telegram or Discord bot — start in a few clicks.</p>
        </div>
        <button
          onClick={startNewProject}
          className="inline-flex items-center gap-2 self-start rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground shadow-soft transition-colors hover:bg-accent-hover sm:self-auto"
        >
          <Plus className="h-4 w-4" /> New project
        </button>
      </div>

      {/* Your projects / empty state */}
      {loaded && projects.length > 0 ? (
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Your projects</h2>
            <span className="text-xs text-muted-foreground">
              {Number.isFinite(limit) ? (
                <>
                  {projects.length} / {limit} projects
                  {atLimit && (
                    <>
                      {" · "}
                      <button onClick={() => setUpgrade(true)} className="font-medium text-accent hover:underline">
                        Upgrade
                      </button>
                    </>
                  )}
                </>
              ) : (
                <>
                  {projects.length} project{projects.length === 1 ? "" : "s"}
                </>
              )}
            </span>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onChange={reload}
                canDuplicate={!atLimit}
                onRequireUpgrade={() => setUpgrade(true)}
              />
            ))}
          </div>
        </section>
      ) : loaded ? (
        <section className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-14 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Bot className="h-6 w-6" />
          </div>
          <h2 className="mt-4 font-medium">No projects yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Create your first bot with a short setup, or pick a ready-made template below.
          </p>
          <button
            onClick={startNewProject}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" /> New project
          </button>
        </section>
      ) : null}

      {/* Quick start templates */}
      <section>
        <h2 className="text-sm font-semibold">Quick start from a template</h2>
        <p className="mt-1 text-sm text-muted-foreground">Skip the setup — open a ready-made starter and edit the code.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <button
              key={t.slug}
              onClick={() => useTemplate(t)}
              className="card-hover group flex items-center gap-3 rounded-xl border border-border bg-background p-4 text-left shadow-soft"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                {t.platform === "telegram" ? <Telegram className="h-4 w-4" /> : <Discord className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{t.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{t.description}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      </section>

      {creating && <CreateProjectModal onClose={() => setCreating(false)} />}

      {upgrade && (
        <UpgradeModal
          current={plan}
          highlight={nextPlanUp(plan)}
          reason={`You've reached your ${planMeta(plan).name} limit of ${limit} projects. Upgrade for more.`}
          onClose={() => setUpgrade(false)}
        />
      )}
    </div>
  );
}

function ProjectCard({
  project,
  onChange,
  canDuplicate,
  onRequireUpgrade,
}: {
  project: StoredProject;
  onChange: () => void;
  canDuplicate: boolean;
  onRequireUpgrade: () => void;
}) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(project.name);

  const open = () => router.push(`/workspace/${project.id}`);

  function commitRename() {
    renameProject(project.id, draft);
    setRenaming(false);
    onChange();
  }

  return (
    <div className="group relative flex flex-col rounded-2xl border border-border bg-background p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift">
      <div className="flex items-center justify-between">
        <PlatformTag platform={project.platform} />
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {project.language === "python" ? "Python" : "Node.js"}
          </span>
          <button
            aria-label="More"
            onClick={() => setMenu((v) => !v)}
            className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
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
          {project.files.length} file{project.files.length === 1 ? "" : "s"} · {timeAgo(project.updatedAt)}
        </span>
        <button onClick={open} className="font-medium text-accent hover:underline">
          Open
        </button>
      </div>

      {/* Dropdown menu */}
      {menu && (
        <>
          <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setMenu(false)} />
          <div className="absolute right-4 top-12 z-20 w-44 overflow-hidden rounded-xl border border-border bg-background py-1 shadow-lift">
            <MenuItem icon={<ArrowRight className="h-3.5 w-3.5" />} label="Open" onClick={open} />
            <MenuItem
              icon={<Pencil className="h-3.5 w-3.5" />}
              label="Rename"
              onClick={() => {
                setDraft(project.name);
                setRenaming(true);
                setMenu(false);
              }}
            />
            <MenuItem
              icon={<Copy className="h-3.5 w-3.5" />}
              label="Duplicate"
              onClick={() => {
                setMenu(false);
                if (!canDuplicate) {
                  onRequireUpgrade();
                  return;
                }
                duplicateProject(project.id);
                onChange();
              }}
            />
            <MenuItem
              icon={<Download className="h-3.5 w-3.5" />}
              label="Download ZIP"
              onClick={() => {
                downloadZip(project.name, project.files);
                setMenu(false);
              }}
            />
            <div className="my-1 h-px bg-border" />
            <MenuItem
              icon={<Trash className="h-3.5 w-3.5" />}
              label="Delete"
              danger
              onClick={() => {
                deleteProject(project.id);
                setMenu(false);
                onChange();
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted",
        danger ? "text-rose-500" : "text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
