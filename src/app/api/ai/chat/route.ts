import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assistantChatStream } from "@/lib/ai/claude";
import { assistantChatGeminiStream } from "@/lib/ai/gemini";
import { buildRuntimeContext } from "@/lib/ai/runtimeContext";
import type { AssistantStreamEvent } from "@/lib/ai/types";
import { aiDailyLimit, assistantModelForPlan, isAiLimitExempt, resolveProvider } from "@/lib/plan";
import { getUserPlan } from "@/lib/subscription";

export const runtime = "nodejs";
// The paid assistant is a multi-turn agentic loop; big builds (several files +
// review passes) proved to need well over 60s live — Vercel killed the function
// mid-stream with a bare 504. Fluid compute allows up to 300s on this plan.
export const maxDuration = 300;
// The loop's own wall-clock budget: finish (and flush finished edits) with
// comfortable margin before the platform cutoff above.
const LOOP_BUDGET_MS = 280_000;

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
  // The Planning panel's output, carried so the assistant can act on "the plan".
  plan: z.string().max(20000).optional(),
  // Which project's hosted-bot state to look up (RLS scopes it to the caller);
  // `attach` is the user's opt-in — a crashed bot attaches its logs regardless.
  projectId: z.string().uuid().optional(),
  attach: z.object({ logs: z.boolean().optional(), metrics: z.boolean().optional() }).optional(),
  // The model the user picked in the workspace. Only honored if their plan
  // allows it (resolveProvider) — the client can't unlock Claude.
  provider: z.enum(["gemini", "claude"]).optional(),
});

// POST /api/ai/chat — the in-workspace coding assistant.
// Provider defaults to the plan (free → Gemini, paid → Claude) but a paid user
// may override it via the workspace model selector.
export async function POST(req: Request) {
  try {
    return await handlePost(req);
  } catch (e) {
    // Anything thrown before/outside the stream (e.g. a dependency throwing
    // synchronously) would otherwise surface to the client as a bare 500 with
    // no JSON body — the client's `.json().catch(() => ({}))` then yields `{}`,
    // so `data?.error` is undefined and it silently shows the generic fallback
    // with zero server-side signal. Capture it and answer with real JSON instead.
    Sentry.captureException(e);
    return NextResponse.json({ error: "The assistant failed to start. Please try again." }, { status: 500 });
  }
}

async function handlePost(req: Request) {
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

  const plan = await getUserPlan(supabase, user.id, user.email);
  const provider = resolveProvider(plan, parsed.data.provider);

  // Guard: the chosen provider must be configured.
  if (provider === "claude" && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "The Pro assistant isn't configured yet (missing ANTHROPIC_API_KEY)." },
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
      // Deliberately fail-open (a missing table must not take the assistant
      // down pre-launch) — but unlimited paid model calls is a money path, so
      // ops must hear about every occurrence.
      console.warn("[ai/chat] usage counter unavailable, skipping rate limit:", usageError.message);
      Sentry.captureMessage("AI usage counter unavailable — daily limit not enforced", {
        level: "error",
        extra: { message: usageError.message, plan },
      });
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

  // What the user's bot is doing right now, if it's hosted here. Fails soft:
  // the assistant answering without runtime detail beats not answering at all.
  let runtime = "";
  try {
    runtime = await buildRuntimeContext(
      supabase,
      parsed.data.projectId,
      plan,
      user.email,
      parsed.data.attach ?? {},
    );
  } catch (e) {
    Sentry.captureException(e, { extra: { where: "buildRuntimeContext" } });
  }

  // Stream the reply as newline-delimited JSON events. Metadata that's known
  // up-front (provider, usage) rides in headers so it doesn't pollute the event
  // protocol; a failure that happens *after* the 200 has been committed can't
  // change the status, so it's surfaced as an in-stream `error` event instead.
  const gen: AsyncGenerator<AssistantStreamEvent> =
    provider === "claude"
      ? assistantChatStream({ ...parsed.data, runtime, model: assistantModelForPlan(plan), budgetMs: LOOP_BUDGET_MS })
      : assistantChatGeminiStream({ ...parsed.data, runtime });

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
      // Commit the 200 right away and keep the connection warm: the agentic
      // loop's thinking/tool-writing phases emit no text for long stretches,
      // and a silent stream is what proxies and browsers cut. The client's
      // event loop ignores unknown types, so pings are invisible to the UI.
      const startedAt = Date.now();
      write({ type: "ping" });
      const heartbeat = setInterval(() => write({ type: "ping" }), 15_000);
      try {
        for await (const event of gen) write(event);
      } catch (e) {
        // This is the ONLY place a failed model call ends up — capture it with
        // enough context to tell a genuine API error apart from the function
        // simply running out of time (Vercel's hard 60s maxDuration kills the
        // whole invocation before this catch would even run, so a long elapsed
        // value alongside a completed catch here still points at the model call
        // itself, not the platform timeout).
        Sentry.captureException(e, { extra: { provider, plan, elapsedMs: Date.now() - startedAt } });
        write({ type: "error", message: (e as Error).message || "The assistant failed." });
      } finally {
        clearInterval(heartbeat);
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
