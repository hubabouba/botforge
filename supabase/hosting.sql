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
  last_accrued_at       timestamptz,             -- runtime metered up to here (Stage 2 accrual checkpoint)
  updated_at            timestamptz not null default now()
);

-- Stage 2 upgrade path: the table already exists on the live DB, so the new
-- accrual checkpoint has to be added explicitly too.
alter table public.project_deployments add column if not exists last_accrued_at timestamptz;

create index if not exists project_deployments_user_id_idx on public.project_deployments (user_id);
-- The reconcile cron scans for active runs + 'crashed' rows awaiting an
-- auto-restart; tiny table today, but the predicate is fixed and known, so
-- index it now rather than after it hurts.
drop index if exists project_deployments_active_idx;
create index if not exists project_deployments_active_idx
  on public.project_deployments (status)
  where status in ('starting', 'running', 'stopping', 'crashed');

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
  using ((select auth.uid()) = user_id);

-- project_logs: owner may read their logs (join back to projects, like
-- project_files). Inserts come from the internal logs route (admin client).
drop policy if exists "read own logs" on public.project_logs;
create policy "read own logs"
  on public.project_logs for select
  using (exists (select 1 from public.projects p where p.id = project_logs.project_id and p.user_id = (select auth.uid())));

-- hosting_usage: owner may read their budget (for a "used X of Y hours" UI).
-- Writes happen only via the reconcile job (admin client).
drop policy if exists "read own hosting usage" on public.hosting_usage;
create policy "read own hosting usage"
  on public.hosting_usage for select
  using ((select auth.uid()) = user_id);

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
-- bump_hosting_usage — atomically add metered runtime seconds to the caller's
-- current UTC month and return the new total. Called ONLY by the service-role
-- admin client (lazy reconcile + the reconcile cron); a plain UPDATE increment
-- is row-serialized by Postgres, so the two callers can never lose a write to
-- each other. Returns the month's running total so the caller can enforce the
-- plan budget without a second read.
-- ===========================================================================

create or replace function public.bump_hosting_usage(
  p_user_id uuid,
  p_seconds bigint
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month text := to_char((now() at time zone 'utc'), 'YYYY-MM');
  v_total bigint;
begin
  insert into public.hosting_usage (user_id, month, seconds_used, updated_at)
  values (p_user_id, v_month, greatest(p_seconds, 0), now())
  on conflict (user_id, month) do update
    set seconds_used = hosting_usage.seconds_used + greatest(excluded.seconds_used, 0),
        updated_at   = now()
  returning seconds_used into v_total;

  return v_total;
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
--            | "global_ceiling" | "budget_exhausted" | "already_running" }
-- ===========================================================================

-- Stage 2 changed the signature (added p_global_ceiling); CREATE OR REPLACE
-- would leave the old 4-arg overload behind, still granted — drop it explicitly.
drop function if exists public.begin_project_run(uuid, integer, bigint, text);

create or replace function public.begin_project_run(
  p_project_id             uuid,
  p_concurrent_limit       integer,   -- -1 = unlimited
  p_runtime_budget_seconds bigint,    -- -1 = unlimited
  p_run_token_hash         text,
  p_global_ceiling         integer default -1   -- max active machines across ALL users; -1 = unlimited
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

  -- Serialize ALL Starts platform-wide, then per-user. The global lock makes
  -- the global-ceiling count below race-free across different users (the
  -- per-user lock alone can't); Starts are rare enough that serializing them
  -- costs nothing. Both released automatically at transaction end.
  perform pg_advisory_xact_lock(hashtext('botforge_hosting_start'));
  perform pg_advisory_xact_lock(hashtext(v_user::text));

  if not exists (select 1 from public.projects p where p.id = p_project_id and p.user_id = v_user) then
    return jsonb_build_object('error', 'not_found');
  end if;

  -- Global machine ceiling: a blunt platform-wide cost/abuse cap, independent
  -- of any per-user plan limit. Counts every user's active slots.
  if p_global_ceiling is not null and p_global_ceiling >= 0 then
    select count(*) into v_running
    from public.project_deployments d
    where d.status in ('starting', 'running', 'stopping')
      and d.project_id <> p_project_id;
    if v_running >= p_global_ceiling then
      return jsonb_build_object('error', 'global_ceiling');
    end if;
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
    (project_id, user_id, status, run_token_hash, restart_count, last_start_attempt_at, last_started_at, last_accrued_at, updated_at)
  values
    (p_project_id, v_user, 'starting', p_run_token_hash, 0, now(), now(), now(), now())
  on conflict (project_id) do update
    set status                = 'starting',
        run_token_hash        = p_run_token_hash,
        restart_count         = 0,
        last_start_attempt_at = now(),
        last_started_at       = now(),
        last_accrued_at       = now(),   -- metering starts now; nothing before this run is billable
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
-- attempt_auto_restart — the background twin of begin_project_run for crash
-- recovery. Same transactional guards (platform + per-user advisory lock, global
-- ceiling, concurrency cap, monthly budget), but:
--   * caller identity is a PARAMETER (p_user_id), not auth.uid() — this runs
--     from the reconcile cron / status poll under the service-role client, where
--     auth.uid() is null;
--   * it only ever revives a row that is exactly 'crashed' (never 'stopped' /
--     'killed' / 'crash_looping' — a manual stop or an exhausted streak stays
--     put), so it can only continue an in-progress crash streak;
--   * it does NOT reset restart_count — the streak must survive the restart so
--     the MAX_AUTO_RESTARTS cap is measurable.
-- service_role only (like bump_hosting_usage): there's no auth.uid() ownership
-- check here, so it must be unreachable from any browser session.
--
-- Return shape (jsonb): { "ok": true } | { "error": "concurrent_limit" |
--   "global_ceiling" | "budget_exhausted" | "not_restartable" }
-- ===========================================================================

create or replace function public.attempt_auto_restart(
  p_user_id                uuid,
  p_project_id             uuid,
  p_concurrent_limit       integer,
  p_runtime_budget_seconds bigint,
  p_run_token_hash         text,
  p_global_ceiling         integer default -1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month   text := to_char((now() at time zone 'utc'), 'YYYY-MM');
  v_running integer;
  v_used    bigint;
  v_dep     public.project_deployments;
begin
  perform pg_advisory_xact_lock(hashtext('botforge_hosting_start'));
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  if p_global_ceiling is not null and p_global_ceiling >= 0 then
    select count(*) into v_running
    from public.project_deployments d
    where d.status in ('starting', 'running', 'stopping')
      and d.project_id <> p_project_id;
    if v_running >= p_global_ceiling then
      return jsonb_build_object('error', 'global_ceiling');
    end if;
  end if;

  if p_concurrent_limit is not null and p_concurrent_limit >= 0 then
    select count(*) into v_running
    from public.project_deployments d
    where d.user_id = p_user_id
      and d.project_id <> p_project_id
      and d.status in ('starting', 'running', 'stopping');
    if v_running >= p_concurrent_limit then
      return jsonb_build_object('error', 'concurrent_limit');
    end if;
  end if;

  if p_runtime_budget_seconds is not null and p_runtime_budget_seconds >= 0 then
    select coalesce(seconds_used, 0) into v_used
    from public.hosting_usage
    where user_id = p_user_id and month = v_month;
    if coalesce(v_used, 0) >= p_runtime_budget_seconds then
      return jsonb_build_object('error', 'budget_exhausted');
    end if;
  end if;

  -- Continue the streak: flip to 'starting' ONLY from 'crashed', keeping
  -- restart_count and last_crash_at (the WHERE also owner-scopes by p_user_id).
  update public.project_deployments as d
    set status                = 'starting',
        run_token_hash        = p_run_token_hash,
        last_start_attempt_at = now(),
        last_started_at       = now(),
        last_accrued_at       = now(),
        updated_at            = now()
  where d.project_id = p_project_id
    and d.user_id    = p_user_id
    and d.status     = 'crashed'
  returning * into v_dep;

  if v_dep.project_id is null then
    return jsonb_build_object('error', 'not_restartable');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- ===========================================================================
-- Grants — signed-in users only; anon/public get nothing.
-- ===========================================================================

-- trim_project_logs is a TRIGGER function — it must never be reachable as an
-- RPC by anyone. Triggers fire it regardless of EXECUTE grants, so revoking is
-- safe and clears the "public can execute SECURITY DEFINER function" advisor.
revoke all on function public.trim_project_logs()                                    from public, anon, authenticated;

-- bump_hosting_usage is for the service-role admin client ONLY (reconcile
-- paths) — no browser session may add or forge runtime charges.
revoke all on function public.bump_hosting_usage(uuid, bigint)                        from public, anon, authenticated;
grant execute on function public.bump_hosting_usage(uuid, bigint)                      to service_role;

-- attempt_auto_restart takes the user id as a parameter (no auth.uid() ownership
-- check), so it MUST be service-role only — never callable from a browser.
revoke all on function public.attempt_auto_restart(uuid, uuid, integer, bigint, text, integer) from public, anon, authenticated;
grant execute on function public.attempt_auto_restart(uuid, uuid, integer, bigint, text, integer) to service_role;

revoke all on function public.set_project_secret(uuid, text, text, text, integer)   from public, anon;
revoke all on function public.list_project_secret_names(uuid)                         from public, anon;
revoke all on function public.delete_project_secret(uuid, text)                       from public, anon;
revoke all on function public.begin_project_run(uuid, integer, bigint, text, integer) from public, anon;

grant execute on function public.set_project_secret(uuid, text, text, text, integer)  to authenticated;
grant execute on function public.list_project_secret_names(uuid)                       to authenticated;
grant execute on function public.delete_project_secret(uuid, text)                     to authenticated;
grant execute on function public.begin_project_run(uuid, integer, bigint, text, integer) to authenticated;
