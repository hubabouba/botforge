"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/marketing/Logo";
import { ArrowLeft, User, Chart, Bot, ListChecks, FolderIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

interface Stats {
  users: { total: number; newToday: number; new7d: number; truncated: boolean; recent: Signup[] };
  plans: { free: number; basic: number; pro: number; max: number };
  mrr: number;
  annualSubscribers: number;
  ai: {
    messagesToday: number;
    messagesThisMonth: number;
    costToday: number;
    costThisMonth: number;
    grossThisMonth: number;
    perModel: { model: string; messages: number; usd: number; usdPerMessage: number }[];
    topAccounts: { email: string; plan: Signup["plan"]; messages: number; usd: number; marginUsd: number }[];
  };
  hosting: { runningNow: number; minutesThisMonth: number };
  projects: { total: number; newToday: number };
  priceCheck: { enabled: boolean; rows: PriceCheckRow[] };
  generatedAt: string;
}

interface PriceCheckRow {
  plan: "basic" | "pro" | "max";
  interval: "month" | "year";
  expectedUsd: number;
  actualUsd: number | null;
  ok: boolean;
  problem: string | null;
}

interface Signup {
  email: string;
  createdAt: string;
  plan: "free" | "basic" | "pro" | "max";
}

const POLL_MS = 20_000;

// Known-good root dashboards for the services this product depends on — plain
// links, not embedded (no new API tokens/scopes needed to ship this today).
const LINKS = [
  { label: "Stripe", href: "https://dashboard.stripe.com" },
  { label: "Anthropic Console", href: "https://console.anthropic.com" },
  { label: "Fly.io (bot hosting)", href: "https://fly.io/apps/botforge-bots" },
  { label: "Supabase", href: "https://supabase.com/dashboard/project/nllkehoxgaruvzvozlrx" },
  { label: "Vercel", href: "https://vercel.com/dashboard" },
  { label: "Sentry", href: "https://sentry.io" },
  { label: "PostHog", href: "https://eu.posthog.com" },
];

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function Card({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: (p: { className?: string }) => React.ReactElement;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900/60 p-4">
      <div className="flex items-center gap-2 text-neutral-500">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[11px] uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-2 font-display text-2xl font-semibold text-neutral-100">{value}</div>
      {sub && <div className="mt-1 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

const PLAN_BADGE: Record<Signup["plan"], string> = {
  free: "text-neutral-400 bg-white/[0.04]",
  basic: "text-sky-300 bg-sky-500/10",
  pro: "text-accent bg-accent/10",
  max: "text-amber-300 bg-amber-500/10",
};

export function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stats", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStats(await res.json());
      setError("");
    } catch {
      setError("Couldn't load stats — retrying…");
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    return () => clearInterval(timer.current);
  }, [load]);

  return (
    <div className="forge dark min-h-screen bg-ink-950 text-neutral-200">
      <header className="flex h-14 items-center gap-3 border-b border-ink-800 px-4">
        <Link href="/dashboard" className="flex items-center gap-2 text-white/60 hover:text-white" title="Back to dashboard">
          <ArrowLeft className="h-4 w-4" />
          <Logo className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-neutral-100">Admin</h1>
          <p className="text-[11px] text-neutral-500">Personal stats — not visible to users, not linked anywhere</p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-neutral-500">
          {error ? (
            <span className="text-rose-400">{error}</span>
          ) : stats ? (
            <span>Updated {relTime(stats.generatedAt)} · auto-refreshes every 20s</span>
          ) : (
            <span>Loading…</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {!stats ? (
          <p className="text-sm text-neutral-500">{error || "Loading…"}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Card
                icon={User}
                label="Users"
                value={stats.users.total.toLocaleString()}
                sub={`+${stats.users.newToday} today · +${stats.users.new7d} in 7d${stats.users.truncated ? " (capped at 1000)" : ""}`}
              />
              <Card
                icon={Chart}
                label="MRR"
                value={`$${stats.mrr.toFixed(2)}`}
                sub={`${stats.plans.basic} Basic · ${stats.plans.pro} Pro · ${stats.plans.max} Max${
                  stats.annualSubscribers > 0 ? ` · ${stats.annualSubscribers} annual` : ""
                }`}
              />
              <Card
                icon={ListChecks}
                label="AI messages"
                value={stats.ai.messagesToday.toLocaleString()}
                sub={`${stats.ai.messagesThisMonth.toLocaleString()} this month`}
              />
              {/* The two numbers the pricing depends on. MRR alone says nothing
                  about whether a plan carries its own cost. */}
              <Card
                icon={Chart}
                label="AI cost"
                value={`$${stats.ai.costToday.toFixed(2)}`}
                sub={`$${stats.ai.costThisMonth.toFixed(2)} this month`}
              />
              <Card
                icon={Chart}
                label="MRR minus AI cost"
                value={`$${stats.ai.grossThisMonth.toFixed(2)}`}
                sub={stats.ai.grossThisMonth < 0 ? "negative — a tier is underpriced" : "this month, before hosting"}
              />
              <Card
                icon={Bot}
                label="Bots running now"
                value={stats.hosting.runningNow}
                sub={`${stats.hosting.minutesThisMonth.toLocaleString()} min hosted this month`}
              />
              <Card
                icon={FolderIcon}
                label="Projects"
                value={stats.projects.total.toLocaleString()}
                sub={`+${stats.projects.newToday} today`}
              />
              <Card
                icon={User}
                label="Free users"
                value={stats.plans.free.toLocaleString()}
                sub="never converted (yet)"
              />
            </div>

            {/* Does Stripe charge what the site advertises? The two numbers live
                in different systems and nothing compared them until now: the
                pricing page reads plan.ts, the card is charged whatever was
                typed into the Stripe Dashboard. Silent when they agree — this
                block should be invisible on a normal day. */}
            {stats.priceCheck.enabled && stats.priceCheck.rows.some((r) => !r.ok) && (
              <div className="mt-6 rounded-xl border border-rose-500/40 bg-rose-500/[0.06] p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-rose-300">
                  Stripe prices don&apos;t match the site
                </h2>
                <p className="mt-1 text-xs text-neutral-400">
                  Customers are shown the first number and charged the second. Fix in the Stripe Dashboard, or
                  correct the price id in the Vercel environment.
                </p>
                <div className="mt-3 divide-y divide-rose-500/20">
                  {stats.priceCheck.rows
                    .filter((r) => !r.ok)
                    .map((r) => (
                      <div key={`${r.plan}-${r.interval}`} className="py-2 text-sm">
                        <span className="font-medium capitalize text-neutral-200">
                          {r.plan} · {r.interval === "year" ? "annual" : "monthly"}
                        </span>
                        <span className="ml-2 text-xs text-rose-300">{r.problem}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* And a line when they agree — "no alarm" and "no check ran" must
                not look the same. */}
            {stats.priceCheck.enabled && stats.priceCheck.rows.length > 0 &&
              stats.priceCheck.rows.every((r) => r.ok) && (
                <p className="mt-6 text-xs text-neutral-600">
                  Stripe charges what the site advertises — {stats.priceCheck.rows.length} prices checked.
                </p>
              )}

            {/* Cost per message per model — the figure every message cap and
                model choice in plan.ts was guessed at. Plus the single most
                expensive account, because an average hides the one user who
                eats a tier's whole margin. */}
            <div className="mt-6 rounded-xl border border-ink-800 bg-ink-900/60 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Cost per message, this month
              </h2>
              <div className="mt-3 divide-y divide-ink-800">
                {stats.ai.perModel.length === 0 && (
                  <p className="py-3 text-sm text-neutral-600">
                    Nothing recorded yet — send an assistant message on a paid plan.
                  </p>
                )}
                {stats.ai.perModel.map((m) => (
                  <div key={m.model} className="flex items-center gap-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-300">{m.model}</span>
                    <span className="w-24 shrink-0 text-right text-xs text-neutral-500">
                      {m.messages.toLocaleString()} msg
                    </span>
                    <span className="w-20 shrink-0 text-right text-xs text-neutral-500">${m.usd.toFixed(2)}</span>
                    <span className="w-24 shrink-0 text-right font-mono text-xs text-neutral-200">
                      ${m.usdPerMessage.toFixed(4)}/msg
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Per account, dearest first. The distribution is the point: if the
                top account costs more than its plan brings in, the cap is wrong,
                and an average would never have shown it. */}
            <div className="mt-6 rounded-xl border border-ink-800 bg-ink-900/60 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Spend by account, this month
              </h2>
              <div className="mt-3 divide-y divide-ink-800">
                {stats.ai.topAccounts.length === 0 && (
                  <p className="py-3 text-sm text-neutral-600">Nothing recorded yet.</p>
                )}
                {stats.ai.topAccounts.map((a) => (
                  <div key={a.email} className="flex items-center gap-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-neutral-300">{a.email}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
                        PLAN_BADGE[a.plan],
                      )}
                    >
                      {a.plan}
                    </span>
                    <span className="w-20 shrink-0 text-right text-xs text-neutral-500">
                      {a.messages.toLocaleString()} msg
                    </span>
                    <span className="w-20 shrink-0 text-right font-mono text-xs text-neutral-300">
                      ${a.usd.toFixed(2)}
                    </span>
                    {/* What they pay minus what they cost. Red means the rest of
                        the customers are paying for this one. */}
                    <span
                      className={cn(
                        "w-24 shrink-0 text-right font-mono text-xs",
                        a.marginUsd < 0 ? "text-rose-400" : "text-emerald-400",
                      )}
                    >
                      {a.marginUsd < 0 ? "−" : "+"}${Math.abs(a.marginUsd).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 border-t border-ink-800 pt-3 text-[11px] leading-relaxed text-neutral-600">
                Last column is what the plan brings in this month minus what the assistant cost.
                Red means that account is being subsidised by the others — expected for a few, a
                problem when it is the norm for a tier.
              </p>
            </div>

            <div className="mt-6 rounded-xl border border-ink-800 bg-ink-900/60 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Recent signups</h2>
              <div className="mt-3 divide-y divide-ink-800">
                {stats.users.recent.length === 0 && <p className="py-3 text-sm text-neutral-600">No signups yet.</p>}
                {stats.users.recent.map((s) => (
                  <div key={s.email + s.createdAt} className="flex items-center gap-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-neutral-300">{s.email}</span>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", PLAN_BADGE[s.plan])}>
                      {s.plan}
                    </span>
                    <span className="w-16 shrink-0 text-right text-xs text-neutral-500">{relTime(s.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Quick links</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {LINKS.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-white/[0.04] hover:text-neutral-100"
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
