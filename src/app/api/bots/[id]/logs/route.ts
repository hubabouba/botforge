import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";
import { isRunning } from "@/lib/runtime/runner";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// GET /api/bots/:id/logs — recent runtime logs + live status.
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const logs = await prisma.botLog.findMany({
    where: { botId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ running: isRunning(id), logs });
}
