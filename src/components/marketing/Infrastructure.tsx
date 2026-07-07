"use client";

import type { SVGProps } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { Globe, Chat, Bot, Settings, ShoppingBag } from "@/components/icons";

function Database(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5" aria-hidden {...p}>
      <ellipse cx="12" cy="5" rx="7" ry="3" />
      <path d="M5 5v14c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
      <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
    </svg>
  );
}

const NODES = [
  { icon: Globe, t: "infra.client", s: "infra.clientSub" },
  { icon: Chat, t: "infra.bot", s: "infra.botSub" },
  { icon: Bot, t: "infra.ai", s: "infra.aiSub" },
  { icon: Settings, t: "infra.automation", s: "infra.automationSub" },
  { icon: Database, t: "infra.db", s: "infra.dbSub" },
  { icon: ShoppingBag, t: "infra.payments", s: "infra.paymentsSub" },
] as const;

function Connector({ delay }: { delay: number }) {
  return (
    <div className="flex items-center justify-center lg:flex-1">
      {/* mobile: vertical */}
      <div className="relative h-8 w-px lg:hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-[#6366F1]/40 to-white/5" />
        <span
          className="absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[#22D3EE] shadow-[0_0_8px_2px_rgba(34,211,238,0.7)]"
          style={{ animation: `forge-flow-y 3s linear ${delay}s infinite` }}
        />
      </div>
      {/* desktop: horizontal */}
      <div className="relative hidden h-px w-full lg:block">
        <div className="absolute inset-0 bg-gradient-to-r from-white/5 via-[#6366F1]/40 to-white/5" />
        <span
          className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[#22D3EE] shadow-[0_0_8px_2px_rgba(34,211,238,0.7)]"
          style={{ animation: `forge-flow-x 3s linear ${delay}s infinite` }}
        />
      </div>
    </div>
  );
}

export function Infrastructure() {
  const { t } = useI18n();
  return (
    <section className="relative py-24">
      <div className="container-x">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.22em] text-[#818CF8]">{t("infra.kicker")}</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {t("infra.title")}
          </h2>
          <p className="mt-4 text-white/55">{t("infra.subtitle")}</p>
        </div>

        <div className="mt-14 flex flex-col items-stretch lg:flex-row">
          {NODES.map(({ icon: Icon, t: title, s: sub }, i) => (
            <div key={title} className="contents">
              <div className="group relative flex flex-1 flex-col items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-6 text-center transition-colors hover:border-[#6366F1]/40">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-[#6366F1]/30 to-[#22D3EE]/15 text-[#a5b4fc] ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-105">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-1 font-display text-sm font-semibold text-white">{t(title)}</div>
                <div className="font-mono text-[10px] uppercase tracking-wide text-white/40">{t(sub)}</div>
              </div>
              {i < NODES.length - 1 && <Connector delay={i * 0.4} />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
