"use client";

import { useEffect, useRef, useState } from "react";
import type { Project, ProjectFile } from "@/lib/workspace/types";
import { Bot, Check, FileIcon, Close, Settings, Lock } from "@/components/icons";
import { loadPrefs, savePrefs, DEFAULT_PREFERENCES, type AssistantPreferences } from "@/lib/workspace/assistantPrefs";
import { readAssistantStream } from "@/lib/ai/streamClient";
import { defaultReply } from "@/lib/ai/types";
import { usePlan } from "@/hooks/usePlan";
import { UpgradeModal } from "@/components/upgrade/UpgradeModal";
import { planMeta } from "@/lib/plan";
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
const SUGGESTIONS = ["Add a /help command", "Explain what this bot does", "Handle errors gracefully"];

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
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const [prefs, setPrefs] = useState<AssistantPreferences>(DEFAULT_PREFERENCES);
  const { plan } = usePlan();
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load saved persona preferences once on mount (localStorage is client-only).
  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  // Abort an in-flight stream if the panel unmounts (e.g. chat collapsed).
  useEffect(() => () => abortRef.current?.abort(), []);

  function updatePrefs(patch: Partial<AssistantPreferences>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(next);
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
        patch((m) => ({ ...m, text: data?.error || "Something went wrong.", error: true }));
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
          const text = (accText ? accText + "\n\n" : "") + (event.message || "Something went wrong.");
          patch((m) => ({ ...m, text, error: true }));
        }
      }

      // Model produced only file edits and no prose — show a sensible summary.
      if (!hadError && !accText.trim() && accEdits.length) {
        patch((m) => ({ ...m, text: defaultReply(accEdits) }));
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // superseded / unmounted
      patch((m) => ({ ...m, text: "Network error — please try again.", error: true }));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }

  function apply(msgId: string, idx: number) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.edits) return m;
        const edit = m.edits[idx];
        onApplyEdit(edit.path, edit.content);
        const edits = m.edits.map((e, i) => (i === idx ? { ...e, applied: true } : e));
        return { ...m, edits };
      }),
    );
  }

  return (
    <div className="flex h-full flex-col bg-ink-950">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-ink-800 px-4 py-2.5">
        <span className="grid h-5 w-5 place-items-center rounded bg-accent text-white">
          <Bot className="h-3.5 w-3.5" />
        </span>
        <span className="text-sm font-medium text-neutral-200">Assistant</span>
        {plan === "pro" ? (
          <span className="ml-auto rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
            Pro
          </span>
        ) : (
          <button
            onClick={() => setUpgradeOpen(true)}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-ink-700 px-2 py-0.5 text-[10px] font-medium text-neutral-400 transition-colors hover:border-accent/50 hover:text-neutral-200"
          >
            <Lock className="h-3 w-3" />
            {plan === "basic" ? "Basic · Upgrade" : "Free · Upgrade"}
          </button>
        )}
        <button
          onClick={() => setSettingsOpen((v) => !v)}
          aria-label="Assistant settings"
          aria-pressed={settingsOpen}
          className={cn(
            "grid h-6 w-6 place-items-center rounded text-neutral-500 hover:bg-white/10 hover:text-neutral-200",
            settingsOpen && "bg-white/10 text-neutral-200",
          )}
        >
          <Settings className="h-4 w-4" />
        </button>
        <button
          onClick={onCollapse}
          aria-label="Hide assistant"
          className="grid h-6 w-6 place-items-center rounded text-neutral-500 hover:bg-white/10 hover:text-neutral-200"
        >
          <Close className="h-4 w-4" />
        </button>
      </div>

      {settingsOpen && (
        <AssistantSettings
          prefs={prefs}
          onChange={updatePrefs}
          onReset={() => {
            savePrefs(DEFAULT_PREFERENCES);
            setPrefs(DEFAULT_PREFERENCES);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3.5 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="rounded-xl border border-ink-800 bg-ink-900/60 p-3.5 text-[13px] text-neutral-400">
            Ask me to add features, fix bugs, or explain the code. I can edit files directly — you approve each change.
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
                    <FileIcon className="h-3.5 w-3.5 text-neutral-400" />
                    <span className="font-mono text-xs text-neutral-300">{edit.path}</span>
                    {edit.applied ? (
                      <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-400">
                        <Check className="h-3.5 w-3.5" /> Applied
                      </span>
                    ) : (
                      <button
                        onClick={() => apply(m.id, i)}
                        className="ml-auto rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-accent-hover"
                      >
                        Apply
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
            <div className="mb-2 text-[11px] uppercase tracking-wider text-neutral-600">Try</div>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-ink-800 bg-ink-900 px-2.5 py-1 text-[12px] text-neutral-400 transition-colors hover:border-accent/40 hover:text-neutral-200"
                >
                  {s}
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
            placeholder="Ask the assistant to change the code…"
            className="w-full resize-none bg-transparent px-1.5 py-1 text-[13px] text-neutral-200 outline-none placeholder:text-neutral-600"
          />
          <div className="flex items-center justify-between pl-1.5">
            <span className="text-[11px] text-neutral-600">
              ⏎ send · ⇧⏎ newline
              {quota && (
                <span className={cn("ml-1.5", quota.used >= quota.limit && "text-rose-400")}>
                  · {quota.used}/{quota.limit} today
                </span>
              )}
            </span>
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || busy}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {upgradeOpen && (
        <UpgradeModal
          current={plan}
          highlight={plan === "basic" ? "pro" : "basic"}
          reason={`You're on ${planMeta(plan).name}. Upgrade for a smarter assistant and more.`}
          onClose={() => setUpgradeOpen(false)}
        />
      )}
    </div>
  );
}

const LANGUAGES = ["", "English", "Русский", "Español", "Deutsch", "Français"];
const LANG_LABEL: Record<string, string> = { "": "Match me" };
const STYLES: { value: NonNullable<AssistantPreferences["style"]>; label: string }[] = [
  { value: "concise", label: "Concise" },
  { value: "balanced", label: "Balanced" },
  { value: "detailed", label: "Detailed" },
];

function AssistantSettings({
  prefs,
  onChange,
  onReset,
  onClose,
}: {
  prefs: AssistantPreferences;
  onChange: (patch: Partial<AssistantPreferences>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <div className="border-b border-ink-800 bg-ink-900/60 px-4 py-3.5 text-[13px]">
      <div className="mb-3 flex items-center">
        <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Assistant persona</span>
        <button
          onClick={onClose}
          className="ml-auto text-[11px] text-neutral-500 hover:text-neutral-300"
        >
          Done
        </button>
      </div>

      {/* Reply language */}
      <label className="mb-1 block text-[12px] text-neutral-400">Reply language</label>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {LANGUAGES.map((lang) => (
          <button
            key={lang || "auto"}
            onClick={() => onChange({ language: lang })}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
              (prefs.language ?? "") === lang
                ? "border-accent/60 bg-accent/15 text-neutral-100"
                : "border-ink-800 bg-ink-900 text-neutral-400 hover:text-neutral-200",
            )}
          >
            {LANG_LABEL[lang] ?? lang}
          </button>
        ))}
      </div>

      {/* Verbosity */}
      <label className="mb-1 block text-[12px] text-neutral-400">Style</label>
      <div className="mb-3 flex gap-1.5">
        {STYLES.map((s) => (
          <button
            key={s.value}
            onClick={() => onChange({ style: s.value })}
            className={cn(
              "flex-1 rounded-lg border px-2 py-1.5 text-[12px] transition-colors",
              prefs.style === s.value
                ? "border-accent/60 bg-accent/15 text-neutral-100"
                : "border-ink-800 bg-ink-900 text-neutral-400 hover:text-neutral-200",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Persona / character */}
      <label className="mb-1 block text-[12px] text-neutral-400">Character</label>
      <input
        value={prefs.persona ?? ""}
        onChange={(e) => onChange({ persona: e.target.value })}
        maxLength={400}
        placeholder="e.g. a friendly mentor · a blunt senior engineer"
        className="mb-3 w-full rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-[12px] text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-accent/50"
      />

      {/* Custom instructions */}
      <label className="mb-1 block text-[12px] text-neutral-400">Custom instructions</label>
      <textarea
        value={prefs.custom ?? ""}
        onChange={(e) => onChange({ custom: e.target.value })}
        maxLength={1000}
        rows={2}
        placeholder="Anything else the assistant should always do…"
        className="w-full resize-none rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-[12px] text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-accent/50"
      />

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-neutral-600">Saved for all your projects</span>
        <button onClick={onReset} className="text-[11px] text-neutral-500 hover:text-neutral-300">
          Reset
        </button>
      </div>
    </div>
  );
}
