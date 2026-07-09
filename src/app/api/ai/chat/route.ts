import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assistantChatStream } from "@/lib/ai/claude";
import { assistantChatGeminiStream } from "@/lib/ai/gemini";
import type { AssistantStreamEvent } from "@/lib/ai/types";
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

  // Stream the reply as newline-delimited JSON events. Metadata that's known
  // up-front (provider, usage) rides in headers so it doesn't pollute the event
  // protocol; a failure that happens *after* the 200 has been committed can't
  // change the status, so it's surfaced as an in-stream `error` event instead.
  const gen: AsyncGenerator<AssistantStreamEvent> =
    provider === "claude" ? assistantChatStream(parsed.data) : assistantChatGeminiStream(parsed.data);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // After the client disconnects, enqueue()/close() throw — swallow instead
      // of surfacing a spurious error for every closed tab.
      const write = (event: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          /* stream cancelled */
        }
      };
      try {
        for await (const event of gen) write(event);
      } catch (e) {
        write({ type: "error", message: (e as Error).message || "The assistant failed." });
      } finally {
        try {
          controller.close();
        } catch {
          /* stream cancelled */
        }
      }
    },
    cancel() {
      // Client disconnected (navigated away / aborted) — stop the generator,
      // which aborts the upstream model request in its own cleanup.
      void gen.return(undefined);
    },
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    "X-Assistant-Provider": provider,
  };
  if (used !== null) {
    headers["X-Assistant-Usage-Used"] = String(used);
    headers["X-Assistant-Usage-Limit"] = String(limit);
  }
  return new Response(stream, { headers });
}
