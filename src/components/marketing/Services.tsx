"use client";

import { useI18n } from "@/lib/i18n/I18nProvider";
import { Telegram, Discord, Bot, Settings, Globe, CodeIcon, ArrowRight } from "@/components/icons";

const CARDS = [
  { icon: Telegram, t: "svc.telegram.t", d: "svc.telegram.d" },
  { icon: Discord, t: "svc.discord.t", d: "svc.discord.d" },
  { icon: Bot, t: "svc.agents.t", d: "svc.agents.d" },
  { icon: Settings, t: "svc.automation.t", d: "svc.automation.d" },
  { icon: Globe, t: "svc.webapps.t", d: "svc.webapps.d" },
  { icon: CodeIcon, t: "svc.integrations.t", d: "svc.integrations.d" },
] as const;

export function Services() {
  const { t } = useI18n();
  return (
    <section id="services" className="relative scroll-mt-24 py-24">
      <div className="container-x">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {t("services.title")}
          </h2>
          <p className="mt-4 text-white/55">{t("services.subtitle")}</p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map(({ icon: Icon, t: title, d: desc }) => (
            <div key={title} className="forge-card group p-6">
              <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#6366F1]/30 to-[#22D3EE]/15 text-[#a5b4fc] ring-1 ring-white/10">
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-lg font-semibold text-white">{t(title)}</h3>
                <ArrowRight className="h-4 w-4 shrink-0 text-white/25 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-[#818CF8]" />
              </div>
              <p className="mt-2 text-sm leading-relaxed text-white/55">{t(desc)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
