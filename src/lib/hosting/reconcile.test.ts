import { afterEach, describe, expect, it } from "vitest";
import { mapFlyState } from "@/lib/hosting/deployments";
import { globalMachineCeiling } from "@/lib/hosting/config";

// The core state-transition table of reconcileWithFly. A wrong cell here
// either strands a live machine or (the phantom-crash bug) kills a healthy
// launch — every cell is worth pinning down.
describe("mapFlyState", () => {
  it("'started' is never a transition (promotion to running is setRunning's job)", () => {
    expect(mapFlyState("starting", "started")).toBeNull();
    expect(mapFlyState("running", "started")).toBeNull();
    expect(mapFlyState("stopping", "started")).toBeNull();
  });

  it("machine gone: clean stop when we were tearing down, crash otherwise", () => {
    for (const state of [null, "destroyed", "destroying"] as const) {
      expect(mapFlyState("stopping", state)).toBe("stopped");
      expect(mapFlyState("running", state)).toBe("crashed");
      expect(mapFlyState("starting", state)).toBe("crashed");
    }
  });

  it("machine stopped/suspended: process exited (restart.policy=no)", () => {
    for (const state of ["stopped", "suspended"] as const) {
      expect(mapFlyState("stopping", state)).toBe("stopped");
      expect(mapFlyState("running", state)).toBe("crashed");
    }
  });

  it("in-flight machine states never flip ours", () => {
    for (const state of ["created", "starting", "stopping", "replacing"] as const) {
      expect(mapFlyState("running", state)).toBeNull();
      expect(mapFlyState("starting", state)).toBeNull();
    }
  });
});

describe("globalMachineCeiling", () => {
  const ORIGINAL = process.env;
  afterEach(() => {
    process.env = ORIGINAL;
  });

  it("parses a valid integer, allows -1 (unlimited)", () => {
    process.env = { ...ORIGINAL, HOSTING_GLOBAL_MACHINE_CEILING: "5" };
    expect(globalMachineCeiling()).toBe(5);
    process.env = { ...ORIGINAL, HOSTING_GLOBAL_MACHINE_CEILING: "-1" };
    expect(globalMachineCeiling()).toBe(-1);
    process.env = { ...ORIGINAL, HOSTING_GLOBAL_MACHINE_CEILING: "0" };
    expect(globalMachineCeiling()).toBe(0);
  });

  it("falls back to the conservative default on garbage/absent values", () => {
    process.env = { ...ORIGINAL, HOSTING_GLOBAL_MACHINE_CEILING: "many" };
    expect(globalMachineCeiling()).toBe(20);
    process.env = { ...ORIGINAL, HOSTING_GLOBAL_MACHINE_CEILING: "-5" };
    expect(globalMachineCeiling()).toBe(20);
    process.env = { ...ORIGINAL, HOSTING_GLOBAL_MACHINE_CEILING: undefined };
    expect(globalMachineCeiling()).toBe(20);
  });
});
