import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { flyConfig, type FlyConfig } from "@/lib/hosting/fly";
import { getActiveDeployments, reconcileWithFly } from "@/lib/hosting/deployments";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Constant-time check of the scheduler's bearer token against CRON_SECRET.
 * The caller is a machine (GitHub Actions), not a browser — no session, no RLS.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const presented = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
  const expected = Buffer.from(secret);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

// POST /api/internal/hosting/reconcile — sweep EVERY active deployment through
// the same reconcile used by the status poll: heal drift (machine died, exit
// callback never arrived), accrue runtime into hosting_usage, and auto-stop
// runs that exhausted their monthly budget. This is what covers bots nobody is
// watching — the lazy per-poll reconcile only ever sees projects whose owner
// has the panel open. Deliberately NOT gated on HOSTING_ENABLED: if the kill
// switch goes dark while machines are still up, the sweep is exactly what must
// keep running.
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let cfg: FlyConfig;
  try {
    cfg = flyConfig();
  } catch {
    return NextResponse.json({ error: "Fly hosting is not configured." }, { status: 503 });
  }

  const admin = createAdminClient();
  const deployments = await getActiveDeployments(admin);

  const transitions: Record<string, number> = {};
  let failures = 0;
  for (const dep of deployments) {
    try {
      const next = await reconcileWithFly(admin, cfg, dep);
      if (next !== dep.status) {
        const key = `${dep.status}->${next}`;
        transitions[key] = (transitions[key] ?? 0) + 1;
      }
    } catch {
      failures += 1; // one bad row must not abort the whole sweep
    }
  }

  return NextResponse.json(
    { ok: true, checked: deployments.length, transitions, failures },
    { headers: { "Cache-Control": "no-store" } },
  );
}
