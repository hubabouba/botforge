#!/usr/bin/env python3
"""
Botforge Python bot runner — supervisor.

This is OUR code, not the user's. It runs as PID 1 inside the Fly Machine and is
never editable by the user or the AI. It:

  1. pulls the project's files from the Botforge control plane (by run token),
  2. writes them to /app  (never a .env — secrets arrive as real env vars),
  3. installs requirements.txt if present,
  4. execs the bot's entry file and streams its stdout/stderr back as logs,
  5. reports the process exit so the platform can mark the run crashed/stopped.

Only the Python standard library is used here; the bot's own dependencies are
installed at runtime from its requirements.txt.

Contract (env vars injected by the start route):
  BOTFORGE_PUBLIC_URL  base URL of the Botforge app (e.g. https://botforge.app)
  BOTFORGE_RUN_TOKEN   run-scoped bearer token (authenticates the callbacks)
  BOTFORGE_ENTRY       entry file to run, e.g. "main.py"
  <secret keys>        e.g. TELEGRAM_TOKEN — the bot reads these from os.environ
"""
import json
import os
import queue
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

BASE = os.environ.get("BOTFORGE_PUBLIC_URL", "").rstrip("/")
TOKEN = os.environ.get("BOTFORGE_RUN_TOKEN", "")
ENTRY = os.environ.get("BOTFORGE_ENTRY", "main.py")
APP_DIR = "/app"

FLUSH_INTERVAL = 1.0      # seconds between log flushes
FLUSH_MAX_BATCH = 40      # or flush early once this many lines are queued
LINE_MAX = 2000           # truncate absurdly long lines


def _post(path: str, payload: dict, timeout: float = 15.0) -> bytes:
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _get(path: str, timeout: float = 30.0) -> dict:
    req = urllib.request.Request(
        f"{BASE}{path}",
        headers={"Authorization": f"Bearer {TOKEN}"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


# --- log shipping ---------------------------------------------------------

_log_q: "queue.Queue[dict]" = queue.Queue(maxsize=10000)
_stop = threading.Event()


def enqueue(stream: str, line: str) -> None:
    try:
        _log_q.put_nowait({"stream": stream, "line": line[:LINE_MAX]})
    except queue.Full:
        pass  # drop under extreme volume rather than block the bot


def flusher() -> None:
    """Drain queued log lines to the control plane in small batches."""
    while not _stop.is_set() or not _log_q.empty():
        batch = []
        deadline = time.time() + FLUSH_INTERVAL
        while len(batch) < FLUSH_MAX_BATCH and time.time() < deadline:
            try:
                batch.append(_log_q.get(timeout=0.2))
            except queue.Empty:
                if batch:
                    break
        if not batch:
            continue
        try:
            _post("/api/internal/hosting/logs", {"lines": batch})
        except Exception:
            pass  # never let logging failures kill the bot


def pump(pipe, stream: str) -> None:
    for raw in iter(pipe.readline, ""):
        enqueue(stream, raw.rstrip("\n"))
    pipe.close()


# --- system log helper (goes to the "system" stream) ----------------------

def system(msg: str) -> None:
    try:
        _post("/api/internal/hosting/logs", {"lines": [{"stream": "system", "line": msg}]})
    except Exception:
        pass
    print(f"[botforge] {msg}", flush=True)


def report_exit(code: int) -> None:
    try:
        _post("/api/internal/hosting/exit", {"code": code})
    except Exception:
        pass


# --- setup ----------------------------------------------------------------

def write_files() -> None:
    data = _get("/api/internal/hosting/files")
    files = data.get("files", [])
    written = 0
    for f in files:
        path = f.get("path", "")
        content = f.get("content", "")
        if not path:
            continue
        # Never materialize a .env — secrets are injected as real env vars, and a
        # stray dotenv file must not shadow or blank them.
        base = path.split("/")[-1]
        if base == ".env" or base.startswith(".env."):
            continue
        # Contain writes to APP_DIR (defensive against path traversal).
        norm = os.path.normpath(os.path.join(APP_DIR, path))
        if not norm.startswith(APP_DIR + os.sep) and norm != APP_DIR:
            continue
        os.makedirs(os.path.dirname(norm), exist_ok=True)
        with open(norm, "w", encoding="utf-8") as out:
            out.write(content)
        written += 1
    system(f"Fetched {written} file(s).")


def install_requirements() -> None:
    req = os.path.join(APP_DIR, "requirements.txt")
    if not os.path.exists(req):
        return
    system("Installing requirements…")
    proc = subprocess.run(
        [sys.executable, "-m", "pip", "install", "--no-cache-dir", "--disable-pip-version-check", "-r", req],
        cwd=APP_DIR, capture_output=True, text=True,
    )
    for line in (proc.stdout or "").splitlines()[-40:]:
        enqueue("system", line)
    if proc.returncode != 0:
        for line in (proc.stderr or "").splitlines()[-40:]:
            enqueue("stderr", line)
        raise RuntimeError(f"pip install failed (exit {proc.returncode})")


def main() -> int:
    if not BASE or not TOKEN:
        print("[botforge] missing BOTFORGE_PUBLIC_URL / BOTFORGE_RUN_TOKEN", file=sys.stderr, flush=True)
        return 2

    flush_thread = threading.Thread(target=flusher, daemon=True)
    flush_thread.start()

    try:
        write_files()
        install_requirements()
    except Exception as e:
        system(f"Startup failed: {e}")
        _stop.set()
        flush_thread.join(timeout=10)
        report_exit(1)
        return 1

    entry_path = os.path.join(APP_DIR, ENTRY)
    if not os.path.exists(entry_path):
        system(f"Entry file '{ENTRY}' not found.")
        _stop.set()
        flush_thread.join(timeout=10)
        report_exit(1)
        return 1

    system(f"Starting: python {ENTRY}")
    proc = subprocess.Popen(
        [sys.executable, "-u", ENTRY],
        cwd=APP_DIR,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, bufsize=1,
        env={**os.environ, "PYTHONUNBUFFERED": "1"},
    )
    t_out = threading.Thread(target=pump, args=(proc.stdout, "stdout"), daemon=True)
    t_err = threading.Thread(target=pump, args=(proc.stderr, "stderr"), daemon=True)
    t_out.start()
    t_err.start()

    code = proc.wait()
    t_out.join(timeout=5)
    t_err.join(timeout=5)
    system(f"Process exited with code {code}.")

    _stop.set()
    flush_thread.join(timeout=10)
    report_exit(code)
    return code


if __name__ == "__main__":
    sys.exit(main())
