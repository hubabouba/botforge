"use client";

import { useEffect, useRef, useState } from "react";
import type { Project, ProjectFile } from "@/lib/workspace/types";
import { Bot, Check, FileIcon, Close } from "@/components/icons";
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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const userMsg: Msg = { id: uid(), role: "user", text: trimmed };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: { name: project.name, platform: project.platform, language: project.language },
          files,
          messages: history.map((m) => ({ role: m.role, content: m.text })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((p) => [...p, { id: uid(), role: "assistant", text: data.error || "Something went wrong.", error: true }]);
      } else {
        setMessages((p) => [...p, { id: uid(), role: "assistant", text: data.reply, edits: data.edits ?? [] }]);
      }
    } catch {
      setMessages((p) => [...p, { id: uid(), role: "assistant", text: "Network error — please try again.", error: true }]);
    } finally {
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
        <button
          onClick={onCollapse}
          aria-label="Hide assistant"
          className="ml-auto grid h-6 w-6 place-items-center rounded text-neutral-500 hover:bg-white/10 hover:text-neutral-200"
        >
          <Close className="h-4 w-4" />
        </button>
      </div>

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

        {busy && (
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
            <span className="text-[11px] text-neutral-600">⏎ send · ⇧⏎ newline</span>
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
    </div>
  );
}
