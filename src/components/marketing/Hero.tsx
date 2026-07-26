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
        {/* Left — copy + CTAs (staggered rise-in) */}
        <div className="text-center lg:text-left">
          <div
            className="animate-rise inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/70 backdrop-blur"
            style={{ "--i": 0 } as React.CSSProperties}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#22D3EE]" />
            {t("hero.kicker")}
          </div>

          {/* break-words + a smaller mobile base so long single-word lines
              (e.g. RU "Автоматизируй.") can't overflow the viewport, which the
              page's overflow-x-clip would otherwise hide off-screen. */}
          <h1 className="mt-6 break-words font-display text-4xl font-bold leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl">
            <span className="animate-rise block text-white" style={{ "--i": 1 } as React.CSSProperties}>
              {t("hero.l1")}
            </span>
            {/* Emphasis by weight, not by colour: the three words step down in
                brightness instead of running through a gradient. */}
            <span className="animate-rise block text-white" style={{ "--i": 2 } as React.CSSProperties}>
              {t("hero.l2")}
            </span>
            <span className="animate-rise block text-white/35" style={{ "--i": 3 } as React.CSSProperties}>
              {t("hero.l3")}
            </span>
          </h1>

          <p
            className="animate-rise mx-auto mt-6 max-w-md text-lg text-white/60 lg:mx-0"
            style={{ "--i": 4 } as React.CSSProperties}
          >
            {t("hero.sub2")}
          </p>

          <div
            className="animate-rise mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start"
            style={{ "--i": 5 } as React.CSSProperties}
          >
            <Magnetic className="w-full sm:w-auto">
              <Link
                href={primaryHref}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 font-medium text-white transition-colors hover:bg-accent-hover sm:w-auto"
              >
                {signedIn ? t("hero.ctaOpenDashboard") : t("hero.getStarted")}
              </Link>
            </Magnetic>
            <a
              href="#services"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-6 font-medium text-white/90 backdrop-blur transition-colors hover:bg-white/[0.07] sm:w-auto"
            >
              {t("hero.viewDemo")}
            </a>
          </div>

          <div
            className="animate-rise mt-6 text-xs text-white/40"
            style={{ "--i": 6 } as React.CSSProperties}
          >
            {t("hero.trust")}
          </div>
        </div>

        {/* Right — product dashboard. No ambient glow behind it and no idle
            float: the mock should look like a screenshot, not an art piece. */}
        <div className="relative">
          <div className="animate-fade-up [animation-delay:150ms]">
            <DashboardMock />
          </div>
        </div>
      </div>
    </section>
  );
}
