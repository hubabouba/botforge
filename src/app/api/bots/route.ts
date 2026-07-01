import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";
import { platformSchema } from "@/lib/schema/types";
import { z } from "zod";

export const runtime = "nodejs";

// GET /api/bots — list all bots (newest first).
export async function GET() {
  const bots = await prisma.bot.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, platform: true, status: true, updatedAt: true },
  });
  return NextResponse.json(bots);
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
  platform: platformSchema,
});

// POST /api/bots — create a new bot with an empty graph.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const bot = await prisma.bot.create({
    data: { name: parsed.data.name, platform: parsed.data.platform },
    select: { id: true, name: true, platform: true, status: true },
  });
  return NextResponse.json(bot, { status: 201 });
}
