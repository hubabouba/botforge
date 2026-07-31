import { NextResponse } from "next/server";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/apiError";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Newest N turns. Enough to reopen a conversation without re-reading a novel. */
const HISTORY_LIMIT = 60;

/**
 * An edit stores the file's FULL content, because that is what the Apply button
 * needs after a reload. So this cap is a cap on the size of the user's own
 * source file, and it was 20k — about 500 lines. A project that grew past that
 * failed this schema, and since the save is deliberately fire-and-forget the
 * failure was invisible in both directions: the whole exchange, including the
 * user's own message, simply never persisted. They reload and the conversation
 * is gone, with nothing having said so.
 *
 * Matched to the file route's own limit (500k) so a file we accepted a write
 * for is a file we can also remember writing. The real bound is the total
 * below — twenty files at the per-file cap would be 10MB in one insert.
 */
const editSchema = z.object({ path: z.string().max(200), content: z.string().max(500_000) });

const appendSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(20000),
        edits: z.array(editSchema).max(40).optional(),
      }),
    )
    .min(1)
    .max(4)
    .refine(
      (ms) =>
        ms.reduce(
          (n, m) => n + m.content.length + (m.edits ?? []).reduce((e, x) => e + x.content.length, 0),
          0,
        ) <= 2_000_000,
      "exchange too large to store",
    ),
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
  if (!parsed.success) {
    // The caller ignores this response on purpose — a failed save must not
    // disturb a reply being read. That makes US the only ones who can notice,
    // and until now nobody did: a rejected save silently dropped the exchange.
    Sentry.captureMessage("Conversation save rejected", {
      level: "warning",
      extra: { issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.code}`) },
    });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { error } = await supabase.from("project_messages").insert(
    parsed.data.messages.map((m) => ({
      project_id: id,
      role: m.role,
      content: m.content,
      edits: m.edits ?? null,
    })),
  );
  // RLS rejects a project the caller doesn't own, which lands here as an error.
  if (error) {
    return dbError(error, "Couldn't save the message.", "chat.append");
  }

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
