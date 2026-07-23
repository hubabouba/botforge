"use client";

import { useEffect, useRef, useState } from "react";
import type { Project, ProjectFile } from "@/lib/workspace/types";
import { Bot, Check, FileIcon, Close, Lock, ChevronRight } from "@/components/icons";
import { loadPrefs, DEFAULT_PREFERENCES, type AssistantPreferences } from "@/lib/workspace/assistantPrefs";
import { readAssistantStream } from "@/lib/ai/streamClient";
import { track } from "@/lib/analytics";
import { usePlan } from "@/hooks/usePlan";
import { UpgradeModal } from "@/components/upgrade/UpgradeModal";
import { planMeta, providersForPlan, type Provider } from "@/lib/plan";
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
  edits?: Edit[];
  error?: boolean;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const SUGGESTION_KEYS = ["chat.suggestion1", "chat.suggestion2", "chat.suggestion3"];
// White-labelled model names — users see the tier, not the underlying provider
// (lets us swap the engine later without changing the product's language).
const MODEL_LABEL: Record<Provider, string> = { gemini: "Standard", claude: "Advanced" };
const MODEL_META: Record<Provider, { dot: string; descKey: string }> = {
  gemini: { dot: "bg-emerald-400", descKey: "chat.modelStandardDesc" },
  claude: { dot: "bg-gradient-to-r from-[#818CF8] to-[#22D3EE]", descKey: "chat.modelAdvancedDesc" },
};
const MODEL_KEY = "bf:assistant-model";
const AUTO_APPLY_KEY = "bf:auto-apply";

export function WorkspaceChat({
  project,
  files,
  onApplyEdit,
  onCollapse,
}: {
  project: Project;
  files: ProjectFile[];
  onApplyEdit: (path: string, content: string) => void;
  onCollapse: () => void;
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
  const [model, setModel] = useState<Provider>("gemini");
  const [modelMenu, setModelMenu] = useState(false);
  const { plan } = usePlan();
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

  // Resolve the selected model from storage, clamped to what the plan allows —
  // a saved "claude" from a lapsed subscription must fall back to Gemini. Runs
  // when the plan resolves so a free account never sends a locked model.
  useEffect(() => {
    const allowed = providersForPlan(plan);
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(MODEL_KEY);
    } catch {
      /* storage blocked — use the plan default */
    }
    const fallback: Provider = allowed.includes("claude") ? "claude" : "gemini";
    const initial: Provider = saved === "claude" || saved === "gemini" ? saved : fallback;
    setModel(allowed.includes(initial) ? initial : "gemini");
  }, [plan]);

  // Pick a model; a locked one (not in the plan) opens the upgrade modal
  // instead of switching. The server re-checks — this is UX, not the gate.
  function pickModel(m: Provider) {
    setModelMenu(false);
    if (!providersForPlan(plan).includes(m)) {
      setUpgradeOpen(true);
      return;
    }
    setModel(m);
    try {
      localStorage.setItem(MODEL_KEY, m);
    } catch {
      /* non-fatal */
    }
  }

  // Abort an in-flight stream if the panel unmounts (e.g. chat collapsed).
  useEffect(() => () => abortRef.current?.abort(), []);

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
    const accEdits: Edit[] = [];
    let hadError = false;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: { name: project.name, platform: project.platform, language: project.language },
          files,
          messages: payload.map((m) => ({ role: m.role, content: m.text })),
          preferences: prefs,
          provider: model,
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
      // Stream ended with nothing at all (e.g. the model spent its whole token
      // budget) — never leave a permanently blank message.
      if (!hadError && !accText.trim() && !accEdits.length) {
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
            <span className={cn("h-1.5 w-1.5 rounded-full", MODEL_META[model].dot)} />
            {MODEL_LABEL[model]}
            <ChevronRight className={cn("h-3 w-3 text-neutral-500 transition-transform", modelMenu && "rotate-90")} />
          </button>
          {modelMenu && (
            <>
              <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setModelMenu(false)} />
              <div className="absolute right-0 top-8 z-20 w-60 overflow-hidden rounded-xl border border-ink-700 bg-ink-950 p-1 shadow-lift">
                <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                  {t("chat.modelMenuTitle")}
                </div>
                {(["gemini", "claude"] as Provider[]).map((m) => {
                  const locked = !providersForPlan(plan).includes(m);
                  const active = model === m && !locked;
                  return (
                    <button
                      key={m}
                      onClick={() => pickModel(m)}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                        active ? "bg-accent/15" : "hover:bg-white/[0.05]",
                      )}
                    >
                      <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", MODEL_META[m].dot, locked && "opacity-40")} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className={cn("text-[13px] font-medium", locked ? "text-neutral-400" : "text-neutral-100")}>
                            {MODEL_LABEL[m]}
                          </span>
                          {active && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                          {locked && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-white/[0.06] px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-neutral-400">
                              <Lock className="h-2.5 w-2.5" /> {t("chat.upgradeShort")}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500">
                          {t(MODEL_META[m].descKey)}
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

        {/* Typing dots only until the streamed reply starts filling in. */}
        {busy && !messages[messages.length - 1]?.text && !messages[messages.length - 1]?.edits?.length && (
          <div className="flex items-center gap-1.5 rounded-xl border border-ink-800 bg-ink-900/70 px-3 py-2.5 w-fit">
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

