import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";

// A valid 32-byte base64 key must exist before the crypto calls (loadKey reads
// it per call, so setting it here covers the whole file).
process.env.HOSTING_SECRETS_KEY = randomBytes(32).toString("base64");

import { encryptSecret, decryptSecret, HOSTING_KEY_VERSION } from "@/lib/hosting/secrets";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips plaintext, including unicode and empty strings", () => {
    for (const plain of ["8123:AAExxx-token", "пароль", "", "x".repeat(4096)]) {
      expect(decryptSecret(encryptSecret(plain))).toBe(plain);
    }
  });

  it("uses a fresh nonce every time (no deterministic ciphertext reuse)", () => {
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("stamps the current key version", () => {
    expect(encryptSecret("v").keyVersion).toBe(HOSTING_KEY_VERSION);
  });

  it("rejects a tampered ciphertext (GCM auth failure)", () => {
    const enc = encryptSecret("secret");
    const bytes = Buffer.from(enc.ciphertext, "base64");
    bytes[0] ^= 0xff; // flip a bit
    expect(() => decryptSecret({ ...enc, ciphertext: bytes.toString("base64") })).toThrow();
  });

  it("rejects an unknown key version without touching the key", () => {
    const enc = encryptSecret("secret");
    expect(() => decryptSecret({ ...enc, keyVersion: 999 })).toThrow(/version/i);
  });

  it("rejects a blob decrypted under a different key", () => {
    const enc = encryptSecret("secret");
    const original = process.env.HOSTING_SECRETS_KEY;
    process.env.HOSTING_SECRETS_KEY = randomBytes(32).toString("base64");
    try {
      expect(() => decryptSecret(enc)).toThrow();
    } finally {
      process.env.HOSTING_SECRETS_KEY = original;
    }
  });
});
