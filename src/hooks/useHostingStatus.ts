"use client";

import { useCallback, useEffect, useState } from "react";
import { getStatus } from "@/lib/hosting/client";
import { playFailure, playSuccess, tabUnattended } from "@/lib/sound";
import type { DeploymentStatus, DeploymentView } from "@/lib/hosting/types";

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
 * The loop polls faster while the run is active and stops entirely once the
 * last subscriber unmounts. A hidden tab is normally not polled at all — but
 * see PENDING below for the one case that has to be, and why.
 */

const ACTIVE_MS = 2500;
const IDLE_MS = 6000;
/**
 * Cadence for a hidden tab awaiting an outcome. Slower than ACTIVE_MS because
 * every poll costs a Fly API call and nobody is reading the result yet — this
 * exists to learn the verdict, not to animate anything.
 */
const HIDDEN_PENDING_MS = 8000;

/**
 * The states where an outcome is still coming, and the only ones worth polling
 * a hidden tab for.
 *
 * Starting a bot takes tens of seconds, which is long enough that people switch
 * away — and skipping hidden polls entirely (which is what this loop used to
 * do) means we never observe the transition at all while they're gone. Then the
 * whole point of announcing the result is lost: they'd hear about it when they
 * came back and looked, which is exactly when they don't need to be told.
 *
 * Bounded on both sides: only these two states, and only while someone is
 * subscribed. A `running` or `stopped` bot in a hidden tab is polled zero times,
 * same as before.
 */
const PENDING: ReadonlySet<DeploymentStatus> = new Set<DeploymentStatus>(["starting", "stopping"]);

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

/**
 * How a start attempt ended, from the pair of statuses either side of a poll —
 * or null when nothing worth announcing happened.
 *
 * A transition, never a reading of the current state: without the `prev` half,
 * a subscriber joining while the bot is already running, or any poll of a
 * healthy one, would announce itself. `stopping → stopped` is deliberately
 * silent — the user asked for that and knows what they asked for.
 *
 * Pure and exported so the rule can be tested; playing the sound is the
 * caller's job.
 */
export function startOutcome(
  prev: DeploymentStatus | null,
  next: DeploymentStatus,
): "success" | "failure" | null {
  if (prev !== "starting" || next === "starting") return null;
  // Anything other than `running` on the way out of `starting` is a failed
  // start: it crashed, it looped, or it fell back to stopped without ever
  // reaching running.
  return next === "running" ? "success" : "failure";
}

/** Announce the end of a start attempt, but only to someone who isn't watching. */
function announce(prev: DeploymentStatus | null, next: DeploymentStatus): void {
  const outcome = startOutcome(prev, next);
  if (!outcome) return;
  if (!tabUnattended()) return; // they're looking right at it
  if (outcome === "success") playSuccess();
  else playFailure();
}

async function poll(projectId: string, entry: Entry): Promise<void> {
  const epoch = entry.epoch;
  // Take ownership of the schedule before awaiting anything. Without this, a
  // manual refresh (pressing Start) that lands while a scheduled poll is in
  // flight leaves both of them alive, and each schedules its own next tick —
  // one orphaned timer per Start, permanently doubling the request rate the
  // shared loop exists to prevent.
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = null;
  // A hidden tab is skipped unless it's waiting on a verdict — see PENDING.
  const pending = entry.status ? PENDING.has(entry.status.status) : false;
  if (document.visibilityState === "visible" || pending) {
    entry.abort?.abort();
    const ctrl = new AbortController();
    entry.abort = ctrl;
    try {
      const view = await getStatus(projectId, ctrl.signal);
      if (entry.epoch === epoch && !ctrl.signal.aborted && view) {
        const prev = entry.status?.status ?? null;
        entry.status = view;
        entry.listeners.forEach((fn) => fn(view));
        // After the listeners: a sound is a side effect of the change, and the
        // components should already hold the new state when it plays.
        announce(prev, view.status);
      }
    } catch {
      /* transient — keep the last known view */
    } finally {
      if (entry.abort === ctrl) entry.abort = null;
      entry.loaded = true;
    }
  }
  if (entry.epoch !== epoch || entry.listeners.size === 0) return;
  // Whichever of two overlapping polls finishes first owns the next tick; the
  // other must not add a second one.
  if (entry.timer) return;
  const hidden = document.visibilityState !== "visible";
  const delay = hidden ? HIDDEN_PENDING_MS : isActive(entry.status) ? ACTIVE_MS : IDLE_MS;
  entry.timer = setTimeout(() => void poll(projectId, entry), delay);
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
  await poll(projectId, entry); // poll() clears the pending tick itself
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
