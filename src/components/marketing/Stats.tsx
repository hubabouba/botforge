"use client";

import { useI18n } from "@/lib/i18n/I18nProvider";

export function Stats() {
  const { t } = useI18n();
  // Honest capability highlights — real facts about the product, not invented
  // usage metrics (a young product can't truthfully claim "500+ bots" or
  // "99.9% uptime"). Values are brand/technical tokens (same in every
  // language); only the labels are translated.
  const items = [
    { node: <span className="font-display">Claude</span>, label: t("stat.assistant") },
    { node: <span className="font-mono">24/7</span>, label: t("stat.hosting") },
    { node: <span className="font-mono">AES-256</span>, label: t("stat.secrets") },
    { node: <span className="font-mono">1-click</span>, label: t("stat.flow") },
  ];

  return (
    <section className="relative py-20">
      <div className="container-x">
        <p className="text-center text-xs uppercase tracking-[0.22em] text-white/40">
          {t("stats.kicker")}
        </p>
        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
          {items.map((s, i) => (
            <div
              key={i}
              className="forge-glass rounded-2xl p-6 text-center transition-colors hover:border-white/15"
            >
              <div className="forge-gradient-text font-display text-4xl font-bold tracking-tight sm:text-5xl">
                {s.node}
              </div>
              <div className="mt-2 text-sm text-white/50">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
