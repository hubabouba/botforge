"use client";

import { useEffect, useRef, useState } from "react";
import type { Project, ProjectFile } from "@/lib/workspace/types";
import { Bot, Check, FileIcon, Close, Lock, ChevronRight } from "@/components/icons";
import { loadPrefs, DEFAULT_PREFERENCES, type AssistantPreferences } from "@/lib/workspace/assistantPrefs";
import { readAssistantStream } from "@/lib/ai/streamClient";
import { appendChat, clearChat, loadChat } from "@/lib/workspace/store";
import { track } from "@/lib/analytics";
import { usePlan } from "@/hooks/usePlan";
import { UpgradeModal } from "@/components/upgrade/UpgradeModal";
import { planMeta, tiersForPlan, defaultTierForPlan, type AssistantTier } from "@/lib/plan";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { plural } from "@/lib/i18n/plural";
import { cn } from "@/lib/utils";

interface Edit {
  path: string;
  content: string;
  applied?: boolean;
}
interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Reasoning summary, streamed before the answer. Empty on tiers without it. */
  thinking?: string;
  edits?: Edit[];
  error?: boolean;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const SUGGESTION_KEYS = ["chat.suggestion1", "chat.suggestion2", "chat.suggestion3"];
// White-labelled tier names — users see the tier, not the underlying provider
// (lets us swap the engine later without changing the product's language).
const TIER_LABEL: Record<AssistantTier, string> = {
  standard: "Standard",
  advanced: "Advanced",
  max: "Max",
};
const TIERS: AssistantTier[] = ["standard", "advanced", "max"];
const TIER_META: Record<AssistantTier, { dot: string; descKey: string }> = {
  standard: { dot: "bg-emerald-400", descKey: "chat.modelStandardDesc" },
  advanced: { dot: "bg-accent", descKey: "chat.modelAdvancedDesc" },
  max: { dot: "bg-amber-400", descKey: "chat.modelMaxDesc" },
};
const MODEL_KEY = "bf:assistant-model";
const AUTO_APPLY_KEY = "bf:auto-apply";

export function WorkspaceChat({
  project,
  files,
  onApplyEdit,
  onCollapse,
  compact = false,
  buildPlan = "",
  seed = "",
  onSeedUsed,
  onOpenPlan,
}: {
  project: Project;
  files: ProjectFile[];
  onApplyEdit: (path: string, content: string) => void;
  onCollapse: () => void;
  /** Phone/tablet layout — the assistant says so up front before anything else. */
  compact?: boolean;
  /**
   * Build plan from the Planning panel; sent as context on every request.
   * Named `buildPlan` because `plan` in this file is the subscription tier.
   */
  buildPlan?: string;
  /** Text to drop into the composer (e.g. "build the plan"), then cleared. */
  seed?: string;
  onSeedUsed?: () => void;
  /** The assistant decided this is a planning request (open_plan tool). */
  onOpenPlan?: (goal: string) => void;
}) {
  const { t, lang } = useI18n();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // Auto-apply: AI edits land in the project immediately, no Apply click. On by
  // default (user asked for "always able to make edits"); toggle persists.
  const [autoApply, setAutoApply] = useState(true);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const [prefs, setPrefs] = useState<AssistantPreferences>(DEFAULT_PREFERENCES);
  const [tier, setTier] = useState<AssistantTier>("standard");
  const [modelMenu, setModelMenu] = useState(false);
  // Opt-in extras sent with each message. Logs also ride along automatically
  // when the server sees the bot crashed, so this toggle is for the other case:
  // "it runs, but behaves wrong".
  const [attachLogs, setAttachLogs] = useState(false);
  const [attachMetrics, setAttachMetrics] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const { plan, hostingAvailable } = usePlan();
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load saved persona preferences (still editable in Settings) + the auto-apply
  // choice once on mount (localStorage is client-only).
  useEffect(() => {
    setPrefs(loadPrefs());
    try {
      if (localStorage.getItem(AUTO_APPLY_KEY) === "0") setAutoApply(false);
    } catch {
      /* storage blocked — keep the default */
    }
  }, []);

  // Resolve the selected tier from storage, clamped to what the plan allows —
  // a saved "max" from a lapsed subscription must fall back. Runs when the plan
  // resolves so a free account never sends a locked tier.
  useEffect(() => {
    const allowed = tiersForPlan(plan);
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(MODEL_KEY);
    } catch {
      /* storage blocked — use the plan default */
    }
    const isTier = (v: string | null): v is AssistantTier =>
      v === "standard" || v === "advanced" || v === "max";
    setTier(isTier(saved) && allowed.includes(saved) ? saved : defaultTierForPlan(plan));
  }, [plan]);

  // Keyboard navigation for the tier menu: ↑/↓ move, Enter picks, Esc closes.
  // Locked tiers are still reachable — landing on one and pressing Enter is how
  // you find out what upgrading gets you.
  const [cursor, setCursor] = useState(0);
  useEffect(() => {
    if (!modelMenu) return;
    setCursor(Math.max(0, TIERS.indexOf(tier)));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModelMenu(false);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => (c + (e.key === "ArrowDown" ? 1 : TIERS.length - 1)) % TIERS.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        setCursor((c) => {
          pickTier(TIERS[c]);
          return c;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // pickTier is stable enough for this menu's lifetime; re-subscribing on
    // every render would tear the listener down mid-keypress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelMenu, tier]);

  // Pick a tier; a locked one (not in the plan) opens the upgrade modal
  // instead of switching. The server re-checks — this is UX, not the gate.
  function pickTier(t: AssistantTier) {
    setModelMenu(false);
    if (!tiersForPlan(plan).includes(t)) {
      setUpgradeOpen(true);
      return;
    }
    setTier(t);
    try {
      localStorage.setItem(MODEL_KEY, t);
    } catch {
      /* non-fatal */
    }
  }

  // Abort an in-flight stream if the panel unmounts (e.g. chat collapsed).
  useEffect(() => () => abortRef.current?.abort(), []);

  // Load the saved conversation. It lives on the server, so the same project
  // opened on another device — or after a plain reload — picks up where it was.
  useEffect(() => {
    let cancelled = false;
    void loadChat(project.id).then((saved) => {
      if (cancelled || !saved.length) return;
      setMessages(
        saved.map((m) => ({
          id: uid(),
          role: m.role,
          text: m.content,
          // Anything restored was already written to the files at the time.
          edits: (m.edits ?? []).map((e) => ({ ...e, applied: true })),
        })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  // Pre-fill the composer when the Planning panel hands work over. Deliberately
  // not auto-sent: the user gets to edit it, and a message they didn't press
  // send on must never eat a slot from their daily quota.
  useEffect(() => {
    if (!seed) return;
    setInput(seed);
    onSeedUsed?.();
  }, [seed, onSeedUsed]);

  function toggleAutoApply() {
    setAutoApply((v) => {
      const next = !v;
      try {
        localStorage.setItem(AUTO_APPLY_KEY, next ? "1" : "0");
      } catch {
        /* non-fatal */
      }
      return next;
    });
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const userMsg: Msg = { id: uid(), role: "user", text: trimmed };
    const history = [...messages, userMsg];
    // Add the user's turn + an empty assistant placeholder we fill as it streams.
    const replyId = uid();
    setMessages([...history, { id: replyId, role: "assistant", text: "", edits: [] }]);
    setInput("");
    setBusy(true);
    track("ai_message_sent");

    // The API accepts at most 30 messages — send a sliding window of the most
    // recent ones so long conversations keep working. Trim any leading
    // assistant turns so the window still starts with a user message.
    const recent = history.slice(-30);
    const firstUser = recent.findIndex((m) => m.role === "user");
    const payload = firstUser > 0 ? recent.slice(firstUser) : recent;

    const controller = new AbortController();
    abortRef.current = controller;
    // Update only the streaming assistant message, by id.
    const patch = (fn: (m: Msg) => Msg) =>
      setMessages((prev) => prev.map((m) => (m.id === replyId ? fn(m) : m)));

    let accText = "";
    let accThinking = "";
    const accEdits: Edit[] = [];
    let hadError = false;
    let handedOffPlan = false;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: { name: project.name, platform: project.platform, language: project.language, entry: project.entry },
          files,
          messages: payload.map((m) => ({ role: m.role, content: m.text })),
          preferences: prefs,
          tier,
          // Empty string would just waste prompt tokens on an empty section.
          ...(buildPlan.trim() ? { plan: buildPlan } : {}),
          // The server looks the bot's state up itself; we only say which
          // project and what the user opted into.
          projectId: project.id,
          ...(attachLogs || attachMetrics
            ? { attach: { logs: attachLogs, metrics: attachMetrics } }
            : {}),
        }),
        signal: controller.signal,
      });

      const usedH = res.headers.get("X-Assistant-Usage-Used");
      const limitH = res.headers.get("X-Assistant-Usage-Limit");
      if (usedH && limitH) setQuota({ used: Number(usedH), limit: Number(limitH) });

      // Non-OK responses (401/503/400/429) are plain JSON, not a stream.
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        if (data?.usage && typeof data.usage.used === "number") setQuota(data.usage);
        patch((m) => ({ ...m, text: data?.error || t("chat.genericError"), error: true }));
        return;
      }

      for await (const event of readAssistantStream(res.body)) {
        if (event.type === "text") {
          accText += event.delta;
          patch((m) => ({ ...m, text: accText }));
        } else if (event.type === "thinking") {
          accThinking += event.delta;
          patch((m) => ({ ...m, thinking: accThinking }));
        } else if (event.type === "plan") {
          handedOffPlan = true;
          onOpenPlan?.(event.goal);
        } else if (event.type === "edit") {
          accEdits.push({ path: event.path, content: event.content });
          patch((m) => ({ ...m, edits: [...accEdits] }));
        } else if (event.type === "error") {
          hadError = true;
          const text = (accText ? accText + "\n\n" : "") + (event.message || t("chat.genericError"));
          patch((m) => ({ ...m, text, error: true }));
        }
      }

      // Model produced only file edits and no prose — show a sensible summary.
      if (!hadError && !accText.trim() && accEdits.length) {
        const n = accEdits.length;
        const summary = t("chat.preparedChanges")
          .replace("{n}", String(n))
          .replace("{files}", plural(lang, n, { en: ["file", "files"], ru: ["файл", "файла", "файлов"] }));
        patch((m) => ({ ...m, text: summary }));
      }
      // Nothing to show at all — never leave a permanently blank message. A
      // reasoning block or a hand-off to the Planning tab both count as an
      // answer; only true silence is an error.
      if (!hadError && !accText.trim() && !accEdits.length && !accThinking.trim() && !handedOffPlan) {
        patch((m) => ({ ...m, text: t("chat.emptyReplyError"), error: true }));
      }

      // Auto-apply: write every proposed edit straight to the project and mark
      // it applied. Off → the user still approves each edit with Apply below.
      if (autoApply && !hadError && accEdits.length) {
        accEdits.forEach((e) => onApplyEdit(e.path, e.content));
        patch((m) => ({ ...m, edits: (m.edits ?? []).map((e) => ({ ...e, applied: true })) }));
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // superseded / unmounted
      patch((m) => ({ ...m, text: t("chat.networkError"), error: true }));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
      // Persist the exchange. Fire-and-forget by design: a failed save must
      // never disturb the reply the user is already reading. Errors aren't
      // stored — re-reading "something went wrong" on every reopen helps nobody.
      if (!hadError && (accText.trim() || accEdits.length)) {
        void appendChat(project.id, [
          { role: "user", content: trimmed },
          { role: "assistant", content: accText, edits: accEdits.map((e) => ({ path: e.path, content: e.content })) },
        ]);
      }
    }
  }

  function apply(msgId: string, idx: number) {
    // Side effect stays outside the updater — React may re-run updaters
    // (StrictMode/concurrent), which would apply the write twice.
    const edit = messages.find((m) => m.id === msgId)?.edits?.[idx];
    if (!edit || edit.applied) return;
    onApplyEdit(edit.path, edit.content);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.edits
          ? { ...m, edits: m.edits.map((e, i) => (i === idx ? { ...e, applied: true } : e)) }
          : m,
      ),
    );
  }

  return (
    <div className="flex h-full flex-col bg-ink-950">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-ink-800 px-4 py-2.5">
        <span className="grid h-5 w-5 place-items-center rounded bg-accent text-white">
          <Bot className="h-3.5 w-3.5" />
        </span>
        <span className="text-sm font-medium text-neutral-200">{t("chat.assistant")}</span>

        {/* Model selector — paid tiers switch Standard/Advanced; free sees the
            Advanced model locked and a click routes to the upgrade modal. */}
        <div className="relative ml-auto">
          <button
            onClick={() => setModelMenu((v) => !v)}
            aria-label={t("chat.selectModel")}
            aria-expanded={modelMenu}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-900/60 px-2 py-1 text-[11px] font-medium text-neutral-200 transition-colors hover:border-accent/50 hover:bg-ink-900"
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", TIER_META[tier].dot)} />
            {TIER_LABEL[tier]}
            <ChevronRight className={cn("h-3 w-3 text-neutral-500 transition-transform", modelMenu && "rotate-90")} />
          </button>
          {modelMenu && (
            <>
              <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setModelMenu(false)} />
              <div className="absolute right-0 top-8 z-20 w-60 overflow-hidden rounded-xl border border-ink-700 bg-ink-950 p-1 shadow-lift">
                <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                  {t("chat.modelMenuTitle")}
                </div>
                {TIERS.map((m, i) => {
                  const locked = !tiersForPlan(plan).includes(m);
                  const active = tier === m && !locked;
                  return (
                    <button
                      key={m}
                      onClick={() => pickTier(m)}
                      onMouseEnter={() => setCursor(i)}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                        active && "bg-accent/15",
                        // Keyboard cursor and hover are the same highlight, so
                        // switching between mouse and keys doesn't show two.
                        cursor === i && !active && "bg-white/[0.06]",
                      )}
                    >
                      <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", TIER_META[m].dot, locked && "opacity-40")} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className={cn("text-[13px] font-medium", locked ? "text-neutral-400" : "text-neutral-100")}>
                            {TIER_LABEL[m]}
                          </span>
                          {active && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                          {locked && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-white/[0.06] px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-neutral-400">
                              <Lock className="h-2.5 w-2.5" /> {t("chat.upgradeShort")}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500">
                          {t(TIER_META[m].descKey)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <button
          onClick={toggleAutoApply}
          aria-pressed={autoApply}
          title={t("chat.autoApplyHint")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors",
            autoApply
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-ink-700 bg-ink-900/60 text-neutral-400 hover:text-neutral-200",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", autoApply ? "bg-emerald-400" : "bg-neutral-600")} />
          {t("chat.autoApply")}
        </button>
        {/* Two-step, like every other destroy in this app: the conversation is
            now saved, so one stray click would wipe real history. */}
        {messages.length > 0 && (
          <button
            onClick={() => {
              if (!confirmClear) {
                setConfirmClear(true);
                return;
              }
              setConfirmClear(false);
              setMessages([]);
              void clearChat(project.id);
            }}
            onBlur={() => setConfirmClear(false)}
            title={t("chat.clear")}
            className={cn(
              "rounded-lg border px-2 py-1 text-[11px] transition-colors",
              confirmClear
                ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                : "border-ink-700 text-neutral-500 hover:text-neutral-300",
            )}
          >
            {confirmClear ? t("chat.clearConfirm") : t("chat.clear")}
          </button>
        )}
        <button
          onClick={onCollapse}
          aria-label={t("chat.hideAssistant")}
          className="grid h-6 w-6 place-items-center rounded text-neutral-500 hover:bg-white/10 hover:text-neutral-200"
        >
          <Close className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3.5 overflow-y-auto p-4">
        {/* On a small screen the assistant opens by saying a desktop is roomier
            — before the usual hint, so it's the first thing read. It's advice,
            not a gate: everything below still works. */}
        {messages.length === 0 && compact && (
          <div className="rounded-xl border border-ink-800 bg-ink-900/60 p-3.5 text-[13px] text-neutral-300">
            {t("chat.compactHint")}
          </div>
        )}

        {messages.length === 0 && (
          <div className="rounded-xl border border-ink-800 bg-ink-900/60 p-3.5 text-[13px] text-neutral-400">
            {t("chat.introHint")}
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-sm bg-accent px-3.5 py-2 text-[13px] text-white">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className="space-y-2.5">
              {m.thinking && <ThinkingBlock text={m.thinking} live={busy && !m.text} />}
              <div
                className={cn(
                  "whitespace-pre-wrap text-[13px] leading-relaxed",
                  m.error ? "text-rose-300" : "text-neutral-300",
                )}
              >
                {m.text}
              </div>
              {m.edits?.map((edit, i) => (
                <div key={i} className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <FileIcon className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                    <span title={edit.path} className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-300">
                      {edit.path}
                    </span>
                    {edit.applied ? (
                      <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-400">
                        <Check className="h-3.5 w-3.5" /> {t("chat.applied")}
                      </span>
                    ) : (
                      <button
                        onClick={() => apply(m.id, i)}
                        className="ml-auto rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-accent-hover"
                      >
                        {t("chat.apply")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ),
        )}

        {/* Typing dots only until something — reasoning or prose — starts arriving. */}
        {busy &&
          !messages[messages.length - 1]?.text &&
          !messages[messages.length - 1]?.thinking &&
          !messages[messages.length - 1]?.edits?.length && (
            <div className="flex w-fit items-center gap-1.5 rounded-xl border border-ink-800 bg-ink-900/70 px-3 py-2.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-neutral-500"
                  style={{ animation: `bfb 1.2s ease-in-out ${i * 0.15}s infinite` }}
                />
              ))}
              <style>{`@keyframes bfb{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}`}</style>
            </div>
          )}

        {messages.length === 0 && !busy && (
          <div className="pt-1">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-neutral-600">{t("chat.try")}</div>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTION_KEYS.map((key) => (
                <button
                  key={key}
                  onClick={() => send(t(key))}
                  className="rounded-full border border-ink-800 bg-ink-900 px-2.5 py-1 text-[12px] text-neutral-400 transition-colors hover:border-accent/40 hover:text-neutral-200"
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-ink-800 p-3">
        {/* Attach controls — only for accounts that can actually host a bot;
            without hosting there's no runtime state to attach. */}
        {hostingAvailable && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-neutral-600">{t("chat.attach")}</span>
            <AttachChip
              label={t("chat.attachLogs")}
              title={t("chat.attachLogsHint")}
              on={attachLogs}
              onToggle={() => setAttachLogs((v) => !v)}
            />
            <AttachChip
              label={t("chat.attachMetrics")}
              title={t("chat.attachMetricsHint")}
              on={attachMetrics}
              onToggle={() => setAttachMetrics((v) => !v)}
            />
          </div>
        )}
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-2 focus-within:border-accent/50">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            placeholder={t("chat.composerPlaceholder")}
            className="w-full resize-none bg-transparent px-1.5 py-1 text-[13px] text-neutral-200 outline-none placeholder:text-neutral-600"
          />
          <div className="flex items-center justify-between pl-1.5">
            <span className="text-[11px] text-neutral-600">
              {t("chat.sendHint")}
              {quota && (
                <span className={cn("ml-1.5", quota.used >= quota.limit && "text-rose-400")}>
                  · {quota.used}/{quota.limit} {t("chat.today")}
                </span>
              )}
            </span>
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || busy}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
            >
              {t("chat.send")}
            </button>
          </div>
        </div>
      </div>

      {upgradeOpen && (
        <UpgradeModal
          current={plan}
          highlight={plan === "basic" ? "pro" : "basic"}
          reason={t("chat.upgradeReason").replace("{plan}", planMeta(plan).name)}
          onClose={() => setUpgradeOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * The model's reasoning, shown the way a person would want it: expanded while
 * it's the only thing happening, collapsed to a one-line header once the actual
 * answer starts. It's a summary from the provider, not raw internal state.
 */
function ThinkingBlock({ text, live }: { text: string; live: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const expanded = open || live;

  // Follow the reasoning as it streams, but only while it's driving the view —
  // once the user has opened it themselves, let them read at their own pace.
  useEffect(() => {
    if (live) bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [text, live]);

  return (
    <div className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900/40">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px] text-neutral-500 transition-colors hover:text-neutral-300"
      >
        <ChevronRight className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")} />
        {live ? t("chat.thinkingLive") : t("chat.thinkingDone")}
      </button>
      {expanded && (
        <div
          ref={bodyRef}
          className="max-h-48 overflow-y-auto border-t border-ink-800 px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap text-neutral-500"
        >
          {text}
        </div>
      )}
    </div>
  );
}

/** Small on/off pill for the composer's attach row. */
function AttachChip({
  label,
  title,
  on,
  onToggle,
}: {
  label: string;
  title: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={on}
      title={title}
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
        on
          ? "border-accent/40 bg-accent/15 text-[#a5b4fc]"
          : "border-ink-700 text-neutral-500 hover:text-neutral-300",
      )}
    >
      {label}
    </button>
  );
}
