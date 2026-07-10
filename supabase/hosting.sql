-- Botforge bot hosting ("Real Run") — run once in Supabase → SQL Editor
-- (like subscriptions.sql / ai_usage.sql / projects.sql).
--
-- Backs the feature that actually runs a user's Telegram/Discord bot on
-- Botforge infrastructure (Fly.io Machines). Four tables:
--   project_secrets      — encrypted bot tokens, NEVER selectable by the client
--   project_deployments  — one row per project: current run state
--   project_logs         — append-only, ring-buffered stdout/stderr
--   hosting_usage        — per-user monthly runtime budget counter
--
-- Security model mirrors the rest of the app: RLS everywhere; users read their
-- own rows; privileged writes go through SECURITY DEFINER functions self-scoped
-- by auth.uid() (like increment_ai_usage) or through the service-role admin
-- client (like the Stripe webhook). Ciphertext is the one thing NOTHING exposes
-- to a browser session — only the trusted start route (admin client) reads it.

-- ===========================================================================
-- Tables
-- ===========================================================================

-- Encrypted per-project secrets (bot token + any extra keys the bot needs).
-- Ciphertext/nonce are produced by src/lib/hosting/secrets.ts (AES-256-GCM)
-- BEFORE they ever reach the database — Postgres only stores opaque blobs.
create table if not exists public.project_secrets (
  project_id  uuid not null references public.projects (id) on delete cascade,
  key_name    text not null,                    -- e.g. TELEGRAM_TOKEN, DISCORD_TOKEN, OPENAI_API_KEY
  ciphertext  text not null,                    -- base64(ciphertext || 16-byte GCM tag)
  nonce       text not null,                    -- base64 12-byte IV
  key_version integer not null default 1,       -- lets HOSTING_SECRETS_KEY rotate without a mass re-encrypt
  updated_at  timestamptz not null default now(),
  primary key (project_id, key_name)
);

-- One deployment row per project. user_id is denormalized (set by
-- begin_project_run) so the concurrent-run count and monthly usage attribution
-- never need a join in the hot atomic path.
create table if not exists public.project_deployments (
  project_id            uuid primary key references public.projects (id) on delete cascade,
  user_id               uuid not null references auth.users (id) on delete cascade,
  status                text not null default 'stopped',   -- stopped|starting|running|stopping|crashed|crash_looping|killed
  provider              text not null default 'fly',
  provider_machine_id   text,
  region                text,
  restart_count         integer not null default 0,
  run_token_hash        text,                    -- sha-256 of the run-scoped bearer token (never the raw token)
  last_start_attempt_at timestamptz,
  last_started_at       timestamptz,
  last_stopped_at       timestamptz,
  last_crash_at         timestamptz,
  updated_at            timestamptz not null default now()
);

create index if not exists project_deployments_user_id_idx on public.project_deployments (user_id);

-- Append-only log ring buffer. bigint identity id doubles as the poll cursor.
create table if not exists public.project_logs (
  id         bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  stream     text not null default 'stdout',    -- stdout | stderr | system
  line       text not null,
  created_at timestamptz not null default now()
);

create index if not exists project_logs_project_id_id_idx on public.project_logs (project_id, id);

-- Per-user monthly runtime budget (seconds). Mirrors ai_usage but keyed by
-- calendar month and by account, not per project/day.
create table if not exists public.hosting_usage (
  user_id      uuid not null references auth.users (id) on delete cascade,
  month        text not null,                    -- 'YYYY-MM' (UTC)
  seconds_used bigint not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (user_id, month)
);

-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.project_secrets     enable row level security;
alter table public.project_deployments enable row level security;
alter table public.project_logs        enable row level security;
alter table public.hosting_usage       enable row level security;

-- project_secrets: DELIBERATELY no policy at all. Even ciphertext is never
-- selectable by an authenticated session — all access is through the SECURITY
-- DEFINER functions below (set/list-names/delete) or the service-role admin
-- client (decrypt on run start). RLS-on + zero policy = deny all to authenticated.

-- project_deployments: owner may read their run state; writes go through
-- begin_project_run (definer) or the admin client. No insert/update/delete policy.
drop policy if exists "read own deployments" on public.project_deployments;
create policy "read own deployments"
  on public.project_deployments for select
  using (auth.uid() = user_id);

-- project_logs: owner may read their logs (join back to projects, like
-- project_files). Inserts come from the internal logs route (admin client).
drop policy if exists "read own logs" on public.project_logs;
create policy "read own logs"
  on public.project_logs for select
  using (exists (select 1 from public.projects p where p.id = project_logs.project_id and p.user_id = auth.uid()));

-- hosting_usage: owner may read their budget (for a "used X of Y hours" UI).
-- Writes happen only via the reconcile job (admin client).
drop policy if exists "read own hosting usage" on public.hosting_usage;
create policy "read own hosting usage"
  on public.hosting_usage for select
  using (auth.uid() = user_id);

-- ===========================================================================
-- Log ring-buffer trim — keep only the newest N lines per project.
-- Row-level trigger, but gated by a modulo so the DELETE runs roughly once per
-- TRIM_EVERY inserts (amortized cheap); the cap is loose (LOG_CAP + a bit).
-- ===========================================================================

create or replace function public.trim_project_logs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap        constant integer := 2000;   -- lines retained per project
  v_trim_every constant integer := 100;    -- run the delete ~1 in N inserts
begin
  if (new.id % v_trim_every) = 0 then
    delete from public.project_logs
    where project_id = new.project_id
      and id <= (
        select id from public.project_logs
        where project_id = new.project_id
        order by id desc
        offset v_cap limit 1
      );
  end if;
  return null;
end;
$$;

drop trigger if exists trg_trim_project_logs on public.project_logs;
create trigger trg_trim_project_logs
  after insert on public.project_logs
  for each row execute function public.trim_project_logs();

-- ===========================================================================
-- Secret management — SECURITY DEFINER, self-scoped by auth.uid().
-- Encryption happens in the Node route BEFORE these are called; the DB only
-- ever sees ciphertext. list_project_secret_names returns names + dates ONLY,
-- never ciphertext, so there is no path for a client to read a secret back.
-- ===========================================================================

create or replace function public.set_project_secret(
  p_project_id  uuid,
  p_key_name    text,
  p_ciphertext  text,
  p_nonce       text,
  p_key_version integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return false;
  end if;
  if not exists (select 1 from public.projects p where p.id = p_project_id and p.user_id = v_user) then
    return false;
  end if;
  if coalesce(btrim(p_key_name), '') = '' then
    return false;
  end if;

  insert into public.project_secrets (project_id, key_name, ciphertext, nonce, key_version, updated_at)
  values (p_project_id, p_key_name, p_ciphertext, p_nonce, coalesce(p_key_version, 1), now())
  on conflict (project_id, key_name) do update
    set ciphertext = excluded.ciphertext,
        nonce = excluded.nonce,
        key_version = excluded.key_version,
        updated_at = now();

  return true;
end;
$$;

create or replace function public.list_project_secret_names(p_project_id uuid)
returns table (key_name text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return;
  end if;
  if not exists (select 1 from public.projects p where p.id = p_project_id and p.user_id = v_user) then
    return;
  end if;

  return query
    select s.key_name, s.updated_at
    from public.project_secrets s
    where s.project_id = p_project_id
    order by s.key_name;
end;
$$;

create or replace function public.delete_project_secret(
  p_project_id uuid,
  p_key_name   text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return false;
  end if;
  if not exists (select 1 from public.projects p where p.id = p_project_id and p.user_id = v_user) then
    return false;
  end if;

  delete from public.project_secrets
  where project_id = p_project_id and key_name = p_key_name;

  return true;
end;
$$;

-- ===========================================================================
-- begin_project_run — the one place a race actually matters (two Start clicks /
-- two tabs vs. "count my running bots"). One transaction: verify ownership,
-- check the plan concurrency cap against OTHER active deployments, check the
-- monthly runtime budget, and only then atomically reserve this project by
-- flipping it to 'starting' with a fresh run-token hash.
--
-- Limits come from TypeScript (plan.ts), same reasoning as create_project /
-- increment_ai_usage: plan resolution depends on env allow-lists Postgres can't
-- see. Pass -1 for "unlimited" (Pro). The Node route calls Fly ONLY after this
-- returns { ok: true }; if Fly then fails it compensates by setting status back
-- to 'stopped' via the admin client.
--
-- Return shape (jsonb):
--   { "ok": true, "status": "starting" }
--   { "error": "unauthorized" | "not_found" | "concurrent_limit"
--            | "budget_exhausted" | "already_running" }
-- ===========================================================================

create or replace function public.begin_project_run(
  p_project_id             uuid,
  p_concurrent_limit       integer,   -- -1 = unlimited
  p_runtime_budget_seconds bigint,    -- -1 = unlimited
  p_run_token_hash         text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_month   text := to_char((now() at time zone 'utc'), 'YYYY-MM');
  v_running integer;
  v_used    bigint;
  v_dep     public.project_deployments;
begin
  if v_user is null then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  -- Serialize this user's Starts: without it, two simultaneous requests for
  -- DIFFERENT projects both count 0 other active runs and both pass the cap
  -- (check-then-insert race). Released automatically at transaction end.
  perform pg_advisory_xact_lock(hashtext(v_user::text));

  if not exists (select 1 from public.projects p where p.id = p_project_id and p.user_id = v_user) then
    return jsonb_build_object('error', 'not_found');
  end if;

  -- Concurrency cap: count this user's OTHER bots that are already occupying a
  -- machine slot. This project's own row is excluded (it's the one we're about
  -- to (re)start); the per-project double-start guard is the ON CONFLICT WHERE below.
  if p_concurrent_limit is not null and p_concurrent_limit >= 0 then
    select count(*) into v_running
    from public.project_deployments d
    where d.user_id = v_user
      and d.project_id <> p_project_id
      and d.status in ('starting', 'running', 'stopping');
    if v_running >= p_concurrent_limit then
      return jsonb_build_object('error', 'concurrent_limit');
    end if;
  end if;

  -- Monthly runtime budget.
  if p_runtime_budget_seconds is not null and p_runtime_budget_seconds >= 0 then
    select coalesce(seconds_used, 0) into v_used
    from public.hosting_usage
    where user_id = v_user and month = v_month;
    if coalesce(v_used, 0) >= p_runtime_budget_seconds then
      return jsonb_build_object('error', 'budget_exhausted');
    end if;
  end if;

  -- Reserve. A brand-new project inserts straight to 'starting'; an existing row
  -- only flips if it's in a startable (not already-active) state — that WHERE is
  -- the double-start guard, and when it excludes the row RETURNING yields nothing.
  insert into public.project_deployments as d
    (project_id, user_id, status, run_token_hash, restart_count, last_start_attempt_at, last_started_at, updated_at)
  values
    (p_project_id, v_user, 'starting', p_run_token_hash, 0, now(), now(), now())
  on conflict (project_id) do update
    set status                = 'starting',
        run_token_hash        = p_run_token_hash,
        restart_count         = 0,
        last_start_attempt_at = now(),
        last_started_at       = now(),
        updated_at            = now()
    where d.status in ('stopped', 'crashed', 'crash_looping', 'killed')
  returning * into v_dep;

  if v_dep.project_id is null then
    return jsonb_build_object('error', 'already_running');
  end if;

  return jsonb_build_object('ok', true, 'status', v_dep.status);
end;
$$;

-- ===========================================================================
-- Grants — signed-in users only; anon/public get nothing.
-- ===========================================================================

-- trim_project_logs is a TRIGGER function — it must never be reachable as an
-- RPC by anyone. Triggers fire it regardless of EXECUTE grants, so revoking is
-- safe and clears the "public can execute SECURITY DEFINER function" advisor.
revoke all on function public.trim_project_logs()                                    from public, anon, authenticated;

revoke all on function public.set_project_secret(uuid, text, text, text, integer)   from public, anon;
revoke all on function public.list_project_secret_names(uuid)                         from public, anon;
revoke all on function public.delete_project_secret(uuid, text)                       from public, anon;
revoke all on function public.begin_project_run(uuid, integer, bigint, text)          from public, anon;

grant execute on function public.set_project_secret(uuid, text, text, text, integer)  to authenticated;
grant execute on function public.list_project_secret_names(uuid)                       to authenticated;
grant execute on function public.delete_project_secret(uuid, text)                     to authenticated;
grant execute on function public.begin_project_run(uuid, integer, bigint, text)        to authenticated;
