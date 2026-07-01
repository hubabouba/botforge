import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";
import { encryptToken } from "@/lib/crypto";
import { z } from "zod";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({ token: z.string().min(10).max(200) });

// POST /api/bots/:id/token — store an encrypted bot token.
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Token looks invalid." }, { status: 400 });
  }
  try {
    const tokenEnc = encryptToken(parsed.data.token.trim());
    await prisma.bot.update({ where: { id }, data: { tokenEnc } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
