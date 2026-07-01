"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { NODE_CATALOG, type BotNode, type BotNodeType } from "@/lib/schema/types";
import BotFlowNode from "@/components/builder/BotFlowNode";
import PropertiesPanel from "@/components/builder/PropertiesPanel";
import { flowToGraph, graphToFlow, makeNode, type FlowNode } from "@/components/builder/flow";

const nodeTypes = { botNode: BotFlowNode };

export default function Builder({ botId }: { botId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<"telegram" | "discord">("telegram");
  const [hasToken, setHasToken] = useState(false);
  const [status, setStatus] = useState("stopped");
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const [tokenInput, setTokenInput] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [logs, setLogs] = useState<{ id: string; level: string; message: string; createdAt: string }[]>([]);

  const lastSavedRef = useRef<string>("");

  // ---- Load bot ----
  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/bots/${botId}`);
      if (!res.ok) return;
      const bot = await res.json();
      setName(bot.name);
      setPlatform(bot.platform);
      setHasToken(bot.hasToken);
      setStatus(bot.status);
      const graph = typeof bot.graph === "string" ? JSON.parse(bot.graph) : bot.graph;
      const flow = graphToFlow(graph);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      lastSavedRef.current = JSON.stringify({ name: bot.name, graph });
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId]);

  // ---- Autosave (debounced, only on real changes) ----
  const serialized = useMemo(
    () => JSON.stringify({ name, graph: flowToGraph(nodes, edges) }),
    [name, nodes, edges],
  );

  useEffect(() => {
    if (!loaded) return;
    if (serialized === lastSavedRef.current) return;
    setSaveState("saving");
    const t = setTimeout(async () => {
      const { name: n, graph } = JSON.parse(serialized);
      await fetch(`/api/bots/${botId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, graph }),
      });
      lastSavedRef.current = serialized;
      setSaveState("saved");
    }, 800);
    return () => clearTimeout(t);
  }, [serialized, loaded, botId]);

  // ---- Node helpers ----
  const allNodes = useMemo(() => nodes.map((n) => n.data.node), [nodes]);
  const selectedNode = useMemo(
    () => allNodes.find((n) => n.id === selectedId) ?? null,
    [allNodes, selectedId],
  );

  const addNode = (type: BotNodeType) => {
    const node = makeNode(type, { x: 120 + Math.random() * 200, y: 80 + Math.random() * 300 });
    setNodes((nds) => [...nds, { id: node.id, type: "botNode", position: node.position!, data: { node } }]);
    setSelectedId(node.id);
  };

  const updateNode = useCallback(
    (updated: BotNode) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === updated.id ? { ...n, data: { node: updated } } : n)),
      );
    },
    [setNodes],
  );

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelectedId(null);
    },
    [setNodes, setEdges],
  );

  const onConnect = useCallback((c: Connection) => setEdges((eds) => addEdge(c, eds)), [setEdges]);

  // ---- AI generation ----
  async function generateWithAI() {
    if (!aiPrompt.trim()) return;
    if (nodes.length && !confirm("ИИ заменит текущую схему. Продолжить?")) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: aiPrompt.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Не удалось сгенерировать схему.");
        return;
      }
      const flow = graphToFlow(data.graph);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setSelectedId(null);
    } finally {
      setAiLoading(false);
    }
  }

  // ---- Token + deploy ----
  async function saveToken() {
    if (!tokenInput.trim()) return;
    const res = await fetch(`/api/bots/${botId}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tokenInput.trim() }),
    });
    if (res.ok) {
      setHasToken(true);
      setTokenInput("");
      alert("Токен сохранён (зашифрован).");
    } else {
      alert((await res.json()).error ?? "Ошибка сохранения токена.");
    }
  }

  async function deploy(action: "start" | "stop") {
    const res = await fetch(`/api/bots/${botId}/deploy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!res.ok) alert(data.error ?? "Ошибка деплоя.");
    setStatus(data.running ? "running" : "stopped");
    loadLogs();
  }

  async function loadLogs() {
    const res = await fetch(`/api/bots/${botId}/logs`);
    if (res.ok) {
      const data = await res.json();
      setStatus(data.running ? "running" : status === "error" ? "error" : "stopped");
      setLogs(data.logs);
    }
  }

  useEffect(() => {
    if (!loaded) return;
    loadLogs();
    const t = setInterval(loadLogs, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  return (
    <div className="flex h-screen flex-col">
      {/* Toolbar */}
      <header className="flex flex-wrap items-center gap-3 border-b border-neutral-800 px-4 py-2">
        <Link href="/dashboard" className="text-sm text-neutral-400 hover:text-white">
          ← Боты
        </Link>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm outline-none focus:border-brand"
        />
        <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs">
          {platform === "telegram" ? "Telegram" : "Discord"}
        </span>
        <span className="text-xs text-neutral-500">
          {saveState === "saving" ? "Сохранение…" : saveState === "saved" ? "Сохранено" : ""}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <span
            className={
              status === "running"
                ? "text-xs text-green-400"
                : status === "error"
                ? "text-xs text-red-400"
                : "text-xs text-neutral-500"
            }
          >
            ● {status}
          </span>
          {status === "running" ? (
            <button onClick={() => deploy("stop")} className="rounded-md border border-neutral-700 px-3 py-1 text-sm hover:bg-neutral-800">
              Остановить
            </button>
          ) : (
            <button
              onClick={() => deploy("start")}
              disabled={!hasToken}
              title={hasToken ? "" : "Сначала добавьте токен"}
              className="rounded-md bg-brand px-3 py-1 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
            >
              Запустить
            </button>
          )}
        </div>
      </header>

      {/* AI + token bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 bg-neutral-900/40 px-4 py-2">
        <input
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          placeholder="Опишите бота: «здоровается и показывает меню из 3 кнопок»"
          className="min-w-[280px] flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm outline-none focus:border-brand"
        />
        <button
          onClick={generateWithAI}
          disabled={aiLoading}
          className="rounded-md bg-pink-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-700 disabled:opacity-50"
        >
          {aiLoading ? "Генерирую…" : "✨ Собрать с ИИ"}
        </button>
        <div className="flex items-center gap-1">
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder={hasToken ? "Токен задан — заменить" : "Токен бота"}
            className="w-44 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm outline-none focus:border-brand"
          />
          <button onClick={saveToken} className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800">
            Сохранить токен
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex min-h-0 flex-1">
        {/* Palette */}
        <aside className="w-44 shrink-0 space-y-2 border-r border-neutral-800 p-3">
          <div className="text-xs font-semibold text-neutral-400">Блоки</div>
          {(Object.keys(NODE_CATALOG) as BotNodeType[]).map((type) => (
            <button
              key={type}
              onClick={() => addNode(type)}
              className="flex w-full items-center gap-2 rounded-md border border-neutral-800 px-2 py-1.5 text-left text-sm hover:bg-neutral-800"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: NODE_CATALOG[type].color }} />
              {NODE_CATALOG[type].label}
            </button>
          ))}
        </aside>

        {/* Canvas */}
        <div className="min-w-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes}
            fitView
            colorMode="dark"
          >
            <Background />
            <Controls />
            <MiniMap pannable className="!bg-neutral-900" />
          </ReactFlow>
        </div>

        {/* Properties */}
        <PropertiesPanel node={selectedNode} allNodes={allNodes} onChange={updateNode} onDelete={deleteNode} />
      </div>

      {/* Logs */}
      {logs.length > 0 && (
        <div className="max-h-32 overflow-y-auto border-t border-neutral-800 bg-black/40 px-4 py-2 font-mono text-xs">
          {logs.map((l) => (
            <div key={l.id} className={l.level === "error" ? "text-red-400" : "text-neutral-400"}>
              {new Date(l.createdAt).toLocaleTimeString()} · {l.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
