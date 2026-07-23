"use client";

import { useI18n } from "@/lib/i18n/I18nProvider";

export function HowItWorks() {
  const { t } = useI18n();
  const steps = [
    { n: "01", title: t("howItWorks.s0.t"), body: t("howItWorks.s0.d") },
    { n: "02", title: t("howItWorks.s1.t"), body: t("howItWorks.s1.d") },
    { n: "03", title: t("howItWorks.s2.t"), body: t("howItWorks.s2.d") },
  ];

  return (
    <section id="how" className="scroll-mt-20 border-t border-border bg-muted/40 py-24">
      <div className="container-x">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-widest text-accent">{t("howItWorks.kicker")}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("howItWorks.title")}
          </h2>
        </div>

        <div className="relative mt-14 grid gap-8 md:grid-cols-3">
          {/* connector line on desktop */}
          <div className="pointer-events-none absolute left-0 right-0 top-5 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block" />
          {steps.map((s) => (
            <div key={s.n} className="relative">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background font-mono text-sm font-medium text-accent shadow-soft">
                {s.n}
              </div>
              <h3 className="mt-5 text-lg font-medium">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
