"use client";

import { useEffect } from "react";

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

/**
 * Run once the browser is idle, or shortly after — Safari has no rIC. The
 * identical helper lives in PostHogProvider; kept local rather than shared
 * for the same reason neither analytics loader shares one — it's three lines,
 * and the two providers otherwise share nothing.
 */
function whenIdle(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback;
  if (ric) {
    const handle = ric(fn, { timeout: 3000 });
    return () => (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(handle);
  }
  const timer = setTimeout(fn, 1200);
  return () => clearTimeout(timer);
}

type Fbq = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: Fbq;
  loaded: boolean;
  version: string;
};

/**
 * A faithful port of Meta's own base pixel snippet — not a copy-pasted inline
 * script. `fbq` starts as a stub that only queues calls; once fbevents.js
 * loads it attaches `callMethod` to the same object and drains the queue, so
 * anything fired before the network round-trip finishes (including the
 * PageView below) still lands. Ordinary JS, not injected HTML — script-src
 * only needs the host below, nothing about CSP's 'unsafe-inline' is involved.
 */
function loadPixel(pixelId: string): void {
  const w = window as typeof window & { fbq?: Fbq; _fbq?: Fbq };
  if (w.fbq) return; // Fast Refresh in dev, or a second mount

  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.push = fbq;
  w.fbq = fbq;
  w._fbq = fbq;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);

  fbq("init", pixelId);
  fbq("track", "PageView");
}

/**
 * Meta/Facebook Pixel, loaded off the critical path — same reasoning as
 * PostHogProvider: this sits in the root layout, so anything it pulls in
 * eagerly lands in the first-load bundle of every page, including the one
 * that matters most for what this exists to measure — a phone arriving cold
 * from the ad.
 *
 * With no pixel id configured (anywhere but production, until one is set)
 * this is a complete no-op, same gating as every other integration here.
 */
export function MetaPixelProvider() {
  useEffect(() => {
    if (!PIXEL_ID) return;
    return whenIdle(() => loadPixel(PIXEL_ID));
  }, []);

  return null;
}
