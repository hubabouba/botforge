"use client";

import { useEffect, useState } from "react";
import { planAllows, type Capability, type Plan } from "@/lib/plan";

interface PlanInfo {
  plan: Plan;
  /** Whether this account's plan unlocks bot hosting (real `hosting.run` check). */
  hostingAvailable: boolean;
  /** Whether every annual Stripe price is configured — drives the billing toggle. */
  annualBilling: boolean;
}

const FREE: PlanInfo = { plan: "free", hostingAvailable: false, annualBilling: false };

// Module-level cache so many components share one /api/plan fetch per page load.
let cache: PlanInfo | null = null;
let inflight: Promise<PlanInfo> | null = null;

async function fetchPlan(): Promise<PlanInfo> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/api/plan")
      .then((r) => (r.ok ? r.json() : FREE))
      .then(
        (d) =>
          (cache = {
            plan: (d.plan as Plan) ?? "free",
            hostingAvailable: Boolean(d.hostingAvailable),
            annualBilling: Boolean(d.annualBilling),
          }),
      )
      .catch(() => (cache = FREE));
  }
  return inflight;
}

/** The signed-in user's plan plus capability + hosting-availability flags. Server routes re-check. */
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
    hostingAvailable: info.hostingAvailable,
    annualBilling: info.annualBilling,
    loading,
    allows: (cap: Capability) => planAllows(info.plan, cap),
  };
}
