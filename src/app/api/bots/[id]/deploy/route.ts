import { NextResponse } from "next/server";
import { startBot, stopBot, isRunning } from "@/lib/runtime/runner";
import { z } from "zod";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({ action: z.enum(["start", "stop"]) });

// POST /api/bots/:id/deploy — start or stop the live bot.
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "action must be 'start' or 'stop'" }, { status: 400 });
  }

  try {
    if (parsed.data.action === "start") {
      await startBot(id);
    } else {
      await stopBot(id);
    }
    return NextResponse.json({ ok: true, running: isRunning(id) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, running: isRunning(id) }, { status: 500 });
  }
}
