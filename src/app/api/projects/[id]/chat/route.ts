import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Newest N turns. Enough to reopen a conversation without re-reading a novel. */
const HISTORY_LIMIT = 60;

const appendSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(20000),
        edits: z
          .array(z.object({ path: z.string().max(200), content: z.string().max(20000) }))
          .max(20)
          .optional(),
      }),
    )
    .min(1)
    .max(4),
});

// GET /api/projects/[id]/chat — the saved conversation, oldest first.
// RLS scopes every query below to the caller's own projects.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data, error } = await supabase
    .from("project_messages")
    .select("id, role, content, edits")
    .eq("project_id", id)
    .order("id", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) return NextResponse.json({ error: "Couldn't load the conversation." }, { status: 500 });

  return NextResponse.json(
    { messages: (data ?? []).reverse() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// POST /api/projects/[id]/chat — append turns (the user's, then the reply).
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const parsed = appendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { error } = await supabase.from("project_messages").insert(
    parsed.data.messages.map((m) => ({
      project_id: id,
      role: m.role,
      content: m.content,
      edits: m.edits ?? null,
    })),
  );
  // RLS rejects a project the caller doesn't own, which lands here as an error.
  if (error) return NextResponse.json({ error: "Couldn't save the message." }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/projects/[id]/chat — clear the conversation.
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { error } = await supabase.from("project_messages").delete().eq("project_id", id);
  if (error) return NextResponse.json({ error: "Couldn't clear the conversation." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
