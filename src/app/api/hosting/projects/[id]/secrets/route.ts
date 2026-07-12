import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserPlan } from "@/lib/subscription";
import { effectiveHostingPlan } from "@/lib/plan";
import { hostingAccessAllowed } from "@/lib/hosting/config";
import { encryptSecret } from "@/lib/hosting/secrets";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// Secret key names: uppercase env-var style, so bots read them from the environment.
const keyName = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/, "Use an UPPER_SNAKE_CASE env name.");
const postSchema = z.object({ key: keyName, value: z.string().min(1).max(4096) });

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// POST — set (or replace) a secret. Encrypted here before it ever touches the DB.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const plan = effectiveHostingPlan(await getUserPlan(supabase, user.id, user.email), user.email);
  if (!hostingAccessAllowed(plan)) {
    return NextResponse.json({ error: "Bot hosting isn't available on your account yet." }, { status: 403 });
  }

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid secret." }, { status: 400 });

  let enc;
  try {
    enc = encryptSecret(parsed.data.value);
  } catch {
    return NextResponse.json({ error: "Secret storage isn't configured." }, { status: 503 });
  }

  const { data: ok, error } = await supabase.rpc("set_project_secret", {
    p_project_id: id,
    p_key_name: parsed.data.key,
    p_ciphertext: enc.ciphertext,
    p_nonce: enc.nonce,
    p_key_version: enc.keyVersion,
  });
  if (error || ok !== true) return NextResponse.json({ error: "Couldn't save the secret." }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// GET — list which secrets are set (names + dates only, never values).
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const plan = effectiveHostingPlan(await getUserPlan(supabase, user.id, user.email), user.email);
  if (!hostingAccessAllowed(plan)) {
    return NextResponse.json({ error: "Bot hosting isn't available on your account yet." }, { status: 403 });
  }

  const { data } = await supabase.rpc("list_project_secret_names", { p_project_id: id });
  const secrets = ((data as { key_name: string; updated_at: string }[] | null) ?? []).map((r) => ({
    key: r.key_name,
    updatedAt: new Date(r.updated_at).getTime(),
  }));
  return NextResponse.json({ secrets });
}

// DELETE ?key=NAME — remove a secret.
export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const plan = effectiveHostingPlan(await getUserPlan(supabase, user.id, user.email), user.email);
  if (!hostingAccessAllowed(plan)) {
    return NextResponse.json({ error: "Bot hosting isn't available on your account yet." }, { status: 403 });
  }

  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!keyName.safeParse(key).success) return NextResponse.json({ error: "Invalid key." }, { status: 400 });

  const { error } = await supabase.rpc("delete_project_secret", { p_project_id: id, p_key_name: key });
  if (error) return NextResponse.json({ error: "Couldn't delete the secret." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
