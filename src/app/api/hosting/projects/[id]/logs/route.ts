import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPlan } from "@/lib/subscription";
import { effectiveHostingPlan } from "@/lib/plan";
import { hostingAccessAllowed } from "@/lib/hosting/config";
import type { LogLine } from "@/lib/hosting/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/hosting/projects/[id]/logs?after=<id> — log lines newer than a cursor.
// Polled by the Logs panel. RLS ensures a user only reads their own project's logs.
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const plan = effectiveHostingPlan(await getUserPlan(supabase, user.id, user.email), user.email);
  if (!hostingAccessAllowed(plan)) {
    return NextResponse.json({ error: "Bot hosting isn't available on your account yet." }, { status: 403 });
  }

  const after = Number(new URL(req.url).searchParams.get("after") ?? 0) || 0;

  const { data, error } = await supabase
    .from("project_logs")
    .select("id, stream, line, created_at")
    .eq("project_id", id)
    .gt("id", after)
    .order("id", { ascending: true })
    .limit(500);
  if (error) return NextResponse.json({ error: "Couldn't load logs." }, { status: 500 });

  const lines: LogLine[] = (data ?? []).map((r) => ({
    id: r.id as number,
    stream: r.stream as LogLine["stream"],
    line: r.line as string,
    at: new Date(r.created_at as string).getTime(),
  }));
  return NextResponse.json({ lines }, { headers: { "Cache-Control": "no-store" } });
}
