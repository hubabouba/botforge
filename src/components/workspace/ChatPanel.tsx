"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage, ChatStep } from "@/lib/workspace/types";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Add an /help command",
  "Alert me when BTC moves 5%",
  "Store subscribers in Postgres",
];

function StepCard({ step, onFix }: { step: ChatStep; onFix: () => void }) {
  if (step.kind === "reasoning") {
    return (
      <div className="rounded-xl border border-ink-800 bg-ink-900/70 p-3">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
          <span className="text-amber-300">✦</span> Reasoning
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-400">{step.text}</p>
      </div>
    );
  }
  if (step.kind === "file") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-ink-800 bg-ink-900 px-3 py-2 text-[13px]">
        <span className={step.action === "create" ? "text-emerald-400" : "text-amber-300"}>
          {step.action === "create" ? "＋" : "✎"}
        </span>
        <span className="font-mono text-xs text-neutral-300">{step.path}</span>
        <span className="ml-auto font-mono text-[11px] text-emerald-400">
          {step.added ? `+${step.added}` : ""}
          {step.removed ? ` −${step.removed}` : ""}
        </span>
      </div>
    );
  }
  if (step.kind === "run") {
    return (
      <div className="flex items-center gap-2 text-[13px] text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        {step.text}
      </div>
    );
  }
  // error
  return (
    <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-3">
      <div className="flex items-start gap-2 text-rose-300">
        <span className="mt-0.5">⚠</span>
        <span className="text-[13px]">{step.text}</span>
      </div>
      {step.fixable && (
        <button
          onClick={onFix}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white shadow-soft transition-transform hover:-translate-y-0.5"
        >
          <span>✨</span> Fix automatically
        </button>
      )}
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-ink-800 bg-ink-900/70 px-3 py-2.5 w-fit">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-neutral-500"
          style={{ animation: `bfbounce 1.2s ease-in-out ${i * 0.15}s infinite` }}
        />
      ))}
      <style>{`@keyframes bfbounce{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}`}</style>
    </div>
  );
}

function Bubble({ message, onFix }: { message: ChatMessage; onFix: () => void }) {
  if (message.role === "user") {
    return (
      <div className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-sm bg-accent px-3.5 py-2 text-[13px] text-white">
        {message.text}
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      {message.text && (
        <div className="text-[13px] leading-relaxed text-neutral-300">{message.text}</div>
      )}
      {message.steps?.map((s, i) => <StepCard key={i} step={s} onFix={onFix} />)}
      {message.pending && <TypingDots />}
    </div>
  );
}

export function ChatPanel({
  projectName,
  messages,
  onSend,
  onFix,
}: {
  projectName: string;
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onFix: () => void;
}) {
  const [value, setValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const busy = messages.some((m) => m.pending);

  function submit() {
    const text = value.trim();
    if (!text || busy) return;
    onSend(text);
    setValue("");
  }

  return (
    <div className="flex h-full flex-col bg-ink-950">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-ink-800 px-4 py-2.5">
        <span className="grid h-5 w-5 place-items-center rounded bg-gradient-to-br from-accent to-violet-500 text-[11px] font-semibold text-white">
          B
        </span>
        <span className="text-sm font-medium text-neutral-200">Assistant</span>
        <span className="ml-auto font-mono text-[11px] text-neutral-500">{projectName}</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3.5 overflow-y-auto p-4">
        {messages.map((m) => (
          <Bubble key={m.id} message={m} onFix={onFix} />
        ))}

        {messages.length <= 2 && !busy && (
          <div className="pt-2">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-neutral-600">Try asking</div>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => onSend(s)}
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
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder="Describe a change — the AI edits the code…"
            className="w-full resize-none bg-transparent px-1.5 py-1 text-[13px] text-neutral-200 outline-none placeholder:text-neutral-600"
          />
          <div className="flex items-center justify-between pl-1.5">
            <span className="text-[11px] text-neutral-600">⏎ send · ⇧⏎ newline</span>
            <button
              onClick={submit}
              disabled={!value.trim() || busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-accent-hover disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
