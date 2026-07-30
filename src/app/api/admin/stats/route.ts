import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";
import { annualPrice, monthlyRevenue, planMeta, type BillingInterval, type Plan } from "@/lib/plan";
import { priceIdForPlan, stripe } from "@/lib/stripe";

export const runtime = "nodejs";

// GET /api/admin/stats — aggregate business stats for the owner's personal
// dashboard (not customer-facing). 404 (not 401/403) for anyone but an admin
// email, signed in or not — a curious visitor should see "page doesn't exist",
// not learn that an admin surface is there to attack.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC) — matches ai_usage.day
  const monthStr = now.toISOString().slice(0, 7); // YYYY-MM (UTC) — matches hosting_usage.month
  const monthStartIso = `${monthStr}-01T00:00:00.000Z`;
  const sevenDaysAgoIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const todayStartIso = `${todayStr}T00:00:00.000Z`;

  // auth.users isn't queryable via SQL from here — the admin API is the only
  // path. Capped at 1000; fine at current scale, but the count would silently
  // stop growing past it (flagged via `truncated`).
  const { data: userPage } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const users = userPage?.users ?? [];
  const totalUsers = users.length;
  const newToday = users.filter((u) => u.created_at >= todayStartIso).length;
  const new7d = users.filter((u) => u.created_at >= sevenDaysAgoIso).length;

  const { data: subsRows } = await admin
    .from("subscriptions")
    .select("user_id, plan, status, current_period_end, billing_interval");
  const planByUser = new Map<string, Plan>();
  // Monthly-equivalent revenue per subscriber. Annual pays 10 months for 12, so
  // counting one at the monthly price inflates every revenue figure by a sixth.
  const revenueByUser = new Map<string, number>();
  let annualSubscribers = 0;
  for (const row of subsRows ?? []) {
    const active = row.status === "active" || row.status === "trialing";
    const notExpired = !row.current_period_end || new Date(row.current_period_end).getTime() > now.getTime();
    if (active && notExpired && (row.plan === "basic" || row.plan === "pro" || row.plan === "max")) {
      planByUser.set(row.user_id, row.plan);
      const interval = row.billing_interval === "year" ? "year" : "month";
      revenueByUser.set(row.user_id, monthlyRevenue(row.plan, interval));
      if (interval === "year") annualSubscribers += 1;
    }
  }
  const planCounts: Record<Plan, number> = { free: 0, basic: 0, pro: 0, max: 0 };
  for (const u of users) {
    const plan = planByUser.get(u.id) ?? "free";
    planCounts[plan]++;
  }
  const mrr = [...revenueByUser.values()].reduce((sum, v) => sum + v, 0);

  const { data: aiRows } = await admin
    .from("ai_usage")
    .select("day, count")
    .gte("day", `${monthStr}-01`);
  let messagesToday = 0;
  let messagesThisMonth = 0;
  for (const row of aiRows ?? []) {
    messagesThisMonth += row.count;
    if (row.day === todayStr) messagesToday += row.count;
  }

  const { data: runningDeployments } = await admin
    .from("project_deployments")
    .select("project_id")
    .in("status", ["starting", "running"]);
  const { data: hostingRows } = await admin
    .from("hosting_usage")
    .select("seconds_used")
    .eq("month", monthStr);
  const secondsThisMonth = (hostingRows ?? []).reduce((sum, r) => sum + (r.seconds_used ?? 0), 0);

  // What the assistant actually cost, measured per call (supabase/ai_spend.sql).
  // The point of this block is the last two numbers: revenue is meaningless
  // without knowing what serving it costs, and every message cap and model
  // choice in plan.ts is currently set from arithmetic rather than data.
  const { data: spendRows } = await admin
    .from("ai_spend")
    .select("user_id, day, model, messages, usd")
    .gte("day", `${monthStr}-01`);
  let aiCostToday = 0;
  let aiCostThisMonth = 0;
  const costByUser = new Map<string, number>();
  const costByModel = new Map<string, { usd: number; messages: number }>();
  for (const row of spendRows ?? []) {
    const usd = Number(row.usd ?? 0);
    aiCostThisMonth += usd;
    if (row.day === todayStr) aiCostToday += usd;
    costByUser.set(row.user_id, (costByUser.get(row.user_id) ?? 0) + usd);
    const m = costByModel.get(row.model) ?? { usd: 0, messages: 0 };
    costByModel.set(row.model, { usd: m.usd + usd, messages: m.messages + Number(row.messages ?? 0) });
  }
  // Cost per message per model is the number that decides whether a tier can
  // carry its price — an average hides the one account that eats a plan's
  // margin, so the worst account this month is reported alongside it.
  const perModel = [...costByModel.entries()]
    .map(([model, m]) => ({
      model,
      messages: m.messages,
      usd: Math.round(m.usd * 100) / 100,
      usdPerMessage: m.messages ? Math.round((m.usd / m.messages) * 10000) / 10000 : 0,
    }))
    .sort((a, b) => b.usd - a.usd);
  // Per-account spend, dearest first. The whole point of collecting this is to
  // see the shape of the distribution: if the top account costs more than its
  // plan brings in, the cap is wrong — and an average would have hidden it.
  // Paired with what that account pays, so the comparison is on one line.
  const messagesByUser = new Map<string, number>();
  for (const row of spendRows ?? []) {
    messagesByUser.set(row.user_id, (messagesByUser.get(row.user_id) ?? 0) + Number(row.messages ?? 0));
  }
  const topAccounts = [...costByUser.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([userId, usd]) => {
      const plan = planByUser.get(userId) ?? "free";
      return {
        email: users.find((u) => u.id === userId)?.email ?? "(unknown)",
        plan,
        messages: messagesByUser.get(userId) ?? 0,
        usd: Math.round(usd * 100) / 100,
        // What they pay us this month against what they cost us. Negative means
        // this account is being subsidised by the others. Uses the real
        // monthly-equivalent — a free account contributes nothing, and an
        // annual one contributes a tenth less than its sticker price.
        marginUsd: Math.round(((revenueByUser.get(userId) ?? 0) - usd) * 100) / 100,
      };
    });

  const { data: projectRows } = await admin.from("projects").select("id, created_at");
  const totalProjects = projectRows?.length ?? 0;
  const projectsToday = (projectRows ?? []).filter((p) => p.created_at >= todayStartIso).length;

  const recentSignups = [...users]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 10)
    .map((u) => ({
      email: u.email ?? "(no email)",
      createdAt: u.created_at,
      plan: planByUser.get(u.id) ?? "free",
    }));

  const priceCheck = await checkStripePrices();

  return NextResponse.json({
    users: { total: totalUsers, newToday, new7d, truncated: totalUsers >= 1000, recent: recentSignups },
    priceCheck,
    plans: planCounts,
    // Monthly-equivalent, so annual and monthly subscribers are comparable.
    mrr: Math.round(mrr * 100) / 100,
    annualSubscribers,
    ai: {
      messagesToday,
      messagesThisMonth,
      costToday: Math.round(aiCostToday * 100) / 100,
      costThisMonth: Math.round(aiCostThisMonth * 100) / 100,
      // MRR minus what the assistant cost this month. Hosting isn't in here —
      // it's a couple of dollars a machine and bounded by the plan's concurrency
      // cap, whereas this line is the one that can go negative.
      grossThisMonth: Math.round((mrr - aiCostThisMonth) * 100) / 100,
      perModel,
      topAccounts,
    },
    hosting: { runningNow: runningDeployments?.length ?? 0, minutesThisMonth: Math.round(secondsThisMonth / 60) },
    projects: { total: totalProjects, newToday: projectsToday },
    generatedAt: now.toISOString(),
  });
}

export interface PriceCheckRow {
  plan: Plan;
  interval: BillingInterval;
  /** What the site tells visitors this costs, in USD. */
  expectedUsd: number;
  /** What Stripe will actually charge, in USD — null if it couldn't be read. */
  actualUsd: number | null;
  currency: string | null;
  /** Stripe's own billing interval, which must match the column it's listed in. */
  actualInterval: string | null;
  ok: boolean;
  problem: string | null;
}

/**
 * Compare every configured Stripe Price against the price the site advertises.
 *
 * These two numbers live in different systems and nothing has ever compared
 * them. `plan.ts` decides what the pricing page says; a human typing into the
 * Stripe Dashboard decides what the card is charged. A typo there — an annual
 * price entered as $99 where the page promises $90, or an annual id pasted into
 * the monthly variable — bills a customer an amount they never agreed to. That
 * is not a bug you find in a log; you find it in a chargeback.
 *
 * Six reads on an owner-only page, and it turns "I hope I typed it right" into
 * a row that says so. Never throws: a Stripe outage must not take the whole
 * dashboard down over a consistency check.
 */
async function checkStripePrices(): Promise<{ enabled: boolean; rows: PriceCheckRow[] }> {
  if (!stripe) return { enabled: false, rows: [] };

  const rows: PriceCheckRow[] = [];
  for (const plan of ["basic", "pro", "max"] as const) {
    for (const interval of ["month", "year"] as const) {
      const priceId = priceIdForPlan(plan, interval);
      if (!priceId) continue; // not offered — annual is allowed to be absent
      const expectedUsd = interval === "year" ? annualPrice(plan) : planMeta(plan).price;
      try {
        const price = await stripe.prices.retrieve(priceId);
        const actualUsd = price.unit_amount === null ? null : price.unit_amount / 100;
        const actualInterval = price.recurring?.interval ?? null;
        const problems: string[] = [];
        if (actualUsd === null) problems.push("no fixed amount on this price");
        else if (Math.abs(actualUsd - expectedUsd) > 0.005) {
          problems.push(`site says $${expectedUsd}, Stripe charges $${actualUsd}`);
        }
        if (price.currency !== "usd") problems.push(`currency is ${price.currency}, not usd`);
        if (actualInterval !== interval) {
          problems.push(`Stripe bills this ${actualInterval ?? "once"}, not per ${interval}`);
        }
        if (!price.active) problems.push("price is archived in Stripe");
        rows.push({
          plan,
          interval,
          expectedUsd,
          actualUsd,
          currency: price.currency,
          actualInterval,
          ok: problems.length === 0,
          problem: problems.join("; ") || null,
        });
      } catch (e) {
        // An id that doesn't resolve is itself the finding — most likely a
        // price from the other mode (test id in live, or the reverse).
        rows.push({
          plan,
          interval,
          expectedUsd,
          actualUsd: null,
          currency: null,
          actualInterval: null,
          ok: false,
          problem: `couldn't read this price from Stripe: ${(e as Error).message}`,
        });
      }
    }
  }
  return { enabled: true, rows };
}
