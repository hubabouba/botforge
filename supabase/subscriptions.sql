-- Botforge subscriptions — run once in Supabase → SQL Editor.
-- Holds the Stripe subscription state per user. The webhook (service role)
-- writes it; each user can read only their own row (RLS).

create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  plan                   text not null default 'free',            -- free | basic | pro
  status                 text not null default 'inactive',        -- active | trialing | canceled | past_due | inactive
  stripe_customer_id     text,
  stripe_subscription_id text,
  current_period_end     timestamptz,
  updated_at             timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- A user may read their own subscription. Writes happen only via the service
-- role (webhook), which bypasses RLS — so no insert/update policy is granted.
drop policy if exists "read own subscription" on public.subscriptions;
create policy "read own subscription"
  on public.subscriptions for select
  using ((select auth.uid()) = user_id);
