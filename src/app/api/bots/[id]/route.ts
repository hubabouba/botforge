import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";
import { botGraphSchema } from "@/lib/schema/types";
import { isRunning, stopBot, updateGraph } from "@/lib/runtime/runner";
import { z } from "zod";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// GET /api/bots/:id — full bot including graph and whether a token is set.
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const bot = await prisma.bot.findUnique({ where: { id } });
  if (!bot) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { tokenEnc, ...rest } = bot;
  return NextResponse.json({ ...rest, hasToken: !!tokenEnc });
}

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  graph: botGraphSchema.optional(),
});

// PATCH /api/bots/:id — update name and/or graph (autosave from the editor).
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const data: { name?: string; graph?: string } = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.graph !== undefined) {
    data.graph = JSON.stringify(parsed.data.graph);
    // Hot-reload the graph into a running bot, if any.
    if (isRunning(id)) updateGraph(id, parsed.data.graph);
  }

  const bot = await prisma.bot.update({ where: { id }, data, select: { id: true, updatedAt: true } });
  return NextResponse.json(bot);
}

// DELETE /api/bots/:id — stop (if running) and remove.
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  if (isRunning(id)) await stopBot(id);
  await prisma.bot.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
