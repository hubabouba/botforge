import { describe, expect, it } from "vitest";
import { DONE_MARKER, GAPS_MARKER, mergeGaps, parsePlan, planForModel, withDone } from "@/lib/workspace/plan";

const PLAN = `\`\`\`mermaid
flowchart TD
A[User] --> B[Bot]
\`\`\`

1. Create the bot entrypoint in main.py
2. Add a /start handler in handlers.py
3. Wire the token in from the environment`;

describe("parsePlan", () => {
  it("splits the diagram from the steps", () => {
    const p = parsePlan(PLAN);
    expect(p.diagram).toContain("flowchart TD");
    expect(p.text).not.toContain("mermaid");
    expect(p.steps).toHaveLength(3);
    expect(p.steps[1]).toBe("Add a /start handler in handlers.py");
  });

  it("reads back the ticks it wrote", () => {
    const encoded = withDone(PLAN, ["Create the bot entrypoint in main.py"]);
    const p = parsePlan(encoded);
    expect(p.done.has("Create the bot entrypoint in main.py")).toBe(true);
    expect(p.done.has("Wire the token in from the environment")).toBe(false);
    // Ticking a step must not disturb the plan a person reads.
    expect(p.steps).toEqual(parsePlan(PLAN).steps);
    expect(p.clean).not.toContain(DONE_MARKER);
  });

  it("treats a prose plan as a plan with no steps", () => {
    const p = parsePlan("Just build a bot that does the thing.");
    expect(p.steps).toEqual([]);
    expect(p.diagram).toBeNull();
  });

  it("survives an empty plan", () => {
    const p = parsePlan("");
    expect(p.steps).toEqual([]);
    expect(p.done.size).toBe(0);
    expect(p.clean).toBe("");
  });
});

describe("withDone", () => {
  it("replaces the previous ticks rather than stacking them", () => {
    const once = withDone(PLAN, ["a"]);
    const twice = withDone(once, ["a", "b"]);
    expect(twice.split(DONE_MARKER)).toHaveLength(2);
    expect(parsePlan(twice).done.size).toBe(2);
  });

  it("writes no marker at all for an empty set", () => {
    expect(withDone(withDone(PLAN, ["a"]), [])).not.toContain(DONE_MARKER);
  });
});

describe("mergeGaps", () => {
  it("keeps ticks when a review pass folds its findings in", () => {
    const ticked = withDone(PLAN, ["Create the bot entrypoint in main.py"]);
    const merged = mergeGaps(ticked, "1. Nothing handles errors", "Still to do:");
    const p = parsePlan(merged);
    expect(p.done.has("Create the bot entrypoint in main.py")).toBe(true);
    expect(p.steps).toContain("Nothing handles errors");
  });

  it("replaces the previous findings instead of appending a second block", () => {
    const first = mergeGaps(PLAN, "1. Missing error handling", "Still to do:");
    const second = mergeGaps(first, "1. Missing tests", "Still to do:");
    expect(second.split(GAPS_MARKER)).toHaveLength(2);
    expect(second).not.toContain("Missing error handling");
  });
});

describe("planForModel", () => {
  it("strips the bookkeeping and names what's already built", () => {
    const ticked = withDone(PLAN, ["Create the bot entrypoint in main.py"]);
    const out = planForModel(mergeGaps(ticked, "1. Missing tests", "Still to do:"));
    expect(out).not.toContain(DONE_MARKER);
    expect(out).not.toContain(GAPS_MARKER);
    // The gaps themselves are real remaining steps and must survive.
    expect(out).toContain("Missing tests");
    expect(out).toContain("Already built");
    expect(out).toContain("Create the bot entrypoint in main.py");
  });

  it("says nothing about finished steps when none are", () => {
    expect(planForModel(PLAN)).not.toContain("Already built");
  });
});
