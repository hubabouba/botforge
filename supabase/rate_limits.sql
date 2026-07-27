-- Botforge rate limits — run once in Supabase → SQL Editor.
--
-- Until now the only throttled thing in the product was assistant messages
-- (ai_usage.sql). Everything else a signed-in user can reach was unbounded,
-- including the two that cost real money per call:
--
--   * POST /api/hosting/projects/[id]/start — creates a Fly Machine. The plan's
--     concurrency cap limits how MANY run at once, not how FAST you can churn
--     them: start → stop → start in a loop bills machine-seconds and burns Fly
--     API quota, and Fly rate-limiting us would take hosting down for everyone,
--     not just the abuser.
--   * POST /api/checkout / billing-portal — creates Stripe sessions.
--
-- Plus /api/account/export, which runs one RPC per project and has no cap on a
-- Pro account's project count.
--
-- Same shape as increment_ai_usage: one atomic check-and-record in Postgres, so
-- two concurrent requests can't both slip through a read-then-write gap.

create table if not exists public.rate_limits (
  user_id      uuid not null references auth.users (id) on delete cascade,
  action       text not null,               -- e.g. 'hosting.start', 'checkout'
  window_start timestamptz not null default now(),
  count        integer not null default 0,
  primary key (user_id, action)
);

alter table public.rate_limits enable row level security;

-- No policies at all: this is bookkeeping the server does about you, not data
-- you own. RLS-on with zero policies denies every browser session outright, and
-- the only caller is the service-role client. (Same reasoning as
-- project_secrets — the thing being protected is the enforcement itself.)

-- ---------------------------------------------------------------------------
-- consume_rate_limit — record one attempt and say whether it's allowed.
--
-- Returns the remaining allowance in this window, or -1 when refused. The
-- window is fixed, not sliding: it starts on the first attempt and resets once
-- it has elapsed. Hammering while refused does NOT push the window out, so an
-- abuser can't lock themselves out longer than the window by trying harder —
-- window_start is only ever moved when the previous one has genuinely expired.
--
-- service_role only. It takes the user id as a parameter (no auth.uid()), so
-- exactly like attempt_auto_restart it must be unreachable from a browser —
-- otherwise the caller could spend someone else's allowance.
-- ---------------------------------------------------------------------------

create or replace function public.consume_rate_limit(
  p_user_id        uuid,
  p_action         text,
  p_max            integer,
  p_window_seconds integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.rate_limits;
begin
  if p_user_id is null or p_max <= 0 or coalesce(btrim(p_action), '') = '' then
    return -1;
  end if;

  insert into public.rate_limits as r (user_id, action, window_start, count)
  values (p_user_id, p_action, v_now, 1)
  on conflict (user_id, action) do update
    set count = case
          when r.window_start < v_now - make_interval(secs => p_window_seconds) then 1
          else r.count + 1
        end,
        window_start = case
          when r.window_start < v_now - make_interval(secs => p_window_seconds) then v_now
          else r.window_start
        end
  returning * into v_row;

  if v_row.count > p_max then
    return -1;
  end if;
  return p_max - v_row.count;
end;
$$;

revoke all on function public.consume_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(uuid, text, integer, integer) to service_role;
