import { describe, expect, it } from "vitest";
import { rateLimitMessage } from "@/lib/rateLimit";

// allowAction talks to Postgres, so it isn't unit-testable without a database.
// What is worth pinning here is that every action has a message a person can
// act on — a bare "too many requests" on the Start button would leave someone
// staring at a bot that won't boot with no idea why.
describe("rateLimitMessage", () => {
  it("tells the user what to do, for every action", () => {
    for (const action of ["hosting.start", "hosting.secret", "checkout", "billing.portal", "account.export"] as const) {
      const msg = rateLimitMessage(action);
      expect(msg.length).toBeGreaterThan(20);
      expect(msg).toMatch(/wait/i);
    }
  });

  it("says something specific for the two that need it", () => {
    expect(rateLimitMessage("hosting.start")).toMatch(/logs/i);
    expect(rateLimitMessage("account.export")).toMatch(/export/i);
  });
});
