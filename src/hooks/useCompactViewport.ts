"use client";

import { useEffect, useState } from "react";

/** Below Tailwind's `lg` — phones and most tablets in portrait. */
const COMPACT_QUERY = "(max-width: 1023px)";

/**
 * True when the viewport is too narrow for the workspace's three-column layout
 * (file tree + editor + assistant). Components use it to swap in the compact,
 * chat-first arrangement and to let the assistant mention that a desktop is
 * roomier.
 *
 * Starts `false` so the server render and the first client render agree — the
 * real value lands in the effect right after mount (same approach as the
 * localStorage-backed onboarding hint on the dashboard). CSS breakpoints still
 * do the actual layout work; this is only for the decisions CSS can't make.
 */
export function useCompactViewport(): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(COMPACT_QUERY);
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return compact;
}
