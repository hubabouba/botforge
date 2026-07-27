"use client";

import { useCallback, useEffect, useState } from "react";
import { getStatus } from "@/lib/hosting/client";
import type { DeploymentView } from "@/lib/hosting/types";

/**
 * One polling loop per project, shared by every component that asks for it.
 *
 * Three places call this hook — Workspace (for the first-run checklist),
 * MetricsPanel and HostingPanel — and each used to run its own timer, so
 * opening the Logs panel doubled the request rate. Measured on production: one
 * user watching one bot for six hours produced 1004 calls to
 * /api/hosting/projects/[id]/status, and every one of those makes a Fly API
 * call server-side. Subscribers now share a single loop and a single result.
 *
 * The loop polls only while the tab is visible, faster while the run is active,
 * and stops entirely once the last subscriber unmounts.
 */

const ACTIVE_MS = 2500;
const IDLE_MS = 6000;

interface Entry {
  listeners: Set<(v: DeploymentView | null) => void>;
  status: DeploymentView | null;
  loaded: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  abort: AbortController | null;
  /** Bumped on teardown so a fetch still in flight can't revive a dead loop. */
  epoch: number;
}

const loops = new Map<string, Entry>();

function isActive(v: DeploymentView | null): boolean {
  return v?.status === "starting" || v?.status === "running" || v?.status === "stopping";
}

async function poll(projectId: string, entry: Entry): Promise<void> {
  const epoch = entry.epoch;
  if (document.visibilityState === "visible") {
    entry.abort?.abort();
    const ctrl = new AbortController();
    entry.abort = ctrl;
    try {
      const view = await getStatus(projectId, ctrl.signal);
      if (entry.epoch === epoch && !ctrl.signal.aborted && view) {
        entry.status = view;
        entry.listeners.forEach((fn) => fn(view));
      }
    } catch {
      /* transient — keep the last known view */
    } finally {
      if (entry.abort === ctrl) entry.abort = null;
      entry.loaded = true;
    }
  }
  if (entry.epoch !== epoch || entry.listeners.size === 0) return;
  entry.timer = setTimeout(() => void poll(projectId, entry), isActive(entry.status) ? ACTIVE_MS : IDLE_MS);
}

function subscribe(projectId: string, fn: (v: DeploymentView | null) => void): () => void {
  let entry = loops.get(projectId);
  if (!entry) {
    entry = { listeners: new Set(), status: null, loaded: false, timer: null, abort: null, epoch: 0 };
    loops.set(projectId, entry);
  }
  const e = entry;
  e.listeners.add(fn);
  // Hand a late joiner what we already know instead of making it wait a cycle.
  if (e.status) fn(e.status);
  // First subscriber starts the loop; the rest just ride along.
  if (e.listeners.size === 1) void poll(projectId, e);

  return () => {
    e.listeners.delete(fn);
    if (e.listeners.size > 0) return;
    e.epoch += 1;
    if (e.timer) clearTimeout(e.timer);
    e.timer = null;
    e.abort?.abort();
    e.abort = null;
    loops.delete(projectId);
  };
}

/** Force an immediate poll — used right after Start/Stop, which change state now. */
async function refreshNow(projectId: string): Promise<void> {
  const entry = loops.get(projectId);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = null;
  await poll(projectId, entry);
}

export function useHostingStatus(projectId: string, enabled: boolean) {
  const [status, setStatus] = useState<DeploymentView | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = subscribe(projectId, (view) => {
      setStatus(view);
      setLoaded(true);
    });
    // A visible tab that was hidden through a poll should catch up at once.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshNow(projectId);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [projectId, enabled]);

  const refresh = useCallback(async () => {
    if (enabled) await refreshNow(projectId);
  }, [projectId, enabled]);

  return { status, loaded, refresh };
}
