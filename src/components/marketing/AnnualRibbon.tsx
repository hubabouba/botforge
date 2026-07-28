"use client";

import { ANNUAL_MONTHS_FREE } from "@/lib/plan";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { plural } from "@/lib/i18n/plural";

/**
 * Corner ribbon on the highlighted pricing card: "2 months free on annual".
 *
 * Rendered only when the server says every annual price exists — advertising a
 * yearly discount that isn't purchasable is the kind of thing an ad reviewer
 * treats as a false claim, and the kind of thing a visitor remembers.
 *
 * Deliberately a statement of the offer, not a countdown or a "limited time"
 * badge: nothing here expires, so nothing here should pretend to.
 */
export function AnnualRibbon() {
  const { t, lang } = useI18n();
  return (
    <div className="pointer-events-none absolute -right-px -top-px h-24 w-24 overflow-hidden rounded-tr-2xl">
      <div className="absolute right-[-38px] top-[18px] w-[150px] rotate-45 bg-emerald-500 py-1 text-center shadow-soft">
        <span className="block text-[10px] font-semibold uppercase leading-tight tracking-wide text-white">
          {ANNUAL_MONTHS_FREE}{" "}
          {plural(lang, ANNUAL_MONTHS_FREE, {
            en: ["month", "months"],
            ru: ["месяц", "месяца", "месяцев"],
          })}
        </span>
        <span className="block text-[9px] font-medium uppercase leading-tight tracking-wide text-white/90">
          {t("pricing.ribbonFree")}
        </span>
      </div>
    </div>
  );
}
