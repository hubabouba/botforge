"use client";

import { useI18n } from "@/lib/i18n/I18nProvider";

const FAQ_COUNT = 5;

export function FAQ() {
  const { t } = useI18n();
  const faqs = Array.from({ length: FAQ_COUNT }, (_, i) => ({
    q: t(`faq.q${i}`),
    a: t(`faq.a${i}`),
  }));

  return (
    <section id="faq" className="relative scroll-mt-24 py-24">
      <div className="container-x grid gap-12 md:grid-cols-[1fr_1.4fr]">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-[#818CF8]">{t("faq.kicker")}</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {t("faq.title")}
          </h2>
          <p className="mt-4 text-sm text-white/50">{t("faq.subtitle")}</p>
        </div>

        <div className="flex flex-col gap-3">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 transition-colors open:border-[#6366F1]/30 open:bg-white/[0.03] hover:border-white/15"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-white">
                {f.q}
                <span className="ml-4 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-white/60 transition-transform duration-300 group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-white/55">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
