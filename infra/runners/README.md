# Botforge bot runners (Fly.io)

Generic container images that run a user's bot on Botforge hosting ("Real Run").
One image serves **any** user's bot of that language — the specific project's
source and dependencies are pulled and installed at runtime by the supervisor.
The user/AI never controls the image, its base, or its entrypoint; only the
application source the supervisor fetches.

Two runners, one Fly app (`FLY_APP_NAME`) — Machines pick an image by label at
create-time, so both languages share the same app:

```
infra/runners/python/
  Dockerfile      # python:3.12-slim, non-root, runs supervisor.py as PID 1
  supervisor.py   # OUR code: pulls files, pip installs, runs the bot, ships logs
  fly.toml        # the Fly app that owns per-bot Machines (no HTTP service)

infra/runners/node/
  Dockerfile      # node:20-slim, non-root, runs supervisor.js as PID 1
  supervisor.js   # same contract as supervisor.py — npm installs instead of pip
  fly.toml        # same Fly app, different image label
```

Platform/language combos hosting actually supports (`scaffold.ts` always
generates Discord bots as discord.js/Node — there's no Python+Discord combo):

| Platform | Language | Runner |
| --- | --- | --- |
| Telegram | Python | `python` |
| Telegram | Node (grammy) | `node` |
| Discord | Node (discord.js) | `node` |

## How a run works

1. The control plane (`/api/hosting/projects/[id]/start`) creates a Fly Machine
   from the project's language's image with env vars: `BOTFORGE_PUBLIC_URL`,
   `BOTFORGE_RUN_TOKEN`, `BOTFORGE_ENTRY`, plus the decrypted bot secrets (e.g.
   `TELEGRAM_TOKEN` / `DISCORD_TOKEN`).
2. The supervisor (PID 1) fetches the project files from
   `GET /api/internal/hosting/files` (Bearer = run token), writes them to `/app`
   (never a `.env`), installs dependencies (`pip install -r requirements.txt` or
   `npm install`), then execs the entry file and streams stdout/stderr to
   `POST /api/internal/hosting/logs`.
3. On process exit it calls `POST /api/internal/hosting/exit`, and the platform
   tears the Machine down. A crash is auto-restarted up to 3 times with backoff
   (Stage 2.5); after that it's `crash_looping` and the user presses Start.

## One-time setup (owner, ~15 min)

Prereq: [`flyctl`](https://fly.io/docs/flyctl/install/) installed and a Fly
account (the 7-day trial is fine).

```bash
fly auth login

# 1. Create the app that will own per-bot Machines (name is your choice):
fly apps create botforge-bots

# 2. Build & push each runner image to Fly's registry (no service is
#    released — we only need the images available to the Machines API):
cd infra/runners/python
fly deploy --build-only --push --image-label python
#   → pushes registry.fly.io/botforge-bots:python

cd ../node
fly deploy --build-only --push --image-label node
#   → pushes registry.fly.io/botforge-bots:node

# 3. Create an API token for the control plane (org-scoped):
fly tokens create org
#   → copy the printed token (starts with "FlyV1 …")
```

Only pushed one image label? The other language's hosting simply stays
unconfigured (`runnerImageFor` throws) — the rest keeps working; nothing else
in the app depends on both existing.

## Vercel env (Production only — never Preview)

| Variable | Value |
| --- | --- |
| `HOSTING_ENABLED` | `true` |
| `HOSTING_SECRETS_KEY` | output of `openssl rand -base64 32` (generate once) |
| `HOSTING_BETA_EMAILS` | your account email (Basic-tier override for free-plan testing — see below) |
| `FLY_API_TOKEN` | the `FlyV1 …` token from step 3 |
| `FLY_APP_NAME` | `botforge-bots` |
| `FLY_RUNNER_IMAGE_PYTHON` | `registry.fly.io/botforge-bots:python` |
| `FLY_RUNNER_IMAGE_NODE` | `registry.fly.io/botforge-bots:node` |
| `FLY_REGION` | e.g. `fra` (optional; defaults to the app's primary region) |
| `BOTFORGE_PUBLIC_URL` | your public site URL, e.g. `https://botforge-snowy.vercel.app` |
| `CRON_SECRET` | output of `openssl rand -base64 32` — auth for the reconcile cron (Stage 2) |
| `HOSTING_GLOBAL_MACHINE_CEILING` | max active Machines across ALL users (optional; defaults to 20, `-1` = unlimited) |

Redeploy Vercel after setting these. Until `HOSTING_ENABLED=true`, the feature
stays completely dark for everyone. Once it's on, access itself is a real plan
check — any Basic or Pro account can start a hosted run. `HOSTING_BETA_EMAILS`
is only an override so your own account can test hosting on a free plan
without a real Stripe subscription (it gets Basic's concurrency/budget numbers
instead of Free's zero).

## Reconcile cron (Stage 2)

`.github/workflows/hosting-reconcile.yml` POSTs
`/api/internal/hosting/reconcile` every 5 minutes: it heals state drift for
bots nobody is watching, accrues runtime into `hosting_usage`, and auto-stops
runs that used up their monthly budget. Set the **GitHub repo secret**
`CRON_SECRET` (Settings → Secrets and variables → Actions) to the **same
value** as the Vercel env var — the workflow is a no-op 401 otherwise. You can
trigger it manually from the Actions tab (workflow_dispatch) to test.

## Manual smoke test before wiring the UI (recommended)

The cheapest way to de-risk the whole pipeline is to launch one Machine by hand
and confirm a real bot answers, before trusting the control plane:

```bash
fly machine run registry.fly.io/botforge-bots:python \
  --app botforge-bots \
  --env BOTFORGE_PUBLIC_URL=https://<your-site> \
  --env BOTFORGE_RUN_TOKEN=<a run token from a real Start, or a DB row> \
  --env BOTFORGE_ENTRY=main.py
fly logs --app botforge-bots      # watch it fetch files, pip install, run
fly machine destroy <id> --force  # clean up
```

(Normally you never run this by hand — the Start button does it. It's only for
the first end-to-end validation.)
