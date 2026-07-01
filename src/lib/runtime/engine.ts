import type { BotGraph, BotNode, ButtonDef } from "@/lib/schema/types";

/**
 * Platform-agnostic execution context. Telegram and Discord adapters implement
 * this interface; the engine only speaks in these abstract terms.
 */
export interface RuntimeContext {
  /** Text of the incoming message (empty for non-text events). */
  messageText: string;
  /** The command name if the update was a slash command (without the slash). */
  command?: string;
  user: { id: string; name: string };
  /** Per-user session variables (kept in memory by the runner). */
  vars: Record<string, string>;

  sendText(text: string): Promise<void>;
  /**
   * Send a prompt with buttons. Each button carries the id of the node to run
   * when the user taps it (payload); the adapter is responsible for routing the
   * tap back into the engine via `runNodeById`.
   */
  sendButtons(text: string, buttons: ButtonDef[]): Promise<void>;
  /** Generate a reply with Claude. Adapters/runner wire this to the AI layer. */
  aiReply(systemPrompt: string, userText: string): Promise<string>;
}

/** Substitute {user.name}, {user.id} and {vars.X} placeholders. */
export function render(text: string, ctx: RuntimeContext): string {
  return text
    .replace(/\{user\.name\}/g, ctx.user.name)
    .replace(/\{user\.id\}/g, ctx.user.id)
    .replace(/\{vars\.(\w+)\}/g, (_, k) => ctx.vars[k] ?? "");
}

function nodeById(graph: BotGraph, id?: string): BotNode | undefined {
  if (!id) return undefined;
  return graph.nodes.find((n) => n.id === id);
}

/** Resolve the next linear node via edges (first edge whose source is `id`). */
function linearNext(graph: BotGraph, id: string): BotNode | undefined {
  const edge = graph.edges.find((e) => e.source === id && !e.sourceHandle);
  return nodeById(graph, edge?.target);
}

function evalCondition(node: Extract<BotNode, { type: "condition" }>, ctx: RuntimeContext): boolean {
  const subject =
    node.source === "variable" ? ctx.vars[node.variable ?? ""] ?? "" : ctx.messageText;
  const target = node.value ?? "";
  switch (node.operator) {
    case "equals":
      return subject.trim().toLowerCase() === target.trim().toLowerCase();
    case "startsWith":
      return subject.trim().toLowerCase().startsWith(target.trim().toLowerCase());
    case "contains":
    default:
      return subject.toLowerCase().includes(target.toLowerCase());
  }
}

/**
 * Execute the graph starting at a specific node id. Used both for triggers
 * (start at the node after the trigger) and for button taps (start at the
 * node the button points to).
 */
export async function runNodeById(
  graph: BotGraph,
  startId: string | undefined,
  ctx: RuntimeContext,
  guard = 0,
): Promise<void> {
  const node = nodeById(graph, startId);
  if (!node || guard > 100) return; // guard against cycles

  switch (node.type) {
    case "trigger":
      await runNodeById(graph, linearNext(graph, node.id)?.id, ctx, guard + 1);
      return;

    case "message":
      await ctx.sendText(render(node.text, ctx));
      await runNodeById(graph, linearNext(graph, node.id)?.id, ctx, guard + 1);
      return;

    case "buttons":
      await ctx.sendButtons(render(node.text, ctx), node.buttons);
      // Buttons pause the flow; continuation happens when the user taps one.
      return;

    case "condition": {
      const branch = evalCondition(node, ctx) ? node.onTrue : node.onFalse;
      await runNodeById(graph, branch, ctx, guard + 1);
      return;
    }

    case "ai_reply": {
      const answer = await ctx.aiReply(node.systemPrompt, ctx.messageText);
      await ctx.sendText(answer);
      await runNodeById(graph, linearNext(graph, node.id)?.id, ctx, guard + 1);
      return;
    }

    case "set_variable":
      ctx.vars[node.name] = render(node.value, ctx);
      await runNodeById(graph, linearNext(graph, node.id)?.id, ctx, guard + 1);
      return;
  }
}

/**
 * Entry point for an incoming update. Finds the first matching trigger node and
 * runs the flow from there. Returns true if a trigger matched.
 */
export async function handleUpdate(graph: BotGraph, ctx: RuntimeContext): Promise<boolean> {
  const triggers = graph.nodes.filter(
    (n): n is Extract<BotNode, { type: "trigger" }> => n.type === "trigger",
  );

  // Prefer specific command/keyword matches over the catch-all "message".
  const ordered = [...triggers].sort((a, b) => (a.trigger === "message" ? 1 : 0) - (b.trigger === "message" ? 1 : 0));

  for (const t of ordered) {
    const matched =
      (t.trigger === "command" && ctx.command === t.value) ||
      (t.trigger === "keyword" && ctx.messageText.toLowerCase().includes(t.value.toLowerCase())) ||
      t.trigger === "message";
    if (matched) {
      await runNodeById(graph, t.id, ctx);
      return true;
    }
  }
  return false;
}
