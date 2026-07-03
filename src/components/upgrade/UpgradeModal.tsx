"use client";

import { useEffect, useState } from "react";
import { PLANS, PLAN_RANK, planMeta, type Plan } from "@/lib/plan";
import { Close, Check, Lock } from "@/components/icons";
import { cn } from "@/lib/utils";

// Flip on once Stripe Checkout is wired (Part 5). Until then the CTA is a
// friendly "coming soon" so nothing is broken.
const STRIPE_ENABLED = process.env.NEXT_PUBLIC_STRIPE_ENABLED === "true";

export function UpgradeModal({
  current = "free",
  highlight = "basic",
  reason,
  onClose,
}: {
  current?: Plan;
  highlight?: Plan;
  reason?: string;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<Plan | null>(null);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  async function subscribe(plan: Plan) {
    if (!STRIPE_ENABLED) return; // stub: CTA renders as "coming soon"
    setBusy(plan);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-lift"
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-accent-soft text-accent">
            <Lock className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Upgrade your plan</h2>
            {reason && <p className="truncate text-xs text-muted-foreground">{reason}</p>}
          </div>
          <button
            onClick={onClose}
            className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Close className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3 overflow-y-auto p-5 sm:grid-cols-3">
          {PLANS.map((p) => {
            const isCurrent = p.id === current;
            const isHighlight = p.id === highlight && !isCurrent;
            const isDowngrade = PLAN_RANK[p.id] < PLAN_RANK[current];
            return (
              <div
                key={p.id}
                className={cn(
                  "flex flex-col rounded-xl border p-4",
                  isHighlight ? "border-accent shadow-soft ring-1 ring-accent/30" : "border-border",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{p.name}</span>
                  {isCurrent && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Current
                    </span>
                  )}
                  {isHighlight && (
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
                      Recommended
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-semibold tracking-tight">${p.price}</span>
                  <span className="text-xs text-muted-foreground">/mo</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{p.tagline}</p>
                <ul className="mt-3 space-y-1.5">
                  {p.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2 text-xs text-foreground/80">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 pt-1">
                  {isCurrent ? (
                    <button
                      disabled
                      className="w-full rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground"
                    >
                      Your plan
                    </button>
                  ) : p.id === "free" || isDowngrade ? (
                    <button
                      disabled
                      className="w-full rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground opacity-60"
                    >
                      {p.id === "free" ? "Free forever" : "Included"}
                    </button>
                  ) : (
                    <button
                      onClick={() => subscribe(p.id)}
                      disabled={busy === p.id}
                      className={cn(
                        "w-full rounded-lg py-2 text-xs font-medium transition-colors disabled:opacity-60",
                        isHighlight
                          ? "bg-accent text-accent-foreground hover:bg-accent-hover"
                          : "border border-border hover:bg-muted",
                      )}
                    >
                      {STRIPE_ENABLED ? (busy === p.id ? "Redirecting…" : `Choose ${p.name}`) : "Coming soon"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-border px-5 py-3 text-center text-[11px] text-muted-foreground">
          {STRIPE_ENABLED ? (
            <>Secure payment via Stripe · Cancel anytime</>
          ) : (
            <>Payments launch soon via Stripe. By subscribing you’ll agree to our Terms and Privacy Policy.</>
          )}
        </div>
      </div>
    </div>
  );
}

/** Small helper so callers don't need to import Plan just to name a tier. */
export function upgradeReasonFor(plan: Plan): string {
  return `This feature needs the ${planMeta(plan).name} plan.`;
}
