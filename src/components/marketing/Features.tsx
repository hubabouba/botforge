"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";

function Icon({ path }: { path: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      {path}
    </svg>
  );
}

const icons: ReactNode[] = [
  <Icon key="0" path={<><path d="m8 6-6 6 6 6" /><path d="m16 6 6 6-6 6" /></>} />,
  <Icon key="1" path={<><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>} />,
  <Icon key="2" path={<><path d="M12 3v3" /><path d="M18.4 6.6 16 9" /><circle cx="12" cy="14" r="6" /><path d="M12 11v3l2 1" /></>} />,
  <Icon key="3" path={<><path d="m5 3 14 9-14 9V3Z" /></>} />,
  <Icon key="4" path={<><path d="M12 3v12" /><path d="m7 12 5 5 5-5" /><path d="M5 21h14" /></>} />,
  <Icon key="5" path={<><path d="M3 3v18h18" /><path d="m7 15 3-4 3 3 4-6" /></>} />,
];

export function Features() {
  const { t } = useI18n();
  const features = icons.map((icon, i) => ({
    title: t(`features.f${i}.t`),
    body: t(`features.f${i}.d`),
    icon,
  }));

  return (
    <section id="features" className="scroll-mt-20 py-24">
      <div className="container-x">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-widest text-accent">{t("features.kicker")}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("features.title")}
          </h2>
          <p className="mt-4 text-muted-foreground">
            {t("features.subtitle")}
          </p>
        </div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group relative bg-background p-6 transition-colors duration-200 hover:bg-muted/40"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                {f.icon}
              </div>
              <h3 className="mt-4 font-medium">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
