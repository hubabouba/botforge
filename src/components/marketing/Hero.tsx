"use client";

import Link from "next/link";
import { DashboardMock } from "@/components/marketing/DashboardMock";
import { Magnetic } from "@/components/marketing/Magnetic";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function Hero() {
  const { t } = useI18n();
  const { signedIn } = useAuthUser();
  const primaryHref = signedIn ? "/dashboard" : "/signup";

  return (
    <section className="relative pb-20 pt-36 sm:pt-40">
      <div className="container-x grid items-center gap-12 lg:grid-cols-2 lg:gap-10">
        {/* Left — copy + CTAs */}
        <div className="text-center lg:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/70 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22D3EE] shadow-[0_0_8px_2px_rgba(34,211,238,0.6)]" />
            {t("hero.kicker")}
          </div>

          <h1 className="mt-6 font-display text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
            <span className="block text-white">{t("hero.l1")}</span>
            <span className="forge-gradient-text block">{t("hero.l2")}</span>
            <span className="forge-gradient-text block">{t("hero.l3")}</span>
          </h1>

          <p className="mx-auto mt-6 max-w-md text-lg text-white/60 lg:mx-0">{t("hero.sub2")}</p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
            <Magnetic className="w-full sm:w-auto">
              <Link
                href={primaryHref}
                className="group relative inline-flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-[#6366F1] to-[#4F46E5] px-6 font-medium text-white shadow-[0_10px_40px_-10px_rgba(99,102,241,0.9)] sm:w-auto"
              >
                <span className="relative z-10">
                  {signedIn ? t("hero.ctaOpenDashboard") : t("hero.getStarted")}
                </span>
                <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              </Link>
            </Magnetic>
            <a
              href="#services"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-6 font-medium text-white/90 backdrop-blur transition-colors hover:bg-white/[0.07] sm:w-auto"
            >
              {t("hero.viewDemo")}
            </a>
          </div>

          <div className="mt-6 text-xs text-white/40">{t("hero.trust")}</div>
        </div>

        {/* Right — product dashboard */}
        <div className="relative">
          <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-[#6366F1]/20 via-transparent to-[#22D3EE]/10 blur-2xl" />
          <div className="animate-fade-up [animation-delay:150ms]">
            <DashboardMock />
          </div>
        </div>
      </div>
    </section>
  );
}
