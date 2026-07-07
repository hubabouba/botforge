"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";

/** Animated count-up that fires once when scrolled into view. */
function CountUp({
  to,
  decimals = 0,
  suffix = "",
  duration = 1500,
}: {
  to: number;
  decimals?: number;
  suffix?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [val, setVal] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const p = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            setVal(to * eased);
            if (p < 1) requestAnimationFrame(tick);
            else setVal(to);
          };
          requestAnimationFrame(tick);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration]);

  return (
    <span ref={ref} className="font-mono">
      {val.toFixed(decimals)}
      {suffix}
    </span>
  );
}

export function Stats() {
  const { t } = useI18n();
  const items = [
    { node: <CountUp to={500} suffix="+" />, label: t("stat.bots") },
    { node: <CountUp to={2} suffix="M+" />, label: t("stat.requests") },
    { node: <CountUp to={99.9} decimals={1} suffix="%" />, label: t("stat.uptime") },
    { node: <span className="font-mono">24/7</span>, label: t("stat.support") },
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
