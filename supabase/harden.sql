-- Botforge hardening pass — run once in Supabase → SQL Editor.
--
-- Three findings from the full audit, all confirmed against the live database
-- (pg_proc grants + the Supabase security advisor), none of them exploitable
-- across accounts today. They are closed here because each one is a step
-- someone would need on the way to something that is.

-- ===========================================================================
-- 1. trim_project_messages was reachable as an RPC — including by `anon`.
--
-- It's a TRIGGER function: sync.sql created it SECURITY DEFINER but never
-- revoked EXECUTE, so it sat on /rest/v1/rpc/trim_project_messages callable by
-- anyone, signed in or not. hosting.sql already does exactly this revoke for
-- trim_project_logs, with a comment explaining why; the newer copy just missed
-- it. Triggers fire regardless of EXECUTE grants, so revoking changes nothing
-- about how it actually runs.
-- ===========================================================================

revoke all on function public.trim_project_messages() from public, anon, authenticated;

-- The other two trigger functions are SECURITY INVOKER (they run as the caller,
-- so there's no privilege to borrow) but there's no reason for them to be part
-- of the public API either.
revoke all on function public.touch_project()               from public, anon, authenticated;
revoke all on function public.enforce_project_file_limit()  from public, anon, authenticated;

-- ===========================================================================
-- 2. begin_project_run took its own limits as parameters — from the browser.
--
-- It was granted to `authenticated`, which meant a signed-in user could call
-- /rest/v1/rpc/begin_project_run directly and pass p_concurrent_limit = -1,
-- p_runtime_budget_seconds = -1, p_global_ceiling = -1, skipping every plan cap
-- the Node route computes. Worse, p_run_token_hash was theirs to choose: setting
-- it mints a working credential for the internal callback routes
-- (/api/internal/hosting/{files,logs,exit}) without ever launching a machine.
--
-- Both are self-scoped today — the ownership check still holds, so it only
-- reaches their own project, and machines are only ever created by the server.
-- But "user picks the credential a trusted route accepts" is not a property to
-- leave lying around while ads bring in traffic.
--
-- Fix mirrors attempt_auto_restart, which already got this treatment: the
-- caller's identity becomes a parameter, and only service_role may execute.
-- The start route runs under the service-role client and has already verified
-- ownership through the RLS client before it gets here.
-- ===========================================================================

drop function if exists public.begin_project_run(uuid, integer, bigint, text, integer);

create or replace function public.begin_project_run(
  p_user_id                uuid,
  p_project_id             uuid,
  p_concurrent_limit       integer,   -- -1 = unlimited
  p_runtime_budget_seconds bigint,    -- -1 = unlimited
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
  if p_user_id is null then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  -- Serialize ALL Starts platform-wide, then per-user. The global lock makes
  -- the global-ceiling count below race-free across different users (the
  -- per-user lock alone can't); Starts are rare enough that serializing them
  -- costs nothing. Both released automatically at transaction end.
  perform pg_advisory_xact_lock(hashtext('botforge_hosting_start'));
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- Ownership is still checked here, not just in the route: this function
  -- bypasses RLS, so it must never take the project id on trust.
  if not exists (select 1 from public.projects p where p.id = p_project_id and p.user_id = p_user_id) then
    return jsonb_build_object('error', 'not_found');
  end if;

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

  insert into public.project_deployments as d
    (project_id, user_id, status, run_token_hash, restart_count, last_start_attempt_at, last_started_at, last_accrued_at, updated_at)
  values
    (p_project_id, p_user_id, 'starting', p_run_token_hash, 0, now(), now(), now(), now())
  on conflict (project_id) do update
    set status                = 'starting',
        run_token_hash        = p_run_token_hash,
        restart_count         = 0,
        last_start_attempt_at = now(),
        last_started_at       = now(),
        last_accrued_at       = now(),
        updated_at            = now()
    where d.status in ('stopped', 'crashed', 'crash_looping', 'killed')
  returning * into v_dep;

  if v_dep.project_id is null then
    return jsonb_build_object('error', 'already_running');
  end if;

  return jsonb_build_object('ok', true, 'status', v_dep.status);
end;
$$;

revoke all on function public.begin_project_run(uuid, uuid, integer, bigint, text, integer) from public, anon, authenticated;
grant execute on function public.begin_project_run(uuid, uuid, integer, bigint, text, integer) to service_role;

-- ===========================================================================
-- 3. Every internal callback did a sequential scan.
--
-- authenticateRun() looks a deployment up by run_token_hash on every single
-- log batch a running bot ships. There was no index on that column — fine at
-- one bot, not at a hundred. Partial (the column is null unless a run is live)
-- and unique, which also makes a duplicate hash impossible by construction.
-- ===========================================================================

create unique index if not exists project_deployments_run_token_hash_idx
  on public.project_deployments (run_token_hash)
  where run_token_hash is not null;
