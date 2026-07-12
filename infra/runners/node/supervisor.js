#!/usr/bin/env node
/**
 * Botforge Node bot runner — supervisor.
 *
 * This is OUR code, not the user's. It runs as PID 1 inside the Fly Machine and
 * is never editable by the user or the AI. Mirrors `../python/supervisor.py`'s
 * contract exactly (same env vars, same callback routes, same behavior) — this
 * is the Node/JS twin, used for Telegram bots written in Node (grammy) and all
 * Discord bots (discord.js). It:
 *
 *   1. pulls the project's files from the Botforge control plane (by run token),
 *   2. writes them to /app (never a .env — secrets arrive as real env vars),
 *   3. npm installs from package.json if present,
 *   4. execs the bot's entry file and streams its stdout/stderr back as logs,
 *   5. reports the process exit so the platform can mark the run crashed/stopped.
 *
 * Only Node's built-ins are used here (fetch, fs, path, child_process); the
 * bot's own dependencies are installed at runtime from its package.json.
 *
 * Contract (env vars injected by the start route):
 *   BOTFORGE_PUBLIC_URL  base URL of the Botforge app (e.g. https://botforge.app)
 *   BOTFORGE_RUN_TOKEN   run-scoped bearer token (authenticates the callbacks)
 *   BOTFORGE_ENTRY       entry file to run, e.g. "index.js"
 *   <secret keys>        e.g. DISCORD_TOKEN — the bot reads these from process.env
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const BASE = (process.env.BOTFORGE_PUBLIC_URL || "").replace(/\/$/, "");
const TOKEN = process.env.BOTFORGE_RUN_TOKEN || "";
const ENTRY = process.env.BOTFORGE_ENTRY || "index.js";
const APP_DIR = "/app";

const FLUSH_INTERVAL_MS = 1000; // pace between log flushes
const FLUSH_MAX_BATCH = 40; // cap lines per flush
const LINE_MAX = 2000; // truncate absurdly long lines
const LOG_QUEUE_MAX = 10000; // drop under extreme volume rather than block the bot

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function post(pathName, payload, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await fetch(`${BASE}${pathName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// Retried: a transient network blip at boot must not become a false "crash".
async function get(pathName, { timeoutMs = 30000, attempts = 3 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${BASE}${pathName}`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`GET ${pathName} -> ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await sleep(2000 * (i + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

// --- log shipping -----------------------------------------------------------

const logQueue = [];
let stopping = false;

function enqueue(stream, line) {
  if (logQueue.length >= LOG_QUEUE_MAX) return;
  logQueue.push({ stream, line: String(line).slice(0, LINE_MAX) });
}

/** Drains queued log lines to the control plane in small batches. Runs until
 * `stopping` is set AND the queue is empty — callers await this to flush. */
async function flusher() {
  for (;;) {
    const batch = logQueue.splice(0, FLUSH_MAX_BATCH);
    if (batch.length) {
      try {
        await post("/api/internal/hosting/logs", { lines: batch });
      } catch {
        /* never let logging failures kill the bot */
      }
    }
    if (stopping && logQueue.length === 0) return;
    await sleep(FLUSH_INTERVAL_MS);
  }
}

/** Buffers partial chunks and enqueues one log line per newline. */
function pump(stream, streamName) {
  let buf = "";
  stream.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      enqueue(streamName, buf.slice(0, idx));
      buf = buf.slice(idx + 1);
    }
  });
  stream.on("end", () => {
    if (buf) enqueue(streamName, buf);
  });
}

// --- system log helper (goes to the "system" stream) ------------------------

function system(msg) {
  post("/api/internal/hosting/logs", { lines: [{ stream: "system", line: msg }] }).catch(() => {});
  console.log(`[botforge] ${msg}`);
}

function reportExit(code) {
  return post("/api/internal/hosting/exit", { code }).catch(() => {});
}

// --- setup --------------------------------------------------------------

async function writeFiles() {
  const data = await get("/api/internal/hosting/files");
  const files = data.files || [];
  let written = 0;
  for (const f of files) {
    const filePath = f.path || "";
    const content = f.content || "";
    if (!filePath) continue;
    // Never materialize a .env — secrets are injected as real env vars, and a
    // stray dotenv file must not shadow or blank them.
    const base = filePath.split("/").pop();
    if (base === ".env" || base.startsWith(".env.")) continue;
    // Contain writes to APP_DIR (defensive against path traversal).
    const norm = path.normalize(path.join(APP_DIR, filePath));
    if (!norm.startsWith(APP_DIR + path.sep) && norm !== APP_DIR) continue;
    fs.mkdirSync(path.dirname(norm), { recursive: true });
    fs.writeFileSync(norm, content, "utf8");
    written += 1;
  }
  system(`Fetched ${written} file(s).`);
}

function installDependencies() {
  const pkgPath = path.join(APP_DIR, "package.json");
  if (!fs.existsSync(pkgPath)) return;
  system("Installing dependencies…");
  const result = spawnSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund"], {
    cwd: APP_DIR,
    encoding: "utf8",
  });
  for (const line of (result.stdout || "").split("\n").slice(-40)) if (line) enqueue("system", line);
  if (result.status !== 0) {
    for (const line of (result.stderr || "").split("\n").slice(-40)) if (line) enqueue("stderr", line);
    throw new Error(`npm install failed (exit ${result.status})`);
  }
}

async function main() {
  if (!BASE || !TOKEN) {
    console.error("[botforge] missing BOTFORGE_PUBLIC_URL / BOTFORGE_RUN_TOKEN");
    process.exit(2);
  }

  const flushDone = flusher();

  try {
    await writeFiles();
    installDependencies();
  } catch (e) {
    system(`Startup failed: ${e.message}`);
    stopping = true;
    await flushDone;
    await reportExit(1);
    process.exit(1);
  }

  const entryPath = path.join(APP_DIR, ENTRY);
  if (!fs.existsSync(entryPath)) {
    system(`Entry file '${ENTRY}' not found.`);
    stopping = true;
    await flushDone;
    await reportExit(1);
    process.exit(1);
  }

  system(`Starting: node ${ENTRY}`);
  // The bot only gets its own secrets. The platform's callback credentials
  // (BOTFORGE_RUN_TOKEN etc.) stay with the supervisor — user/AI code must
  // never be able to read or reuse them.
  const childEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith("BOTFORGE_")) childEnv[k] = v;
  }

  const child = spawn(process.execPath, [ENTRY], {
    cwd: APP_DIR,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  pump(child.stdout, "stdout");
  pump(child.stderr, "stderr");

  const code = await new Promise((resolve) => {
    child.on("close", (exitCode) => resolve(exitCode ?? 0));
  });
  system(`Process exited with code ${code}.`);

  stopping = true;
  await flushDone;
  await reportExit(code);
  process.exit(code);
}

main();
