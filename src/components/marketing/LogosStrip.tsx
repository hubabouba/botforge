"use client";

import { useI18n } from "@/lib/i18n/I18nProvider";

/**
 * "Integrates with" marquee — real platforms and tools the product speaks to
 * (honest: these are integrations/tech, not customer logos).
 */
const items = [
  "Telegram",
  "Discord",
  "Stripe",
  "OpenAI",
  "Claude",
  "Python",
  "TypeScript",
  "Vercel",
  "Supabase",
  "AWS",
];

export function LogosStrip() {
  const { t } = useI18n();
  return (
    <section className="relative py-12">
      <div className="container-x">
        <p className="text-center text-xs uppercase tracking-[0.22em] text-white/40">
          {t("trusted.label")}
        </p>
        <div className="relative mt-8 overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_12%,#000_88%,transparent)]">
          <div className="flex w-max animate-marquee gap-12">
            {[...items, ...items].map((item, i) => (
              <span
                key={i}
                className="whitespace-nowrap font-display text-lg font-semibold text-white/35 transition-colors hover:text-white/70"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
