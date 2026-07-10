"use client";

import { useEffect, useState } from "react";
import { planAllows, type Capability, type Plan } from "@/lib/plan";

interface PlanInfo {
  plan: Plan;
  /** Whether this account is in the bot-hosting private beta (Stage 1 gate). */
  hostingBeta: boolean;
}

const FREE: PlanInfo = { plan: "free", hostingBeta: false };

// Module-level cache so many components share one /api/plan fetch per page load.
let cache: PlanInfo | null = null;
let inflight: Promise<PlanInfo> | null = null;

async function fetchPlan(): Promise<PlanInfo> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/api/plan")
      .then((r) => (r.ok ? r.json() : FREE))
      .then((d) => (cache = { plan: (d.plan as Plan) ?? "free", hostingBeta: Boolean(d.hostingBeta) }))
      .catch(() => (cache = FREE));
  }
  return inflight;
}

/** The signed-in user's plan plus capability + hosting-beta flags. Server routes re-check. */
export function usePlan() {
  const [info, setInfo] = useState<PlanInfo>(cache ?? FREE);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    let alive = true;
    fetchPlan().then((p) => {
      if (!alive) return;
      setInfo(p);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  return {
    plan: info.plan,
    hostingBeta: info.hostingBeta,
    loading,
    allows: (cap: Capability) => planAllows(info.plan, cap),
  };
}
