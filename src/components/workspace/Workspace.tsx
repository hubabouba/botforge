"use client";

import { useCallback, useRef, useState } from "react";
import type { ChatMessage, Project, ProjectFile } from "@/lib/workspace/types";
import { TopBar, type RunState, type WorkspaceTab } from "./TopBar";
import { FileTree } from "./FileTree";
import { CodeEditor } from "./CodeEditor";
import { ChatPanel } from "./ChatPanel";
import { LogsPanel, type LogLine } from "./LogsPanel";
import { Architecture } from "./Architecture";
import { Analytics } from "./Analytics";
import { cn } from "@/lib/utils";

const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

/** Believable boot sequence streamed into the Logs tab when the user hits Run. */
const BOOT: Omit<LogLine, "id" | "time">[] = [
  { level: "cmd", text: "python main.py" },
  { level: "info", text: "Loading settings from environment…" },
  { level: "info", text: "ApplicationBuilder — token accepted" },
  { level: "info", text: "Registered handlers: /start /price /subscribe /unsubscribe" },
  { level: "info", text: "JobQueue — scheduled _daily_report at 09:00 UTC" },
  { level: "success", text: "Bot is up — polling for updates" },
];

export function Workspace({ project, seedChat }: { project: Project; seedChat: ChatMessage[] }) {
  const [files] = useState<ProjectFile[]>(project.files);
  const [openPaths, setOpenPaths] = useState<string[]>([project.entry]);
  const [activePath, setActivePath] = useState(project.entry);
  const [tab, setTab] = useState<WorkspaceTab>("Code");
  const [messages, setMessages] = useState<ChatMessage[]>(seedChat);
  const [runState, setRunState] = useState<RunState>("idle");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const activeFile = files.find((f) => f.path === activePath) ?? files[0];

  const openFile = useCallback((path: string) => {
    setActivePath(path);
    setOpenPaths((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setTab("Code");
  }, []);

  const closeTab = useCallback(
    (path: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setOpenPaths((prev) => {
        const next = prev.filter((p) => p !== path);
        if (path === activePath && next.length) setActivePath(next[next.length - 1]);
        return next.length ? next : [project.entry];
      });
    },
    [activePath, project.entry],
  );

  // ---- Run: stream a boot log into the Logs tab ----
  const run = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setRunState("starting");
    setLogs([]);
    setTab("Logs");
    BOOT.forEach((line, i) => {
      const t = setTimeout(() => {
        setLogs((prev) => [...prev, { ...line, id: uid(), time: now() }]);
        if (i === BOOT.length - 1) setRunState("running");
      }, 300 + i * 550);
      timers.current.push(t);
    });
  }, []);

  // ---- Chat (mock): shows the real UX; Claude wiring is the next sub-step ----
  const send = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: uid(), role: "user", text },
      { id: uid(), role: "assistant", pending: true },
    ]);
    const t = setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.pending
            ? {
                id: m.id,
                role: "assistant",
                text: "Here's the plan I'd run for that:",
                steps: [
                  {
                    kind: "reasoning",
                    text: `I'll turn "${text}" into concrete file edits — new handlers where needed, wired into main.py, keeping the existing structure.`,
                  },
                  { kind: "file", path: "bot/handlers.py", action: "edit", added: 12, removed: 2 },
                  { kind: "run", ok: true, text: "Preview — connect the generator to apply changes for real." },
                ],
              }
            : m,
        ),
      );
    }, 1100);
    timers.current.push(t);
  }, []);

  const fix = useCallback(() => {
    setMessages((prev) => [
      ...prev,
      {
        id: uid(),
        role: "assistant",
        text: "Patched it.",
        steps: [
          { kind: "file", path: "bot/handlers.py", action: "edit", added: 3, removed: 1 },
          { kind: "run", ok: true, text: "Fixed and redeployed · bot is polling" },
        ],
      },
    ]);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-ink-950 text-neutral-200">
      <TopBar project={project} tab={tab} onTab={setTab} runState={runState} onRun={run} />

      <div className="flex min-h-0 flex-1">
        {/* Main region — switches with the active tab */}
        <main className="flex min-w-0 flex-1">
          {tab === "Code" && (
            <>
              <aside className="hidden w-56 shrink-0 border-r border-ink-800 bg-ink-950 md:block">
                <FileTree files={files} activePath={activePath} onOpen={openFile} name={project.name} />
              </aside>
              <div className="flex min-w-0 flex-1 flex-col">
                {/* Editor tab bar */}
                <div className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-ink-800 bg-ink-950 px-1.5">
                  {openPaths.map((path) => {
                    const name = path.split("/").pop();
                    const active = path === activePath;
                    return (
                      <button
                        key={path}
                        onClick={() => setActivePath(path)}
                        className={cn(
                          "group/tab flex h-7 shrink-0 items-center gap-2 rounded-md px-2.5 text-[12px] transition-colors",
                          active ? "bg-ink-800 text-neutral-100" : "text-neutral-500 hover:bg-white/[0.04]",
                        )}
                      >
                        <span className="font-mono">{name}</span>
                        <span
                          onClick={(e) => closeTab(path, e)}
                          className="grid h-4 w-4 place-items-center rounded text-neutral-600 opacity-0 transition-opacity hover:bg-white/10 hover:text-neutral-300 group-hover/tab:opacity-100"
                        >
                          ✕
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="min-h-0 flex-1">
                  <CodeEditor file={activeFile} />
                </div>
              </div>
            </>
          )}

          {tab === "Architecture" && <div className="flex-1"><Architecture project={project} /></div>}
          {tab === "Logs" && <div className="flex-1"><LogsPanel logs={logs} running={runState === "running"} /></div>}
          {tab === "Analytics" && <div className="flex-1"><Analytics /></div>}
        </main>

        {/* Assistant — always present */}
        <aside className="hidden w-[300px] shrink-0 border-l border-ink-800 lg:block xl:w-[360px]">
          <ChatPanel projectName={project.name} messages={messages} onSend={send} onFix={fix} />
        </aside>
      </div>
    </div>
  );
}
