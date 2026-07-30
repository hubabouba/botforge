import { describe, expect, it } from "vitest";
import { startOutcome } from "@/hooks/useHostingStatus";
import type { DeploymentStatus } from "@/lib/hosting/types";

/**
 * The rule that decides whether a chime plays. Worth pinning down because both
 * ways of getting it wrong are quiet: a missing sound is invisible, and a
 * spurious one is the kind of thing people fix by muting the feature forever.
 */
describe("startOutcome", () => {
  it("reports success only when a start actually reached running", () => {
    expect(startOutcome("starting", "running")).toBe("success");
  });

  it.each<DeploymentStatus>(["crashed", "crash_looping", "stopped", "killed"])(
    "reports failure when a start ends in %s",
    (end) => {
      expect(startOutcome("starting", end)).toBe("failure");
    },
  );

  it("stays silent while the start is still in progress", () => {
    expect(startOutcome("starting", "starting")).toBeNull();
  });

  // The case that would make the feature obnoxious: opening the panel on an
  // already-running bot must not congratulate you for it.
  it("stays silent for a bot that was already running", () => {
    expect(startOutcome("running", "running")).toBeNull();
    expect(startOutcome(null, "running")).toBeNull();
  });

  // The user pressed Stop. They know.
  it("stays silent for a stop the user asked for", () => {
    expect(startOutcome("running", "stopping")).toBeNull();
    expect(startOutcome("stopping", "stopped")).toBeNull();
  });

  // A crash minutes into a healthy run is not a failed *start*. It belongs to
  // auto-restart, which announces itself in the log, and a chime here would
  // fire repeatedly through a crash loop.
  it("stays silent when a long-running bot crashes later", () => {
    expect(startOutcome("running", "crashed")).toBeNull();
    expect(startOutcome("crashed", "crash_looping")).toBeNull();
  });
});
