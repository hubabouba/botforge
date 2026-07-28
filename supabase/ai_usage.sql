-- Botforge AI usage — run once in Supabase → SQL Editor (like subscriptions.sql).
-- Tracks how many assistant messages each user sent per UTC day, so the
-- /api/ai/chat route can enforce the per-plan daily cap (free 5 / basic 10 / pro 40).

create table if not exists public.ai_usage (
  user_id    uuid not null references auth.users (id) on delete cascade,
  day        date not null,
  count      integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;

-- A user may read their own usage (handy for showing "7/10 today" in the UI).
-- Writes happen only through the function below — no insert/update policy.
drop policy if exists "read own ai usage" on public.ai_usage;
create policy "read own ai usage"
  on public.ai_usage for select
  using ((select auth.uid()) = user_id);

-- Atomic "check limits and increment" for the calling user (auth.uid()).
-- Returns the new count for today, or -1 when EITHER cap is reached.
-- SECURITY DEFINER lets it write past RLS; the user id comes from the JWT,
-- so a caller can only ever touch their own row (and only increase it).
--
-- Two caps, because the daily one alone permits 30x its number per month and
-- model calls are what this product actually spends money on. p_monthly_limit
-- is a circuit-breaker against a single runaway account, not a quota anyone
-- normal will meet — see AI_MONTHLY_MESSAGES in lib/plan.ts. It defaults to -1
-- (off) so an older deployment calling this with one argument still works.
create or replace function public.increment_ai_usage(
  p_limit         integer,
  p_monthly_limit integer default -1
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_day   date := (now() at time zone 'utc')::date;
  v_month date := date_trunc('month', (now() at time zone 'utc'))::date;
  v_month_total bigint;
  v_count integer;
begin
  if v_user is null or p_limit <= 0 then
    return -1;
  end if;

  -- Month first: it's the cheaper refusal, and it makes the daily row's own
  -- count meaningless to check afterwards. Summed from the same per-day rows,
  -- so there's no second counter to keep in step.
  if p_monthly_limit is not null and p_monthly_limit >= 0 then
    select coalesce(sum(count), 0) into v_month_total
    from public.ai_usage
    where user_id = v_user and day >= v_month;
    if v_month_total >= p_monthly_limit then
      return -1;
    end if;
  end if;

  insert into public.ai_usage as u (user_id, day, count)
  values (v_user, v_day, 1)
  on conflict (user_id, day)
  do update set count = u.count + 1, updated_at = now()
  where u.count < p_limit
  returning u.count into v_count;

  return coalesce(v_count, -1);
end;
$$;

-- Sums are per user and per month; without this every check scans the table.
create index if not exists ai_usage_user_day_idx on public.ai_usage (user_id, day);

-- The old single-argument overload would otherwise linger, still granted, and
-- PostgREST would happily route a one-arg call to it — i.e. the monthly cap
-- silently not applying.
drop function if exists public.increment_ai_usage(integer);

revoke all on function public.increment_ai_usage(integer, integer) from public, anon;
grant execute on function public.increment_ai_usage(integer, integer) to authenticated;
