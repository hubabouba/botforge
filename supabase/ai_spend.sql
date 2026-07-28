-- Botforge AI spend — run once in Supabase → SQL Editor.
--
-- The assistant already computed its own cost per request and wrote it to the
-- runtime log as `[ai/spend] {...}`. That turned out to be unusable in
-- practice: Vercel doesn't retain individual log lines long enough to read them
-- back, so the only way to see a number was to sit in the log viewer at the
-- exact moment someone sent a message. Measurement you can't retrieve isn't
-- measurement.
--
-- Which matters more than it sounds, because model calls are the dominant cost
-- in this product and none of the pricing decisions have real numbers behind
-- them: message caps, which tier runs which model, how deep it thinks, whether
-- a plan is profitable at all. Annual makes it sharper still — an unprofitable
-- monthly subscriber can be re-priced next month, an annual one is locked in
-- for twelve.
--
-- One row per user per day per model. Not per call: the question being answered
-- is "what does this account cost us", and per-call rows would grow without
-- adding anything to that answer.

create table if not exists public.ai_spend (
  user_id      uuid not null references auth.users (id) on delete cascade,
  day          date not null,
  model        text not null,
  messages     integer not null default 0,
  input_tokens      bigint not null default 0,
  output_tokens     bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  cache_read_tokens  bigint not null default 0,
  -- Cost in USD as computed at call time, from the rates in lib/ai/claude.ts.
  -- Stored rather than derived so a later price change doesn't silently rewrite
  -- history: what we paid then is what we paid.
  usd          numeric(12, 6) not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (user_id, day, model)
);

-- The admin dashboard asks "spend since date X", across all users.
create index if not exists ai_spend_day_idx on public.ai_spend (day);

alter table public.ai_spend enable row level security;

-- No policies. This is our cost, not the customer's data — nothing in the app
-- shows it to them, and the only writer is the service-role client. RLS on with
-- zero policies denies every browser session outright.

-- ---------------------------------------------------------------------------
-- record_ai_spend — add one call's usage to today's row for this user+model.
--
-- service_role only: it takes the user id as a parameter, so like every other
-- function of that shape here it must be unreachable from a browser, or anyone
-- could forge cost figures for someone else and poison the numbers the pricing
-- decisions are made from.
-- ---------------------------------------------------------------------------

create or replace function public.record_ai_spend(
  p_user_id     uuid,
  p_model       text,
  p_input       bigint,
  p_output      bigint,
  p_cache_write bigint,
  p_cache_read  bigint,
  p_usd         numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
begin
  if p_user_id is null or coalesce(btrim(p_model), '') = '' then
    return;
  end if;

  insert into public.ai_spend as s
    (user_id, day, model, messages, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, usd, updated_at)
  values
    (p_user_id, v_day, p_model, 1,
     greatest(coalesce(p_input, 0), 0),
     greatest(coalesce(p_output, 0), 0),
     greatest(coalesce(p_cache_write, 0), 0),
     greatest(coalesce(p_cache_read, 0), 0),
     greatest(coalesce(p_usd, 0), 0),
     now())
  on conflict (user_id, day, model) do update
    set messages           = s.messages + 1,
        input_tokens       = s.input_tokens + excluded.input_tokens,
        output_tokens      = s.output_tokens + excluded.output_tokens,
        cache_write_tokens = s.cache_write_tokens + excluded.cache_write_tokens,
        cache_read_tokens  = s.cache_read_tokens + excluded.cache_read_tokens,
        usd                = s.usd + excluded.usd,
        updated_at         = now();
end;
$$;

revoke all on function public.record_ai_spend(uuid, text, bigint, bigint, bigint, bigint, numeric) from public, anon, authenticated;
grant execute on function public.record_ai_spend(uuid, text, bigint, bigint, bigint, bigint, numeric) to service_role;
