import { NextResponse } from "next/server";
import { generateGraph } from "@/lib/ai/claude";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({ description: z.string().min(3).max(2000) });

// POST /api/ai/generate — turn a text description into a bot graph.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Describe the bot in a few words." }, { status: 400 });
  }
  try {
    const graph = await generateGraph(parsed.data.description);
    return NextResponse.json({ graph });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
