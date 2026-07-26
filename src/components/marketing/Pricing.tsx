"use client";

import Link from "next/link";
import { pricingTiers } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { Check } from "@/components/icons";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function Pricing() {
  const { t } = useI18n();
  return (
    <section id="pricing" className="relative scroll-mt-24 py-24">
      <div className="container-x">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.22em] text-[#818CF8]">{t("pricing.kicker")}</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {t("pricing.title")}
          </h2>
          <p className="mt-4 text-white/55">{t("pricing.subtitle")}</p>
        </div>

        <div className="mx-auto mt-14 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {pricingTiers.map((tier) => (
            <div
              key={tier.id}
              className={cn(
                "relative flex flex-col rounded-2xl border p-6 backdrop-blur transition-all",
                // The popular tier stands out by a solid accent ring and a lift,
                // not by a coloured halo glowing behind the card.
                tier.highlighted
                  ? "border-accent bg-white/[0.045] ring-1 ring-accent/40 md:-translate-y-3"
                  : "border-white/10 bg-white/[0.02] hover:-translate-y-1 hover:border-white/20",
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display font-semibold text-white">{tier.name}</h3>
                {tier.highlighted && (
                  <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-white">
                    {t("pricing.popular")}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-white/50">{t(`pricing.${tier.id}.tagline`)}</p>

              <div className="mt-5 flex items-baseline gap-1">
                <span className="font-mono text-4xl font-bold tracking-tight text-white">
                  ${tier.price}
                </span>
                <span className="text-sm text-white/45">/mo</span>
              </div>

              <Link
                href="/signup"
                className={cn(
                  "mt-6 inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-medium transition-all",
                  tier.highlighted
                    ? "bg-accent text-white hover:bg-accent-hover"
                    : "border border-white/12 bg-white/[0.03] text-white hover:bg-white/[0.07]",
                )}
              >
                {t(`pricing.${tier.id}.cta`)}
              </Link>

              <ul className="mt-6 space-y-3 text-sm">
                {tier.features.map((f, i) => (
                  <li key={f} className="flex gap-2.5 text-white/60">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#22D3EE]" />
                    <span>{t(`pricing.${tier.id}.feature.${i}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
