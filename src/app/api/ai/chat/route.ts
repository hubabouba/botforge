import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assistantChatStream } from "@/lib/ai/claude";
import { assistantChatGeminiStream } from "@/lib/ai/gemini";
import { buildRuntimeContext } from "@/lib/ai/runtimeContext";
import type { AssistantSpend, AssistantStreamEvent } from "@/lib/ai/types";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  aiDailyLimit,
  aiMonthlyLimit,
  aiMonthlyUsdCap,
  isAiLimitExempt,
  maxToolTurnsFor,
  modelForTier,
  planAllows,
  providerForTier,
  reasoningFor,
  resolveTier,
} from "@/lib/plan";
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
    entry: z.string().max(200).optional(),
  }),
  /**
   * The project's files, sent from the client rather than read here, because
   * the client's copy includes edits autosave hasn't flushed yet — asking the
   * assistant about code you just typed has to work.
   *
   * The old caps were 40 files of 20k chars, and they were not chosen against
   * anything real: a project may hold 200 files (the DB trigger's limit) of
   * 500k chars (the file route's limit). A project that outgrew 40 files got
   * a bare "Invalid request." from the assistant on every message, forever,
   * with nothing saying why — found live, on a real 56-file project.
   *
   * So the count now matches the DB's actual ceiling, per-file content is
   * generous (100k ≈ 2500 lines), and the binding constraint is the one that
   * genuinely matters: total bytes, kept clear of the platform's request-body
   * limit. Only ~6k tokens of this ever reaches the prompt (buildFileContext
   * truncates); the rest exists so read_file and edit_file can work on whole,
   * current files.
   */
  files: z
    .array(z.object({ path: z.string().max(200), content: z.string().max(100_000) }))
    .max(200)
    .refine(
      (fs) => fs.reduce((n, f) => n + f.content.length, 0) <= 2_000_000,
      "project too large to send",
    ),
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
  intent: z.enum(["chat", "plan", "review"]).optional(),
  // The Planning panel's output, carried so the assistant can act on "the plan".
  plan: z.string().max(20000).optional(),
  // Which project's hosted-bot state to look up (RLS scopes it to the caller);
  // `attach` is the user's opt-in — a crashed bot attaches its logs regardless.
  projectId: z.string().uuid().optional(),
  attach: z.object({ logs: z.boolean().optional(), metrics: z.boolean().optional() }).optional(),
  // The tier the user picked in the workspace. Only honored if their plan
  // allows it (resolveTier) — the client can't unlock a paid tier.
  tier: z.enum(["standard", "advanced", "max"]).optional(),
  // This message is one step of an automatic plan run — swaps open_plan for
  // finish_step so the assistant reports the step's outcome itself.
  stepMode: z.boolean().optional(),
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

/**
 * Keep what a request cost. Deliberately swallowing every failure: a reply the
 * user is reading must never be disturbed by bookkeeping, and a missing row
 * costs us one data point out of thousands. Written with the admin client
 * because record_ai_spend is service-role only — cost figures a browser could
 * forge would poison the very numbers pricing gets decided from.
 */
async function recordSpend(userId: string, s: AssistantSpend): Promise<void> {
  try {
    const { error } = await createAdminClient().rpc("record_ai_spend", {
      p_user_id: userId,
      p_model: s.model,
      p_input: s.inputTokens,
      p_output: s.outputTokens,
      p_cache_write: s.cacheWriteTokens,
      p_cache_read: s.cacheReadTokens,
      p_usd: s.usd,
    });
    // rpc() resolves with an error rather than throwing it, so the catch below
    // never sees a rejected RPC. Reporting it is the difference between a
    // pricing table built on measurements and one built on an empty table
    // nobody noticed was empty.
    if (error) Sentry.captureMessage(`record_ai_spend failed: ${error.message}`, "warning");
  } catch (e) {
    Sentry.captureException(e, { extra: { where: "recordSpend" } });
  }
}

/**
 * Has this account already cost us more this month than its plan allows?
 *
 * Reads the spend we recorded ourselves (ai_spend, one row per user per day)
 * with the admin client, because that table is service-role only — a browser
 * must never be able to read, let alone forge, our costs.
 *
 * Two honest imprecisions, both deliberate. It's a plain read, not an atomic
 * claim, so two requests sent at the same instant can both pass; and spend is
 * recorded after a request finishes, so the last message may push the total
 * past the ceiling. Overshooting by one message is the correct trade for a
 * circuit-breaker — the alternative is a lock on the hot path of every message
 * to protect against a case that costs pennies.
 *
 * Fails OPEN, like every other counter here: a query that can't run must not
 * take the assistant down. But an unenforced spend ceiling is exactly the state
 * this exists to prevent, so ops hears about every occurrence.
 */
async function overMonthlyUsdCap(userId: string, cap: number): Promise<{ over: boolean; spent: number }> {
  const monthStart = new Date().toISOString().slice(0, 8) + "01";
  try {
    const { data, error } = await createAdminClient()
      .from("ai_spend")
      .select("usd")
      .eq("user_id", userId)
      .gte("day", monthStart);
    if (error) throw error;
    const spent = (data ?? []).reduce((sum, r) => sum + Number((r as { usd: number }).usd ?? 0), 0);
    return { over: spent >= cap, spent };
  } catch (e) {
    Sentry.captureMessage("Monthly AI spend ceiling unchecked — request allowed", {
      level: "error",
      extra: { message: (e as Error).message },
    });
    return { over: false, spent: 0 };
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
    // "Invalid request." told the user nothing, and the one way this actually
    // trips in practice is a project that outgrew a limit — at which point the
    // assistant appears simply broken, with no hint that the size is the
    // problem or that deleting a file would fix it. Name the cause; report the
    // rest, because anything else reaching here is a bug on our side.
    const onFiles = parsed.error.issues.some((i) => i.path[0] === "files");
    if (onFiles) {
      return NextResponse.json(
        {
          error:
            "This project is too large for the assistant — it can work with up to 200 files. Delete what you don't need, or split the bot into a second project.",
        },
        { status: 400 },
      );
    }
    Sentry.captureMessage("ai/chat rejected a request body", {
      level: "warning",
      extra: { issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.code}`) },
    });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const plan = await getUserPlan(supabase, user.id, user.email);
  const tier = resolveTier(plan, parsed.data.tier);
  const provider = providerForTier(tier);

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
  const monthlyLimit = aiMonthlyLimit(plan);
  let used: number | null = null;
  if (!isAiLimitExempt(user.email)) {
    const { data: count, error: usageError } = await supabase.rpc("increment_ai_usage", {
      p_limit: limit,
      p_monthly_limit: monthlyLimit,
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
      // -1 covers both caps. Which one it was matters to the person reading it:
      // "come back tomorrow" is useless advice if the month is what ran out.
      const { data: monthUsed } = await supabase
        .from("ai_usage")
        .select("count")
        .gte("day", new Date(new Date().toISOString().slice(0, 8) + "01").toISOString().slice(0, 10));
      const monthTotal = (monthUsed ?? []).reduce((sum, r) => sum + Number(r.count ?? 0), 0);
      const monthlyHit = monthlyLimit >= 0 && monthTotal >= monthlyLimit;

      const upgradeHint = plan === "max" ? "" : " Upgrading raises it.";
      const error = monthlyHit
        ? `Monthly assistant limit reached (${monthlyLimit} messages/month on the ${plan} plan). It resets on the 1st.${upgradeHint}`
        : `Daily assistant limit reached (${limit} messages/day on the ${plan} plan). It resets at midnight UTC.${upgradeHint}`;

      return NextResponse.json(
        { error, usage: { used: limit, limit } },
        { status: 429 },
      );
    } else if (typeof count === "number") {
      used = count;
    }

    // The other ceiling: not how many messages, but what they cost. A count
    // can't bound spend on its own — one person's message is a one-line fix and
    // another's is a review pass over a large project, and those differ by more
    // than an order of magnitude. Checked after the count so the common refusal
    // ("you've used today's messages") still comes first and costs no query.
    const usdCap = aiMonthlyUsdCap(plan);
    const { over, spent } = await overMonthlyUsdCap(user.id, usdCap);
    if (over) {
      // Say what it is without saying what it cost us. "You've used this
      // month's assistant budget" is true and actionable; our margin is not
      // the customer's business.
      Sentry.captureMessage("Account reached its monthly AI spend ceiling", {
        level: "warning",
        extra: { plan, spent: Number(spent.toFixed(4)), cap: usdCap },
      });
      const upgradeHint = plan === "max" ? "" : " Upgrading raises it.";
      return NextResponse.json(
        {
          error:
            `You've used this month's assistant budget on the ${plan} plan. It resets on the 1st.` +
            `${upgradeHint} Larger projects and longer requests use it up faster than short ones.`,
        },
        { status: 429 },
      );
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
      ? assistantChatStream({
          ...parsed.data,
          runtime,
          model: modelForTier(tier),
          reasoning: reasoningFor(plan, tier),
          maxTurns: maxToolTurnsFor(plan),
          clarify: planAllows(plan, "assistant.clarify"),
          budgetMs: LOOP_BUDGET_MS,
          onSpend: (s) => recordSpend(user.id, s),
        })
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
        // enough context to tell a genuine API error apart from the loop simply
        // running out of time. `elapsedMs` is what separates them: the platform
        // cutoff (maxDuration, 300s) kills the invocation outright and this
        // catch never runs, so anything that lands here at all is the call
        // itself failing — and one near LOOP_BUDGET_MS (280s) is the loop's own
        // abort, which is orderly and already explained to the user in-stream.
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
      //
      // Returned, not fire-and-forget. The generator's cleanup is where the
      // request's cost gets written down, and those tokens were generated and
      // billed whether or not anyone stayed to read the answer. Handing the
      // promise back keeps the invocation alive for that one insert; dropping
      // it means the spend table quietly under-reports every abandoned reply.
      return gen.return(undefined).then(() => undefined);
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
