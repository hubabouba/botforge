import type { Edge, Node } from "@xyflow/react";
import type { BotGraph, BotNode, BotNodeType } from "@/lib/schema/types";

export type FlowNode = Node<{ node: BotNode }>;

let idCounter = 0;
export function newId(): string {
  idCounter += 1;
  return `n${Date.now().toString(36)}${idCounter}`;
}

/** Create a fresh node of the given type with sensible defaults. */
export function makeNode(type: BotNodeType, position: { x: number; y: number }): BotNode {
  const id = newId();
  switch (type) {
    case "trigger":
      return { id, type, position, trigger: "command", value: "start" };
    case "message":
      return { id, type, position, text: "Привет, {user.name}!" };
    case "buttons":
      return { id, type, position, text: "Выберите:", buttons: [] };
    case "condition":
      return { id, type, position, source: "message", operator: "contains", value: "" };
    case "ai_reply":
      return { id, type, position, systemPrompt: "Ты — дружелюбный помощник." };
    case "set_variable":
      return { id, type, position, name: "var", value: "" };
  }
}

/** Convert a stored BotGraph into React Flow nodes + edges. */
export function graphToFlow(graph: BotGraph): { nodes: FlowNode[]; edges: Edge[] } {
  const nodes: FlowNode[] = graph.nodes.map((n, i) => ({
    id: n.id,
    type: "botNode",
    position: n.position ?? { x: 250, y: i * 140 + 40 },
    data: { node: n },
  }));
  const edges: Edge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
  }));
  return { nodes, edges };
}

/** Convert the current React Flow state back into a storable BotGraph. */
export function flowToGraph(nodes: FlowNode[], edges: Edge[]): BotGraph {
  return {
    nodes: nodes.map((n) => ({ ...n.data.node, position: n.position })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
    })),
  };
}
