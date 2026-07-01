"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NODE_CATALOG, type BotNode } from "@/lib/schema/types";

/** Short preview text shown inside a node on the canvas. */
function preview(node: BotNode): string {
  switch (node.type) {
    case "trigger":
      return node.trigger === "command" ? `/${node.value}` : node.trigger === "keyword" ? `«${node.value}»` : "любое сообщение";
    case "message":
      return node.text || "(пустое сообщение)";
    case "buttons":
      return `${node.buttons.length} кнопк(и): ${node.buttons.map((b) => b.label).join(", ")}`;
    case "condition":
      return `${node.source} ${node.operator} «${node.value}»`;
    case "ai_reply":
      return node.systemPrompt;
    case "set_variable":
      return `${node.name} = ${node.value}`;
  }
}

export default function BotFlowNode({ data, selected }: NodeProps) {
  const node = (data as { node: BotNode }).node;
  const meta = NODE_CATALOG[node.type];

  return (
    <div
      className="w-56 rounded-lg border bg-neutral-900 text-xs shadow-lg"
      style={{ borderColor: selected ? meta.color : "#3f3f46" }}
    >
      <Handle type="target" position={Position.Top} className="!bg-neutral-500" />
      <div
        className="rounded-t-lg px-3 py-1.5 font-semibold text-white"
        style={{ backgroundColor: meta.color }}
      >
        {meta.label}
      </div>
      <div className="line-clamp-3 px-3 py-2 text-neutral-300">{preview(node)}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-neutral-500" />
    </div>
  );
}
