import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// GET /api/account/export — download everything we hold about the signed-in
// user as one JSON file (GDPR Art. 20, data portability). Uses the RLS client,
// so it can only ever read the caller's own rows — no admin client needed.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Projects with full file contents (this is the portability payload, so unlike
  // the dashboard list we DO want the bodies). Folders included for a faithful copy.
  const { data: projects } = await supabase
    .from("projects")
    .select(
      "id, name, platform, language, description, entry, created_at, updated_at, project_files(path, content), project_folders(path)",
    )
    .order("created_at", { ascending: true });

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan, status, current_period_end, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: hostingUsage } = await supabase
    .from("hosting_usage")
    .select("month, seconds_used, updated_at")
    .eq("user_id", user.id)
    .order("month", { ascending: true });

  const { data: deployments } = await supabase
    .from("project_deployments")
    .select("project_id, status, region, restart_count, last_started_at, last_stopped_at, last_crash_at, updated_at")
    .eq("user_id", user.id);

  // Secret NAMES only — never the encrypted values. list_project_secret_names is
  // self-scoped by auth.uid(), so this stays the caller's own data.
  const secretNames: Record<string, string[]> = {};
  for (const p of (projects as { id: string }[] | null) ?? []) {
    const { data: names } = await supabase.rpc("list_project_secret_names", { p_project_id: p.id });
    const list = ((names as { key_name: string }[] | null) ?? []).map((n) => n.key_name);
    if (list.length) secretNames[p.id] = list;
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    account: { id: user.id, email: user.email ?? null, createdAt: user.created_at ?? null },
    subscription: subscription ?? null,
    projects: projects ?? [],
    // Secret values are intentionally excluded — we store only ciphertext and
    // never expose it; these are the key names your bots use.
    projectSecretNames: secretNames,
    hosting: { usage: hostingUsage ?? [], deployments: deployments ?? [] },
  };

  const filename = `botforge-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
