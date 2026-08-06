"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { templates, type Template } from "@/lib/workspace/templates";
import {
  createProjectFromTemplate,
  deleteProject,
  duplicateProject,
  listProjects,
  migrateLocalProjects,
  renameProject,
  type StoredProject,
} from "@/lib/workspace/store";
import { downloadZip } from "@/lib/workspace/zip";
import { track } from "@/lib/analytics";
import { fbTrack, consumePendingPurchase } from "@/lib/metaPixel";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { messages, type Locale } from "@/lib/i18n/messages";
import { plural } from "@/lib/i18n/plural";
import { CreateProjectModal } from "./CreateProjectModal";
import { ProjectSurveyModal } from "./ProjectSurveyModal";
import { UpgradeModal } from "@/components/upgrade/UpgradeModal";
import { Magnetic } from "@/components/marketing/Magnetic";
import { usePlan } from "@/hooks/usePlan";
import { useCompactViewport } from "@/hooks/useCompactViewport";
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
  Close,
} from "@/components/icons";
import { cn } from "@/lib/utils";

function PlatformTag({ platform }: { platform: Template["platform"] }) {
  const telegram = platform === "telegram";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1",
        telegram
          ? "bg-[#2aabee]/10 text-[#2aabee] ring-[#2aabee]/20"
          : "bg-[#5865f2]/10 text-[#7d88ff] ring-[#5865f2]/20",
      )}
    >
      {telegram ? <Telegram className="h-3 w-3" /> : <Discord className="h-3 w-3" />}
      {telegram ? "Telegram" : "Discord"}
    </span>
  );
}

function timeAgo(ts: number, lang: Locale): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return messages[lang]["dash.justNow"] ?? messages.en["dash.justNow"];
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}${messages[lang]["dash.minAgo"] ?? messages.en["dash.minAgo"]}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}${messages[lang]["dash.hourAgo"] ?? messages.en["dash.hourAgo"]}`;
  const d = Math.floor(h / 24);
  return d === 1
    ? (messages[lang]["dash.yesterday"] ?? messages.en["dash.yesterday"])
    : `${d}${messages[lang]["dash.dayAgo"] ?? messages.en["dash.dayAgo"]}`;
}

/** Solid primary button — flat accent, no gradient or shimmer sweep. */
function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 self-start rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover sm:self-auto"
    >
      {children}
    </button>
  );
}

export function DashboardHome({ name, userId }: { name: string; userId: string }) {
  const router = useRouter();
  const { t, lang } = useI18n();
  const { plan, loading: planLoading } = usePlan();
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [upgrade, setUpgrade] = useState(false);
  const compact = useCompactViewport();
  // Free users see plans, then a two-question survey, before the wizard opens.
  // The create action they asked for waits here until both are dismissed, so
  // "New project" and "use this template" both keep working unchanged.
  const [pendingCreate, setPendingCreate] = useState<(() => void) | null>(null);
  const [nudge, setNudge] = useState(false);
  const [survey, setSurvey] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  // Start hidden so the server render matches; reveal on mount if not dismissed
  // (avoids a hydration mismatch on the localStorage-backed flag).
  const [showOnboard, setShowOnboard] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem("bf:onboarded") !== "1") setShowOnboard(true);
    } catch {
      /* private mode — just skip the hint */
    }
  }, []);

  function dismissOnboard() {
    setShowOnboard(false);
    try {
      localStorage.setItem("bf:onboarded", "1");
    } catch {
      /* ignore */
    }
  }

  const reload = useCallback(async () => setProjects(await listProjects()), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let list = await listProjects();
      // One-time: adopt any projects left in this browser's localStorage.
      if (list.length === 0) {
        const imported = await migrateLocalProjects(userId);
        if (imported > 0) list = await listProjects();
      }
      if (cancelled) return;
      setProjects(list);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Fire the checkout-completed funnel event once when Stripe redirects back
  // with ?checkout=success, then strip the param so a refresh won't re-fire it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      track("checkout_completed");
      // The value was stashed client-side the moment checkout was attempted
      // (UpgradeModal) — the purchase itself is confirmed server-side by the
      // Stripe webhook, well after that tab's JS is gone, so this is the only
      // point left to attach a price to the Purchase event at all.
      const value = consumePendingPurchase();
      fbTrack("Purchase", value !== null ? { value, currency: "USD" } : undefined);
      params.delete("checkout");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  const limit = projectLimit(plan);
  // Don't gate until the plan is known, or a paid user briefly sees the free cap.
  const atLimit = !planLoading && projects.length >= limit;

  // Only surface search + sort once the grid is big enough to be worth it.
  const showSearch = projects.length > 6;
  const q = query.trim().toLowerCase();
  const filtered = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;
  const visible = [...filtered].sort((a, b) =>
    sort === "name" ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt,
  );

  /**
   * Run a create action — unless the plan's cap is hit (hard upgrade prompt),
   * or the user is on free and still under it, in which case they first see
   * plans and a short survey. Both are dismissible; the action always runs
   * afterwards. Free's cap is 2 projects, so this pair is seen at most twice
   * per account before the hard prompt takes over.
   */
  function guardedCreate(fn: () => void) {
    if (atLimit) {
      setUpgrade(true);
      return;
    }
    if (!planLoading && plan === "free") {
      setPendingCreate(() => fn);
      setNudge(true);
      return;
    }
    fn();
  }

  /** Both pre-create modals are done — run whatever the user originally clicked. */
  function runPendingCreate() {
    setSurvey(false);
    const fn = pendingCreate;
    setPendingCreate(null);
    fn?.();
  }

  function startNewProject() {
    guardedCreate(() => setCreating(true));
  }

  // Not "useTemplate": a use-prefixed name reads as a React hook to both
  // humans and the lint rules, and this is called from event handlers.
  function createFromTemplate(template: Template) {
    guardedCreate(async () => {
      const result = await createProjectFromTemplate(template);
      if (result.ok) {
        track("project_created", { source: "template", platform: template.platform });
        router.push(`/workspace/${result.project.id}`);
      } else if (result.error === "limit") setUpgrade(true);
    });
  }

  return (
    // Sections were 12 apart, which on a wide screen reads as unfinished rather
    // than airy — the eye loses the connection between a heading and its grid.
    <div className="space-y-9">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="animate-fade-up">
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">
            {t("dash.welcome")} <span className="text-[#a5b4fc]">{name}</span>
          </h1>
          <p className="mt-1 text-sm text-white/50">{t("dash.subtitle")}</p>
        </div>
        <Magnetic className="self-start sm:self-auto">
          <PrimaryButton onClick={startNewProject}>
            <Plus className="h-4 w-4" /> {t("dash.newProject")}
          </PrimaryButton>
        </Magnetic>
      </div>

      {/* Small-screen notice. Not a gate — building a bot by chatting works on a
          phone; it's the code editor that wants a real screen. */}
      {compact && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-white/60">
          {t("dash.compactNotice")}
        </div>
      )}

      {/* First-visit onboarding hint (dismissible, remembered) */}
      {showOnboard && (
        // One line, not boxes inside a box inside a card. Three tips shouldn't
        // outweigh the projects they sit above.
        <div className="animate-fade-up flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2.5">
          <h2 className="text-xs font-medium text-white/70">{t("onboard.title")}</h2>
          {[t("onboard.step1"), t("onboard.step2"), t("onboard.step3")].map((step, i) => (
            <span key={i} className="flex items-center gap-2 text-xs text-white/50">
              <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-accent/20 text-[11px] font-semibold text-[#a5b4fc]">
                {i + 1}
              </span>
              {step}
            </span>
          ))}
          <button
            onClick={dismissOnboard}
            aria-label={t("onboard.dismiss")}
            className="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <Close className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Your projects / empty state */}
      {loaded && projects.length > 0 ? (
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-white">{t("dash.yourProjects")}</h2>
            <span className="text-xs text-white/45">
              {!planLoading && Number.isFinite(limit) ? (
                <>
                  {projects.length} / {limit} {plural(lang, limit, { en: ["project", "projects"], ru: ["проект", "проекта", "проектов"] })}
                  {atLimit && (
                    <>
                      {" · "}
                      <button
                        onClick={() => setUpgrade(true)}
                        className="font-medium text-[#818CF8] hover:underline"
                      >
                        {t("dash.upgrade")}
                      </button>
                    </>
                  )}
                </>
              ) : (
                <>
                  {projects.length} {plural(lang, projects.length, { en: ["project", "projects"], ru: ["проект", "проекта", "проектов"] })}
                </>
              )}
            </span>
          </div>
          {showSearch && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("dash.searchPlaceholder")}
                aria-label={t("dash.searchPlaceholder")}
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-[#6366F1]/50 sm:max-w-xs"
              />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as "recent" | "name")}
                aria-label={t("dash.sortLabel")}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-[#6366F1]/50"
              >
                <option value="recent">{t("dash.sortRecent")}</option>
                <option value="name">{t("dash.sortName")}</option>
              </select>
            </div>
          )}
          {visible.length > 0 ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((p, i) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  index={i}
                  onChange={reload}
                  canDuplicate={!atLimit}
                  onRequireUpgrade={() => setUpgrade(true)}
                />
              ))}
            </div>
          ) : (
            <p className="mt-6 text-sm text-white/40">
              {t("dash.noMatches")} “{query.trim()}”.
            </p>
          )}
        </section>
      ) : !loaded ? (
        <section className="grid place-items-center rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-16 text-sm text-white/40">
          <span className="inline-flex items-center gap-2">
            <Bot className="h-4 w-4 animate-pulse" /> {t("dash.loadingProjects")}
          </span>
        </section>
      ) : (
        <section className="animate-fade-up rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-14 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-[#a5b4fc] ring-1 ring-white/10">
            <Bot className="h-6 w-6" />
          </div>
          <h2 className="mt-4 font-display font-semibold text-white">{t("dash.noProjectsYet")}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-white/50">{t("dash.noProjectsHint")}</p>
          <div className="mt-5 flex justify-center">
            <PrimaryButton onClick={startNewProject}>
              <Plus className="h-4 w-4" /> {t("dash.newProject")}
            </PrimaryButton>
          </div>
        </section>
      )}

      {/* Quick start templates */}
      <section>
        <h2 className="text-sm font-semibold text-white">{t("dash.quickStart")}</h2>
        <p className="mt-1 text-sm text-white/50">{t("dash.quickStartHint")}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((tpl, i) => (
            <button
              key={tpl.slug}
              onClick={() => createFromTemplate(tpl)}
              style={{ animationDelay: `${i * 25}ms` }}
              className="group flex animate-fade-up items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-left transition-colors hover:border-white/20 hover:bg-white/[0.04]"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/15 text-[#a5b4fc] ring-1 ring-white/10">
                {tpl.platform === "telegram" ? <Telegram className="h-4 w-4" /> : <Discord className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">{tpl.name}</span>
                {/* Two lines rather than one: these descriptions were being cut
                    mid-word ("a daily 9:0…"), which reads as broken, not brief. */}
                <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-white/45">
                  {tpl.description}
                </span>
              </span>
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-white/25 transition-colors group-hover:text-[#818CF8]" />
            </button>
          ))}
        </div>
      </section>

      {creating && (
        <CreateProjectModal
          onClose={() => setCreating(false)}
          onLimit={() => {
            setCreating(false);
            setUpgrade(true);
          }}
        />
      )}

      {upgrade && (
        <UpgradeModal
          current={plan}
          highlight={nextPlanUp(plan)}
          reason={t("dash.limitReason")
            .replace("{plan}", planMeta(plan).name)
            .replace("{limit}", String(limit))}
          onClose={() => setUpgrade(false)}
        />
      )}

      {/* Pre-create pair for free users: plans → survey → the wizard. */}
      {nudge && (
        <UpgradeModal
          current={plan}
          highlight={nextPlanUp(plan)}
          reason={t("dash.precreateNudgeReason")}
          onClose={() => {
            setNudge(false);
            setSurvey(true);
          }}
        />
      )}

      {survey && <ProjectSurveyModal onDone={runPendingCreate} />}
    </div>
  );
}

function ProjectCard({
  project,
  index,
  onChange,
  canDuplicate,
  onRequireUpgrade,
}: {
  project: StoredProject;
  index: number;
  onChange: () => void;
  canDuplicate: boolean;
  onRequireUpgrade: () => void;
}) {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** A failed card action, shown on the card itself rather than swallowed. */
  const [error, setError] = useState("");
  // Unmounting the input on Escape can still fire its onBlur → commit; the ref
  // makes the cancellation win regardless of event order.
  const renameCancelled = useRef(false);

  const open = () => router.push(`/workspace/${project.id}`);

  async function commitRename() {
    if (renameCancelled.current) {
      renameCancelled.current = false;
      return;
    }
    await renameProject(project.id, draft);
    setRenaming(false);
    onChange();
  }

  return (
    <div
      style={{ animationDelay: `${index * 25}ms` }}
      className="group relative flex animate-fade-up flex-col rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 transition-colors hover:border-white/20 hover:bg-white/[0.03]"
    >
      <div className="flex items-center justify-between">
        <PlatformTag platform={project.platform} />
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[11px] text-white/55">
            {project.language === "python" ? "Python" : "Node.js"}
          </span>
          <button
            aria-label={t("dash.more")}
            onClick={() => {
              setMenu((v) => !v);
              setConfirmDelete(false);
            }}
            className="grid h-7 w-7 place-items-center rounded-lg text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white"
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
            if (e.key === "Escape") {
              renameCancelled.current = true;
              setDraft(project.name);
              setRenaming(false);
            }
          }}
          className="mt-3 w-full rounded-md border border-[#6366F1]/50 bg-white/[0.04] px-2 py-1 text-sm text-white outline-none"
        />
      ) : (
        <button
          onClick={open}
          title={project.name}
          className="mt-3 truncate text-left font-medium text-white transition-colors hover:text-[#a5b4fc]"
        >
          {project.name}
        </button>
      )}

      <p className="mt-1 line-clamp-2 flex-1 text-sm text-white/45">{project.description}</p>

      {error && (
        <p className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-300">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-white/[0.08] pt-3 text-xs text-white/45">
        <span>
          {project.files.length} {plural(lang, project.files.length, { en: ["file", "files"], ru: ["файл", "файла", "файлов"] })} · {timeAgo(project.updatedAt, lang)}
        </span>
        <button onClick={open} className="font-medium text-[#818CF8] hover:underline">
          {t("dash.open")}
        </button>
      </div>

      {/* Dropdown menu */}
      {menu && (
        <>
          <button
            className="fixed inset-0 z-10 cursor-default"
            aria-hidden
            onClick={() => {
              setMenu(false);
              setConfirmDelete(false);
            }}
          />
          <div className="absolute right-4 top-12 z-20 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#0B0D13]/95 py-1 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl">
            <MenuItem icon={<ArrowRight className="h-3.5 w-3.5" />} label={t("dash.open")} onClick={open} />
            <MenuItem
              icon={<Pencil className="h-3.5 w-3.5" />}
              label={t("dash.rename")}
              onClick={() => {
                setDraft(project.name);
                setRenaming(true);
                setMenu(false);
              }}
            />
            <MenuItem
              icon={<Copy className="h-3.5 w-3.5" />}
              label={t("dash.duplicate")}
              onClick={async () => {
                setMenu(false);
                if (!canDuplicate) {
                  onRequireUpgrade();
                  return;
                }
                const result = await duplicateProject(project.id);
                if (result.ok) {
                  onChange();
                } else if (result.error === "limit") {
                  onRequireUpgrade();
                } else {
                  // A genuine failure used to fall through to onChange(), which
                  // reloaded an unchanged list — indistinguishable from nothing
                  // having happened at all.
                  setError(t("dash.couldntDuplicate"));
                }
              }}
            />
            <MenuItem
              icon={<Download className="h-3.5 w-3.5" />}
              label={t("dash.downloadZip")}
              onClick={() => {
                downloadZip(project.name, project.files);
                setMenu(false);
              }}
            />
            <div className="my-1 h-px bg-white/10" />
            {/* Two-step delete: destroying a project must never be one misclick away. */}
            <MenuItem
              icon={<Trash className="h-3.5 w-3.5" />}
              label={confirmDelete ? t("dash.reallyDelete") : t("dash.delete")}
              danger
              onClick={async () => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                setMenu(false);
                setConfirmDelete(false);
                await deleteProject(project.id);
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
        "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors hover:bg-white/[0.06]",
        danger ? "text-rose-400" : "text-white/80",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
