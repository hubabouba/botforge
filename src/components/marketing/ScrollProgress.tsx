"use client";

import { useEffect, useRef } from "react";

/**
 * Thin scroll-progress bar pinned to the very top of the page — a quiet,
 * premium detail (Stripe/Linear-style). Dependency-free: a single rAF-throttled
 * scroll listener drives a scaleX transform, so it stays cheap.
 */
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const p = max > 0 ? Math.min(1, doc.scrollTop / max) : 0;
      el.style.transform = `scaleX(${p})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5">
      <div
        ref={ref}
        className="h-full origin-left scale-x-0 bg-gradient-to-r from-[#818CF8] via-[#6366F1] to-[#22D3EE]"
        style={{ willChange: "transform" }}
      />
    </div>
  );
}
