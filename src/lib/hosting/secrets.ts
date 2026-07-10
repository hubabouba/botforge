/**
 * Encryption for bot secrets (tokens/API keys) at rest — AES-256-GCM.
 *
 * A bot token must NEVER live in `project_files` (that whole table is dumped
 * into the AI assistant's system prompt, so it would leak into every future
 * Claude/Gemini request and the providers' logs). Instead the token is
 * encrypted here the instant it reaches the server and only the ciphertext is
 * stored (in `project_secrets`). Decryption happens in exactly one place — the
 * trusted run-start route, via the service-role admin client — right before the
 * value is injected into the bot's Fly Machine as an env var.
 *
 * Key: `HOSTING_SECRETS_KEY`, 32 random bytes base64 (`openssl rand -base64 32`),
 * set in Vercel Production only. `keyVersion` is stored per row so the key can
 * be rotated later without a synchronous mass re-encrypt (new writes use the
 * current version; old rows can be lazily re-wrapped).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Current key version. Bump when HOSTING_SECRETS_KEY is rotated. */
export const HOSTING_KEY_VERSION = 1;

const GCM_TAG_BYTES = 16;
const GCM_IV_BYTES = 12;

function loadKey(): Buffer {
  const raw = process.env.HOSTING_SECRETS_KEY;
  if (!raw) throw new Error("HOSTING_SECRETS_KEY is not set.");
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new Error("HOSTING_SECRETS_KEY is not valid base64.");
  }
  if (key.length !== 32) {
    throw new Error("HOSTING_SECRETS_KEY must decode to 32 bytes (use `openssl rand -base64 32`).");
  }
  return key;
}

export interface EncryptedSecret {
  /** base64( ciphertext || 16-byte GCM auth tag ). */
  ciphertext: string;
  /** base64 12-byte random IV/nonce (unique per write). */
  nonce: string;
  /** Which HOSTING_SECRETS_KEY version encrypted this. */
  keyVersion: number;
}

/** Encrypt a plaintext secret. Throws if the key is missing/misconfigured. */
export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = loadKey();
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([body, tag]).toString("base64"),
    nonce: iv.toString("base64"),
    keyVersion: HOSTING_KEY_VERSION,
  };
}

/**
 * Decrypt a secret produced by {@link encryptSecret}. Throws on a bad key, a
 * tampered blob (GCM auth failure), or an unknown key version. Only ever called
 * from the trusted run-start path.
 */
export function decryptSecret(enc: EncryptedSecret): string {
  if (enc.keyVersion !== HOSTING_KEY_VERSION) {
    throw new Error(`Unknown HOSTING_SECRETS_KEY version ${enc.keyVersion}.`);
  }
  const key = loadKey();
  const iv = Buffer.from(enc.nonce, "base64");
  const packed = Buffer.from(enc.ciphertext, "base64");
  if (packed.length < GCM_TAG_BYTES) throw new Error("Ciphertext too short.");
  const tag = packed.subarray(packed.length - GCM_TAG_BYTES);
  const body = packed.subarray(0, packed.length - GCM_TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

/** True when HOSTING_SECRETS_KEY is present and well-formed (32 bytes base64). */
export function hostingSecretsConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}
