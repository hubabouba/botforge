import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";
import { planMeta, type Plan } from "@/lib/plan";

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
    .select("user_id, plan, status, current_period_end");
  const planByUser = new Map<string, Plan>();
  for (const row of subsRows ?? []) {
    const active = row.status === "active" || row.status === "trialing";
    const notExpired = !row.current_period_end || new Date(row.current_period_end).getTime() > now.getTime();
    if (active && notExpired && (row.plan === "basic" || row.plan === "pro" || row.plan === "max")) {
      planByUser.set(row.user_id, row.plan);
    }
  }
  const planCounts: Record<Plan, number> = { free: 0, basic: 0, pro: 0, max: 0 };
  for (const u of users) {
    const plan = planByUser.get(u.id) ?? "free";
    planCounts[plan]++;
  }
  const mrr = (["basic", "pro", "max"] as const).reduce((sum, p) => sum + planCounts[p] * planMeta(p).price, 0);

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
  const topSpender = [...costByUser.entries()].sort((a, b) => b[1] - a[1])[0];

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

  return NextResponse.json({
    users: { total: totalUsers, newToday, new7d, truncated: totalUsers >= 1000, recent: recentSignups },
    plans: planCounts,
    mrr,
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
      topSpenderUsd: topSpender ? Math.round(topSpender[1] * 100) / 100 : 0,
      topSpenderEmail: topSpender
        ? (users.find((u) => u.id === topSpender[0])?.email ?? "(unknown)")
        : null,
    },
    hosting: { runningNow: runningDeployments?.length ?? 0, minutesThisMonth: Math.round(secondsThisMonth / 60) },
    projects: { total: totalProjects, newToday: projectsToday },
    generatedAt: now.toISOString(),
  });
}
