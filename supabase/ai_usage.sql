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
  using (auth.uid() = user_id);

-- Atomic "check limit and increment" for the calling user (auth.uid()).
-- Returns the new count for today, or -1 when the daily limit is reached.
-- SECURITY DEFINER lets it write past RLS; the user id comes from the JWT,
-- so a caller can only ever touch their own row (and only increase it).
create or replace function public.increment_ai_usage(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_day   date := (now() at time zone 'utc')::date;
  v_count integer;
begin
  if v_user is null or p_limit <= 0 then
    return -1;
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

revoke all on function public.increment_ai_usage(integer) from public, anon;
grant execute on function public.increment_ai_usage(integer) to authenticated;
