import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hostingAccessAllowed } from "@/lib/hosting/config";
import { flyConfig, type FlyConfig } from "@/lib/hosting/fly";
import { getDeployment, reconcileWithFly } from "@/lib/hosting/deployments";
import type { DeploymentStatus, DeploymentView } from "@/lib/hosting/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const requiredSecretFor = (platform: string) => (platform === "discord" ? "DISCORD_TOKEN" : "TELEGRAM_TOKEN");

// GET /api/hosting/projects/[id]/status — current run state + secret names + usage.
// Polled by the Logs panel; does a cheap live Fly reconcile while active.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hostingAccessAllowed(user.email)) {
    return NextResponse.json({ error: "Bot hosting isn't available on your account yet." }, { status: 403 });
  }

  // Light ownership check (RLS) + platform for the required-secret name.
  const { data: project } = await supabase.from("projects").select("platform").eq("id", id).maybeSingle();
  if (!project) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const required = requiredSecretFor((project as { platform: string }).platform);

  // Secret names (never values) via the self-scoped RPC.
  const { data: secretRows } = await supabase.rpc("list_project_secret_names", { p_project_id: id });
  const secretNames = ((secretRows as { key_name: string }[] | null) ?? []).map((r) => r.key_name);

  const admin = createAdminClient();
  let dep = await getDeployment(admin, id);
  let status: DeploymentStatus = dep?.status ?? "stopped";

  if (dep) {
    let cfg: FlyConfig | null = null;
    try {
      cfg = flyConfig();
    } catch {
      cfg = null; // hosting not fully configured — skip reconcile, report stored status
    }
    if (cfg) {
      status = await reconcileWithFly(admin, cfg, dep);
      if (status !== dep.status) dep = { ...dep, status };
    }
  }

  const view: DeploymentView = {
    status,
    startedAt: dep?.last_started_at ? new Date(dep.last_started_at).getTime() : null,
    restartCount: dep?.restart_count ?? 0,
    usage: null, // beta runtime is unmetered; Stage 2 fills this from hosting_usage
    secretNames,
    requiredSecret: required,
  };
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}
