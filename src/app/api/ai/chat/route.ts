import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assistantChat } from "@/lib/ai/claude";
import { assistantChatGemini } from "@/lib/ai/gemini";
import { aiDailyLimit, isAiLimitExempt, providerForPlan } from "@/lib/plan";
import { getUserPlan } from "@/lib/subscription";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  project: z.object({
    name: z.string().max(120),
    platform: z.string().max(20),
    language: z.string().max(20),
  }),
  files: z
    .array(z.object({ path: z.string().max(200), content: z.string().max(20000) }))
    .max(40),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(30),
  preferences: z
    .object({
      language: z.string().max(40).optional(),
      style: z.enum(["concise", "balanced", "detailed"]).optional(),
      persona: z.string().max(400).optional(),
      custom: z.string().max(1000).optional(),
    })
    .optional(),
  intent: z.enum(["chat", "plan"]).optional(),
});

// POST /api/ai/chat — the in-workspace coding assistant.
// Provider is chosen by the user's plan: free → Gemini, paid → Claude.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const plan = await getUserPlan(supabase, user);
  const provider = providerForPlan(plan);

  // Guard: the chosen provider must be configured.
  if (provider === "claude" && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "The Pro assistant (Claude) isn't configured yet (missing ANTHROPIC_API_KEY)." },
      { status: 503 },
    );
  }
  if (provider === "gemini" && !process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "The free assistant (Gemini) isn't configured yet (missing GEMINI_API_KEY)." },
      { status: 503 },
    );
  }

  // Daily per-user message cap — atomic check-and-increment in Postgres
  // (supabase/ai_usage.sql). Fails open if the migration hasn't run yet,
  // so a missing table never takes the assistant down.
  const limit = aiDailyLimit(plan);
  let used: number | null = null;
  if (!isAiLimitExempt(user.email)) {
    const { data: count, error: usageError } = await supabase.rpc("increment_ai_usage", {
      p_limit: limit,
    });
    if (usageError) {
      console.warn("[ai/chat] usage counter unavailable, skipping rate limit:", usageError.message);
    } else if (count === -1) {
      const hint =
        plan === "pro"
          ? "It resets at midnight UTC."
          : "It resets at midnight UTC — or upgrade your plan for a higher limit.";
      return NextResponse.json(
        {
          error: `Daily assistant limit reached (${limit} messages/day on the ${plan} plan). ${hint}`,
          usage: { used: limit, limit },
        },
        { status: 429 },
      );
    } else if (typeof count === "number") {
      used = count;
    }
  }

  try {
    const result =
      provider === "claude"
        ? await assistantChat(parsed.data)
        : await assistantChatGemini(parsed.data);
    return NextResponse.json({
      ...result,
      provider,
      ...(used !== null ? { usage: { used, limit } } : {}),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "The assistant failed." }, { status: 500 });
  }
}
