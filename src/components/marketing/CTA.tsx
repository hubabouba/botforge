"use client";

import Link from "next/link";
import { Magnetic } from "@/components/marketing/Magnetic";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function CTA() {
  const { t } = useI18n();
  return (
    <section className="py-24">
      <div className="container-x">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] px-6 py-16 text-center sm:px-16">
          {/* glow + grid */}
          <div className="pointer-events-none absolute inset-0 forge-grid opacity-[0.4]" />
          <div className="pointer-events-none absolute -left-20 top-0 h-72 w-72 rounded-full bg-[#6366F1]/25 blur-3xl" />
          <div className="pointer-events-none absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-[#22D3EE]/15 blur-3xl" />

          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-balance font-display text-3xl font-bold tracking-tight text-white sm:text-5xl">
              {t("cta.title")}
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-balance text-white/60">{t("cta.subtitle")}</p>
            <div className="mt-8 flex justify-center">
              <Magnetic>
                <Link
                  href="/signup"
                  className="group relative inline-flex h-12 items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-[#6366F1] to-[#4F46E5] px-8 font-medium text-white shadow-[0_10px_40px_-10px_rgba(99,102,241,0.9)]"
                >
                  <span className="relative z-10">{t("cta.button")}</span>
                  <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                </Link>
              </Magnetic>
            </div>
            <p className="mt-4 text-xs text-white/40">{t("cta.note")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
