"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getStatus } from "@/lib/hosting/client";
import type { DeploymentView } from "@/lib/hosting/types";

/**
 * Polls a project's hosting status while the component is mounted and the tab is
 * visible; pauses when hidden (same spirit as the assistant stream aborting on
 * unmount). `active` runs (starting/running/stopping) poll faster than resting
 * ones. Returns the latest view, a manual refresh, and a first-load flag.
 */
export function useHostingStatus(projectId: string, enabled: boolean) {
  const [status, setStatus] = useState<DeploymentView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abort = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const view = await getStatus(projectId, ctrl.signal);
      if (!ctrl.signal.aborted && view) setStatus(view);
    } catch {
      /* transient — keep last known */
    } finally {
      if (abort.current === ctrl) abort.current = null;
      setLoaded(true);
    }
  }, [projectId, enabled]);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;

    const tick = async () => {
      if (document.visibilityState === "visible") await refresh();
      if (stopped) return;
      const active =
        status?.status === "starting" || status?.status === "running" || status?.status === "stopping";
      timer.current = setTimeout(tick, active ? 2500 : 6000);
    };
    tick();

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      clearTimeout(timer.current);
      abort.current?.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
    // status.status is read inside tick via closure refresh scheduling; re-subscribe
    // when the coarse active/idle cadence should change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, enabled, status?.status]);

  return { status, loaded, refresh };
}
