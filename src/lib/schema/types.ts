import { z } from "zod";

/**
 * Bot graph schema — the single source of truth shared by:
 *  - the visual editor (React Flow nodes/edges),
 *  - the runtime engine (interpreter),
 *  - the AI generator (Claude must return JSON matching this).
 *
 * A bot is a directed graph. Execution starts at a `trigger` node and follows
 * edges to child nodes. The same abstract graph runs on Telegram and Discord;
 * platform adapters translate each node into concrete API calls.
 */

export const platformSchema = z.enum(["telegram", "discord"]);
export type Platform = z.infer<typeof platformSchema>;

// A single inline button. `next` points to the id of the node to run when tapped.
export const buttonSchema = z.object({
  label: z.string().min(1),
  next: z.string().optional(),
});
export type ButtonDef = z.infer<typeof buttonSchema>;

// Canvas coordinates for the visual editor. Ignored by the runtime engine.
export const positionSchema = z.object({ x: z.number(), y: z.number() }).optional();

// ---- Node data payloads (discriminated by `type`) ----

export const triggerNodeSchema = z.object({
  id: z.string(),
  type: z.literal("trigger"),
  position: positionSchema,
  // "command": matches a slash command (e.g. "start"); "message": any message;
  // "keyword": message containing `value`.
  trigger: z.enum(["command", "message", "keyword"]).default("command"),
  value: z.string().default("start"),
});

export const messageNodeSchema = z.object({
  id: z.string(),
  type: z.literal("message"),
  position: positionSchema,
  // Text with placeholders like {user.name} and {vars.foo}.
  text: z.string().default(""),
});

export const buttonsNodeSchema = z.object({
  id: z.string(),
  type: z.literal("buttons"),
  position: positionSchema,
  text: z.string().default("Choose an option:"),
  buttons: z.array(buttonSchema).default([]),
});

export const conditionNodeSchema = z.object({
  id: z.string(),
  type: z.literal("condition"),
  position: positionSchema,
  // Compare the incoming message text (or a variable) against `value`.
  source: z.enum(["message", "variable"]).default("message"),
  variable: z.string().optional(),
  operator: z.enum(["equals", "contains", "startsWith"]).default("contains"),
  value: z.string().default(""),
  // Ids of the next node for the true/false branch.
  onTrue: z.string().optional(),
  onFalse: z.string().optional(),
});

export const aiReplyNodeSchema = z.object({
  id: z.string(),
  type: z.literal("ai_reply"),
  position: positionSchema,
  // System prompt describing how the AI should answer the user.
  systemPrompt: z.string().default("You are a helpful assistant."),
});

export const setVariableNodeSchema = z.object({
  id: z.string(),
  type: z.literal("set_variable"),
  position: positionSchema,
  name: z.string().default("var"),
  value: z.string().default(""),
});

export const botNodeSchema = z.discriminatedUnion("type", [
  triggerNodeSchema,
  messageNodeSchema,
  buttonsNodeSchema,
  conditionNodeSchema,
  aiReplyNodeSchema,
  setVariableNodeSchema,
]);
export type BotNode = z.infer<typeof botNodeSchema>;
export type BotNodeType = BotNode["type"];

// ---- Edges: linear "next" links between nodes (branch links live on nodes) ----
export const edgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  // Optional handle to distinguish branch outputs (e.g. condition true/false).
  sourceHandle: z.string().nullish(),
});
export type BotEdge = z.infer<typeof edgeSchema>;

export const botGraphSchema = z.object({
  nodes: z.array(botNodeSchema).default([]),
  edges: z.array(edgeSchema).default([]),
});
export type BotGraph = z.infer<typeof botGraphSchema>;

export const emptyGraph: BotGraph = { nodes: [], edges: [] };

/** Safely parse a graph coming from the DB or AI; returns empty graph on failure. */
export function parseGraph(raw: unknown): BotGraph {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return emptyGraph;
    }
  }
  const result = botGraphSchema.safeParse(raw);
  return result.success ? result.data : emptyGraph;
}

/** Human-readable metadata for the editor palette. */
export const NODE_CATALOG: Record<
  BotNodeType,
  { label: string; description: string; color: string }
> = {
  trigger: {
    label: "Триггер",
    description: "Начало сценария: команда, любое сообщение или ключевое слово",
    color: "#22c55e",
  },
  message: {
    label: "Сообщение",
    description: "Отправить текст пользователю",
    color: "#3b82f6",
  },
  buttons: {
    label: "Кнопки",
    description: "Показать кнопки-варианты, ведущие к другим блокам",
    color: "#a855f7",
  },
  condition: {
    label: "Условие",
    description: "Ветвление по тексту сообщения или переменной",
    color: "#f59e0b",
  },
  ai_reply: {
    label: "ИИ-ответ",
    description: "Ответ, сгенерированный Claude по заданному промпту",
    color: "#ec4899",
  },
  set_variable: {
    label: "Переменная",
    description: "Сохранить значение в переменную сессии",
    color: "#14b8a6",
  },
};
