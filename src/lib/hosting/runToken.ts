/**
 * Run-scoped tokens. Each run gets a fresh high-entropy token; the Machine holds
 * the raw token (as an env var) and uses it as a bearer credential on the
 * internal callback routes (fetch files, ship logs, report exit). We store only
 * its SHA-256 hash in project_deployments.run_token_hash — same "never store the
 * raw secret" principle as a password. A leaked token only exposes that one
 * project's own files and lets someone post fake logs for it, and it rotates on
 * every start.
 */
import { createHash, randomBytes } from "node:crypto";

export function generateRunToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRunToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
