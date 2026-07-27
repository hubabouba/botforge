-- Botforge cross-device sync — run once in Supabase → SQL Editor.
--
-- Files and projects always lived server-side, but the build plan and the whole
-- assistant conversation lived in the browser: opening the same project on a
-- phone showed an empty Planning tab and an empty chat, and a plain page reload
-- threw the conversation away entirely. Both move to Postgres here.
--
-- Same shape as projects.sql: the signed-in user owns their own rows, so these
-- get full RLS rather than the read-only pattern used for billing tables.

-- ---------------------------------------------------------------------------
-- Build plan — one per project, so it rides along with the project itself.
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists plan text not null default '';

-- ---------------------------------------------------------------------------
-- Assistant conversation
-- ---------------------------------------------------------------------------

create table if not exists public.project_messages (
  id         bigserial primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null default '',
  -- File writes proposed in this turn: [{ path, content }]. Kept so a reopened
  -- conversation still shows what was changed, not just the prose around it.
  edits      jsonb,
  created_at timestamptz not null default now()
);

-- Ordered reads scoped to one project — the only access pattern there is.
create index if not exists project_messages_project_idx
  on public.project_messages (project_id, id);

-- ---------------------------------------------------------------------------
-- Row Level Security — ownership is checked by joining back to projects, the
-- same way project_files does (no user_id column on the child table).
-- ---------------------------------------------------------------------------

alter table public.project_messages enable row level security;

drop policy if exists "own project messages" on public.project_messages;
create policy "own project messages"
  on public.project_messages for all
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_messages.project_id and p.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_messages.project_id and p.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Keep conversations bounded. Without this a long-lived project accumulates
-- history forever, and every open pays for it. Mirrors the trim on project_logs.
-- ---------------------------------------------------------------------------

create or replace function public.trim_project_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.project_messages
  where project_id = new.project_id
    and id <= (
      select id from public.project_messages
      where project_id = new.project_id
      order by id desc
      offset 200 limit 1
    );
  return null;
end;
$$;

drop trigger if exists trg_trim_project_messages on public.project_messages;
create trigger trg_trim_project_messages
  after insert on public.project_messages
  for each row execute function public.trim_project_messages();

-- A trigger function must never be reachable as an RPC. Without this revoke it
-- sat on /rest/v1/rpc/trim_project_messages callable by `anon` — SECURITY
-- DEFINER, so it would have run with the owner's privileges. Triggers fire
-- regardless of EXECUTE grants, so this costs nothing. (hosting.sql does the
-- same for trim_project_logs; this copy was written later and missed it.)
revoke all on function public.trim_project_messages() from public, anon, authenticated;
