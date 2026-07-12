import { describe, expect, it } from "vitest";
import { generateRunToken, hashRunToken } from "@/lib/hosting/runToken";

describe("run tokens", () => {
  it("generates high-entropy, url-safe, unique tokens", () => {
    const a = generateRunToken();
    const b = generateRunToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, no padding
    expect(a.length).toBeGreaterThanOrEqual(43); // 32 bytes base64url
  });

  it("hashes deterministically to 64 hex chars (sha-256)", () => {
    const token = generateRunToken();
    expect(hashRunToken(token)).toBe(hashRunToken(token));
    expect(hashRunToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("different tokens hash differently", () => {
    expect(hashRunToken(generateRunToken())).not.toBe(hashRunToken(generateRunToken()));
  });
});
