/**
 * The build plan is a single string (persisted in `projects.plan`), so anything
 * the planner has to remember travels inside it. Two HTML-comment blocks carry
 * that bookkeeping and are stripped before the plan is shown or sent to a model:
 *
 *   <!--gaps-->  what the last review pass found still missing
 *   <!--done-->  which steps are finished
 *
 * Ticked steps used to be React state inside PlanningPanel, which meant a switch
 * to the Code tab silently unticked everything — the same bug the plan text
 * itself had before it moved out of that component.
 */

export const GAPS_MARKER = "<!--gaps-->";
export const DONE_MARKER = "<!--done-->";

/**
 * The plan prompt asks for a numbered list, so this reads the format we
 * requested. A plan that comes back as prose simply yields no steps and renders
 * as prose — no checklist, which is fine.
 */
const STEP_RE = /^\s*(\d+)[.)]\s+(.+)$/;
const MERMAID_RE = /```mermaid\s*([\s\S]*?)```/i;

export interface ParsedPlan {
  /** The plan as stored, minus the done block — markers still in place. */
  body: string;
  /** `body` with every marker stripped: the plan as a person should read it. */
  clean: string;
  /** Mermaid source, when the plan carries a diagram. */
  diagram: string | null;
  /** `clean` minus the diagram — the prose and the numbered steps. */
  text: string;
  /** Steps in plan order. */
  steps: string[];
  /** Steps already built, keyed by their own text (numbering shifts, text doesn't). */
  done: Set<string>;
}

function cut(s: string, marker: string): [string, string] {
  const i = s.indexOf(marker);
  return i === -1 ? [s, ""] : [s.slice(0, i), s.slice(i + marker.length)];
}

function parseSteps(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.match(STEP_RE)?.[2]?.trim())
    .filter((s): s is string => !!s && s.length > 3);
}

export function parsePlan(raw: string): ParsedPlan {
  const [beforeDone, afterDone] = cut(raw, DONE_MARKER);
  const body = beforeDone.trimEnd();
  const done = new Set(
    afterDone
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );
  // The gaps marker goes, its content stays: those findings are real steps.
  const clean = body.split(GAPS_MARKER).join("").trim();
  const m = clean.match(MERMAID_RE);
  const text = (m ? clean.replace(m[0], "") : clean).trim();
  return { body, clean, diagram: m ? m[1].trim() : null, text, steps: parseSteps(text), done };
}

/** Re-encode a plan with a new done set. An empty set writes no marker at all. */
export function withDone(raw: string, done: Iterable<string>): string {
  const body = cut(raw, DONE_MARKER)[0].trimEnd();
  const list = [...done].map((s) => s.trim()).filter(Boolean);
  return list.length ? `${body}\n\n${DONE_MARKER}\n${list.join("\n")}` : body;
}

/** Fold a review pass's findings back in as further steps, keeping ticks intact. */
export function mergeGaps(raw: string, gaps: string, heading: string): string {
  const { body, done } = parsePlan(raw);
  const base = cut(body, GAPS_MARKER)[0].trimEnd();
  return withDone(`${base}\n\n${GAPS_MARKER}\n${heading}\n${gaps.trim()}`, done);
}

/**
 * What the assistant sees. The markers are noise to it, but which steps are
 * already built is real context — without it a run redoes work it just finished.
 */
export function planForModel(raw: string): string {
  const { clean, done, steps } = parsePlan(raw);
  const built = steps.filter((s) => done.has(s));
  if (!built.length) return clean;
  return `${clean}\n\nAlready built — do not redo these:\n${built.map((s) => `- ${s}`).join("\n")}`;
}
