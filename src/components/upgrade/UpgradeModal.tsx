"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  ANNUAL_MONTHS_FREE,
  PLANS,
  PLAN_RANK,
  annualMonthlyEquivalent,
  annualPrice,
  type BillingInterval,
  type Plan,
} from "@/lib/plan";
import { track } from "@/lib/analytics";
import { fbTrack, stashPendingPurchase } from "@/lib/metaPixel";
import { usePlan } from "@/hooks/usePlan";
import { Close, Check, Lock } from "@/components/icons";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { plural } from "@/lib/i18n/plural";
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
  const { t, lang } = useI18n();
  // Whether annual is offered comes from the server (every annual price
  // configured), not a second public env flag that could drift out of sync with
  // the real Stripe setup and 503 at checkout.
  const { annualBilling } = usePlan();
  const [busy, setBusy] = useState<Plan | null>(null);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const [interval, setInterval] = useState<BillingInterval>("month");
  const annual = interval === "year";

  useEffect(() => {
    setMounted(true);
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  async function subscribe(plan: Plan) {
    if (!STRIPE_ENABLED) {
      setError(t("upgrade.stripeDisabledError"));
      return;
    }
    setBusy(plan);
    setError("");
    track("upgrade_clicked", { plan, interval });
    // The price at the moment checkout is attempted — the last point it's
    // known client-side. Stashed for the Purchase event, which fires later on
    // ?checkout=success, after the tab that knows this value is long closed.
    const value = interval === "year" ? annualPrice(plan) : (PLANS.find((p) => p.id === plan)?.price ?? 0);
    fbTrack("InitiateCheckout", { value, currency: "USD" });
    stashPendingPurchase(value);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.url) window.location.href = data.url;
      // No Checkout session at all: the account already had a live
      // subscription and the server changed its price in place instead of
      // minting a second one (see the comment in /api/checkout). There is
      // nothing to redirect to — land where a completed Checkout would have.
      else if (data.updated) window.location.href = "/dashboard?checkout=success";
      else setError(data.error || t("upgrade.checkoutFailed").replace("{status}", String(res.status)));
    } catch {
      setError(t("upgrade.networkError"));
    } finally {
      setBusy(null);
    }
  }

  async function manage() {
    setBusy(current);
    setError("");
    try {
      const res = await fetch("/api/billing-portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (data.url) window.location.href = data.url;
      else setError(data.error || t("upgrade.portalFailed").replace("{status}", String(res.status)));
    } catch {
      setError(t("upgrade.networkError"));
    } finally {
      setBusy(null);
    }
  }

  const content = (
    <div className="forge dark fixed inset-0 z-[60] modal-backdrop grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-panel flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-lift"
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-accent-soft text-accent">
            <Lock className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{t("upgrade.title")}</h2>
            {reason && <p className="truncate text-xs text-muted-foreground">{reason}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Close className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
            {error}
          </div>
        )}

        {/* Monthly / annual. Only rendered when every annual price exists —
            a toggle that works on some tiers and not others is worse than none. */}
        {annualBilling && STRIPE_ENABLED && (
          <div className="flex items-center justify-center gap-3 pt-5">
            <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
              {(["month", "year"] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => setInterval(value)}
                  aria-pressed={interval === value}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    interval === value
                      ? "bg-background text-foreground shadow-soft"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(value === "month" ? "upgrade.monthly" : "upgrade.annual")}
                </button>
              ))}
            </div>
            <span className="text-xs font-medium text-emerald-500">
              {ANNUAL_MONTHS_FREE}{" "}
              {plural(lang, ANNUAL_MONTHS_FREE, {
                en: ["month", "months"],
                ru: ["месяц", "месяца", "месяцев"],
              })}{" "}
              {t("upgrade.annualSaving")}
            </span>
          </div>
        )}

        <div className="grid gap-3 overflow-y-auto p-5 sm:grid-cols-2 lg:grid-cols-4">
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
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {t("upgrade.current")}
                    </span>
                  )}
                  {isHighlight && (
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                      {t("upgrade.recommended")}
                    </span>
                  )}
                </div>
                {/* On annual the YEAR is the headline, because that is what
                    leaves the customer's account. Leading with "$15.83/mo"
                    while a badge said "2 months free" was two ways of counting
                    in one glance — the eye catches "/mo" and concludes it's a
                    monthly charge. The per-month figure stays underneath for
                    comparing tiers: both numbers visible, neither hidden, which
                    is what keeps a "surprise" charge from becoming a dispute.
                    Free has no annual price to show. */}
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-semibold tracking-tight">
                    ${annual && p.price > 0 ? annualPrice(p.id) : p.price}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(annual && p.price > 0 ? "upgrade.perYear" : "upgrade.perMonth")}
                  </span>
                </div>
                {annual && p.price > 0 && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {t("upgrade.worksOutTo").replace("{price}", `$${annualMonthlyEquivalent(p.id)}`)}
                    {" · "}
                    {/* Auto-renewal, said plainly next to the price. A yearly
                        charge nobody remembers agreeing to is the classic
                        dispute, and a dispute costs more than the sale. */}
                    {t("upgrade.renewsYearly")}
                  </div>
                )}
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(`plan.${p.id}.tagline`)}</p>
                <ul className="mt-3 space-y-1.5">
                  {p.highlights.map((h, i) => (
                    <li key={h} className="flex items-start gap-2 text-xs text-foreground/80">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                      <span>{t(`plan.${p.id}.h${i}`)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 pt-1">
                  {isCurrent ? (
                    STRIPE_ENABLED && p.id !== "free" ? (
                      // Already on this plan. With annual selected the button
                      // becomes "switch to annual" — the single most valuable
                      // move a subscriber can make, and until now there was no
                      // way to do it: the card just said "Manage" whichever
                      // interval was showing.
                      //
                      // It opens the billing portal rather than Checkout on
                      // purpose. Checkout in subscription mode creates a NEW
                      // subscription, so someone with a monthly plan would end
                      // up paying twice. The portal knows what they're actually
                      // on and prorates the swap.
                      <button
                        onClick={manage}
                        disabled={busy === p.id}
                        className={cn(
                          "w-full rounded-lg py-2 text-xs font-medium transition-colors disabled:opacity-60",
                          annual
                            ? "bg-accent text-accent-foreground hover:bg-accent-hover"
                            : "border border-border hover:bg-muted",
                        )}
                      >
                        {busy === p.id
                          ? t("upgrade.opening")
                          : annual
                            ? t("upgrade.switchToAnnual")
                            : t("upgrade.manage")}
                      </button>
                    ) : (
                      <button
                        disabled
                        className="w-full rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground"
                      >
                        {t("upgrade.yourPlan")}
                      </button>
                    )
                  ) : p.id === "free" || isDowngrade ? (
                    <button
                      disabled
                      className="w-full rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground opacity-60"
                    >
                      {p.id === "free" ? t("upgrade.freeForever") : t("upgrade.included")}
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
                      {STRIPE_ENABLED ? (busy === p.id ? t("upgrade.redirecting") : `${t("upgrade.choose")} ${p.name}`) : t("upgrade.comingSoon")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* The refund terms, where the decision is made. Burying them in /terms
            and hoping nobody reads is how you get a dispute instead of an email
            — and on annual it's the sentence that makes committing to a year
            feel survivable. */}
        {STRIPE_ENABLED && (
          <div className="mx-5 mb-1 mt-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-center text-[11px] leading-relaxed text-muted-foreground">
            {annual ? t("upgrade.refundAnnual") : t("upgrade.refundMonthly")}
          </div>
        )}

        <div className="border-t border-border px-5 py-3 text-center text-[11px] text-muted-foreground">
          {STRIPE_ENABLED ? t("upgrade.footerSecure") : t("upgrade.footerSoon")}
          {t("upgrade.agreeToOur")}{" "}
          <Link href="/terms" target="_blank" className="underline hover:text-foreground">
            {t("upgrade.terms")}
          </Link>{" "}
          {t("upgrade.and")}{" "}
          <Link href="/privacy" target="_blank" className="underline hover:text-foreground">
            {t("upgrade.privacyPolicy")}
          </Link>
          .
        </div>
      </div>
    </div>
  );

  return mounted ? createPortal(content, document.body) : null;
}
