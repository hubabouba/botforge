"use client";

import { useEffect, useState } from "react";
import { planAllows, type Capability, type Plan } from "@/lib/plan";

// Module-level cache so many components share one /api/plan fetch per page load.
let cache: Plan | null = null;
let inflight: Promise<Plan> | null = null;

async function fetchPlan(): Promise<Plan> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/api/plan")
      .then((r) => (r.ok ? r.json() : { plan: "free" }))
      .then((d) => (cache = (d.plan as Plan) ?? "free"))
      .catch(() => (cache = "free"));
  }
  return inflight;
}

/** The signed-in user's plan plus a capability check. Server routes re-check. */
export function usePlan() {
  const [plan, setPlan] = useState<Plan>(cache ?? "free");
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    let alive = true;
    fetchPlan().then((p) => {
      if (!alive) return;
      setPlan(p);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  return { plan, loading, allows: (cap: Capability) => planAllows(plan, cap) };
}
