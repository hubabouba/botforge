"use client";

import { useI18n } from "@/lib/i18n/I18nProvider";
import { ArrowRight } from "@/components/icons";

const CASES = [
  {
    id: "steam",
    t: "case.steam.t",
    tag: "case.steam.tag",
    metric: "+340%",
    label: "case.steam.label",
    line: "M0,50 C24,48 40,44 60,40 C82,36 96,30 120,24 C146,18 162,10 200,4",
  },
  {
    id: "shopify",
    t: "case.shopify.t",
    tag: "case.shopify.tag",
    metric: "1.2M",
    label: "case.shopify.label",
    line: "M0,44 C26,42 38,30 60,32 C84,34 96,20 120,18 C146,16 168,12 200,8",
  },
  {
    id: "crypto",
    t: "case.crypto.t",
    tag: "case.crypto.tag",
    metric: "$500K",
    label: "case.crypto.label",
    line: "M0,52 C22,50 40,46 60,42 C84,37 100,34 120,28 C148,20 170,16 200,10",
  },
] as const;

function Sparkline({ d, id }: { d: string; id: string }) {
  return (
    <svg viewBox="0 0 200 60" className="h-16 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>
        <linearGradient id={`sparkfill-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366F1" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L200,60 L0,60 Z`} fill={`url(#sparkfill-${id})`} />
      <path d={d} fill="none" stroke={`url(#spark-${id})`} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function CaseStudies() {
  const { t } = useI18n();
  return (
    <section id="cases" className="relative scroll-mt-24 py-24">
      <div className="container-x">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.22em] text-[#818CF8]">{t("cases.kicker")}</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {t("cases.title")}
          </h2>
          <p className="mt-4 text-white/55">{t("cases.subtitle")}</p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {CASES.map((c) => (
            <div key={c.id} className="forge-card group flex flex-col p-6">
              <div className="flex items-center justify-between">
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-[11px] font-medium text-white/60">
                  {t(c.tag)}
                </span>
                <ArrowRight className="h-4 w-4 text-white/25 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-[#818CF8]" />
              </div>

              <h3 className="mt-4 font-display text-lg font-semibold text-white">{t(c.t)}</h3>

              <div className="mt-4">
                <Sparkline d={c.line} id={c.id} />
              </div>

              <div className="mt-4 border-t border-white/[0.08] pt-4">
                <div className="forge-gradient-text font-mono text-3xl font-bold">{c.metric}</div>
                <div className="mt-1 text-sm text-white/50">{t(c.label)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
