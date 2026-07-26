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
          {/* Grid texture only — the two blurred colour blobs that used to sit
              in the corners were pure decoration. */}
          <div className="pointer-events-none absolute inset-0 forge-grid opacity-[0.4]" />

          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-balance font-display text-3xl font-bold tracking-tight text-white sm:text-5xl">
              {t("cta.title")}
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-balance text-white/60">{t("cta.subtitle")}</p>
            <div className="mt-8 flex justify-center">
              <Magnetic>
                <Link
                  href="/signup"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-8 font-medium text-white transition-colors hover:bg-accent-hover"
                >
                  {t("cta.button")}
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
