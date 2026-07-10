import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hostingAccessAllowed } from "@/lib/hosting/config";
import { flyConfig, destroyMachine } from "@/lib/hosting/fly";
import { setStopped, appendLogs } from "@/lib/hosting/deployments";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/hosting/projects/[id]/stop — stop the project's running bot.
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hostingAccessAllowed(user.email)) {
    return NextResponse.json({ error: "Bot hosting isn't available on your account yet." }, { status: 403 });
  }

  // RLS read: only the owner sees their deployment row.
  const { data: dep } = await supabase
    .from("project_deployments")
    .select("provider_machine_id, status")
    .eq("project_id", id)
    .maybeSingle();
  if (!dep) return NextResponse.json({ ok: true, status: "stopped" });

  const admin = createAdminClient();
  const machineId = (dep as { provider_machine_id: string | null }).provider_machine_id;
  if (machineId) {
    try {
      await destroyMachine(flyConfig(), machineId);
    } catch {
      /* best effort — reconcile will catch a straggler */
    }
  }
  await setStopped(admin, id, "stopped");
  await appendLogs(admin, id, [{ stream: "system", line: "Bot stopped." }]);
  return NextResponse.json({ ok: true, status: "stopped" });
}
