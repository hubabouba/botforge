import crypto from "node:crypto";

/**
 * AES-256-GCM encryption for bot tokens at rest. The key is derived from
 * AUTH_SECRET via scrypt so any length secret works. Format stored in the DB:
 *   <ivHex>:<authTagHex>:<cipherHex>
 */

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 8) {
    throw new Error("AUTH_SECRET is not set (or too short) — cannot encrypt tokens.");
  }
  // Static salt is acceptable here: the secret is the real entropy source.
  return crypto.scryptSync(secret, "botconstruct-token-salt", 32);
}

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptToken(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Malformed encrypted token.");
  }
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
