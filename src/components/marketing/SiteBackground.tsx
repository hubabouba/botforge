"use client";

import { useEffect, useRef } from "react";

/**
 * Fixed cosmic backdrop for the premium landing: cyber grid, drifting aurora
 * blobs, floating particles and a cursor-following spotlight. Dependency-free,
 * pointer-events-none, and reduced-motion aware (animations are neutralised by
 * the global prefers-reduced-motion rule in globals.css).
 */
export function SiteBackground() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--mx", "50%");
    el.style.setProperty("--my", "12%");
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--mx", `${e.clientX}px`);
        el.style.setProperty("--my", `${e.clientY}px`);
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[#080A0F]" />
      <div className="forge-grid forge-grid-fade absolute inset-0 opacity-60" />

      {/* Aurora blobs */}
      <div className="forge-aurora absolute -top-48 left-1/4 h-[44rem] w-[44rem] -translate-x-1/2 rounded-full bg-[#6366F1]/25" />
      <div className="forge-aurora absolute -top-24 right-[12%] h-[34rem] w-[34rem] rounded-full bg-[#22D3EE]/15 [animation-delay:-7s]" />
      <div className="forge-aurora absolute left-[58%] top-[38%] h-[30rem] w-[30rem] -translate-x-1/2 rounded-full bg-[#818CF8]/14 [animation-delay:-12s]" />

      {/* Floating particles */}
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white/50"
          style={{
            left: p.left,
            top: p.top,
            height: p.size,
            width: p.size,
            animation: `forge-drift ${p.dur}s linear ${p.delay}s infinite`,
          }}
        />
      ))}

      {/* Cursor spotlight */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(600px circle at var(--mx) var(--my), rgba(99,102,241,0.10), transparent 60%)",
        }}
      />

      {/* Fade bottom into the page background */}
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-transparent to-[#080A0F]" />
    </div>
  );
}

const PARTICLES = Array.from({ length: 26 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  top: `${(i * 61) % 100}%`,
  size: `${(i % 3) + 1}px`,
  dur: 9 + (i % 7),
  delay: (i % 10) * 0.8,
}));
