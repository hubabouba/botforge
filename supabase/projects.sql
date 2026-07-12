-- Botforge projects — run once in Supabase → SQL Editor (like subscriptions.sql / ai_usage.sql).
-- Server-side home for bot projects, replacing the per-browser localStorage store.
-- The signed-in user owns and edits their own projects directly (real RLS), so
-- unlike subscriptions/ai_usage these tables get full insert/update/delete policies.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null default 'my-bot',
  platform    text not null,                 -- telegram | discord
  language    text not null,                 -- python | node
  description text not null default '',
  entry       text not null default '',      -- path of the entry file (unenforced ref, matches app behaviour)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects (user_id);

-- One row per file. Surrogate id (not path) so a rename is a plain UPDATE.
create table if not exists public.project_files (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  path       text not null,
  content    text not null default '',
  updated_at timestamptz not null default now(),
  unique (project_id, path)
);

create index if not exists project_files_project_id_idx on public.project_files (project_id);

-- Explicit folders so empty folders (no files yet) still render in the tree.
create table if not exists public.project_folders (
  project_id uuid not null references public.projects (id) on delete cascade,
  path       text not null,
  primary key (project_id, path)
);

-- ---------------------------------------------------------------------------
-- Row Level Security — a user may only touch their own projects. Child tables
-- have no user_id column, so ownership is checked by joining back to projects.
-- ---------------------------------------------------------------------------

alter table public.projects        enable row level security;
alter table public.project_files   enable row level security;
alter table public.project_folders enable row level security;

drop policy if exists "own projects" on public.projects;
create policy "own projects"
  on public.projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own project files" on public.project_files;
create policy "own project files"
  on public.project_files for all
  using (exists (select 1 from public.projects p where p.id = project_files.project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_files.project_id and p.user_id = auth.uid()));

drop policy if exists "own project folders" on public.project_folders;
create policy "own project folders"
  on public.project_folders for all
  using (exists (select 1 from public.projects p where p.id = project_folders.project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_folders.project_id and p.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Keep projects.updated_at honest whenever files/folders change (any write path).
-- ---------------------------------------------------------------------------

create or replace function public.touch_project()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.projects set updated_at = now() where id = coalesce(new.project_id, old.project_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_touch_project_files on public.project_files;
create trigger trg_touch_project_files
  after insert or update or delete on public.project_files
  for each row execute function public.touch_project();

drop trigger if exists trg_touch_project_folders on public.project_folders;
create trigger trg_touch_project_folders
  after insert or update or delete on public.project_folders
  for each row execute function public.touch_project();

-- ---------------------------------------------------------------------------
-- Cap files per project at the DB level (matches the 200-file creation limit).
-- One guard covers BOTH paths — the bulk create_project insert and the
-- incremental "add file" route — and is race-free, unlike a per-request count
-- in the API that two concurrent adds could each slip past.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_project_file_limit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_max constant integer := 200;
begin
  if (select count(*) from public.project_files where project_id = new.project_id) >= v_max then
    raise exception 'project_file_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_project_file_limit on public.project_files;
create trigger trg_enforce_project_file_limit
  before insert on public.project_files
  for each row execute function public.enforce_project_file_limit();

-- ---------------------------------------------------------------------------
-- Assemble a project (with its files & folders) as the JSON shape the client
-- store expects: { id, name, platform, language, description, entry,
--                  createdAt, updatedAt, files:[{path,content}], folders:[...] }.
-- Timestamps are epoch-ms numbers to match the existing StoredProject type.
-- ---------------------------------------------------------------------------

create or replace function public.project_json(p public.projects)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'platform', p.platform,
    'language', p.language,
    'description', p.description,
    'entry', p.entry,
    'createdAt', (extract(epoch from p.created_at) * 1000)::bigint,
    'updatedAt', (extract(epoch from p.updated_at) * 1000)::bigint,
    'files', coalesce((
      select jsonb_agg(jsonb_build_object('path', f.path, 'content', f.content) order by f.path)
      from public.project_files f where f.project_id = p.id
    ), '[]'::jsonb),
    'folders', coalesce((
      select jsonb_agg(fo.path order by fo.path)
      from public.project_folders fo where fo.project_id = p.id
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- create_project — atomic: enforce the per-plan cap, insert the project + all
-- its files/folders in one transaction, return the assembled project JSON.
-- p_limit is the plan's project cap computed in TypeScript (plan.ts); pass -1
-- for unlimited (Pro). Returns { "error": "limit" } when the cap is reached.
-- Mirrors the increment_ai_usage(p_limit) precedent: business limits come from
-- TS, not recomputed in SQL (plan depends on env allow-lists Postgres can't see).
-- ---------------------------------------------------------------------------

create or replace function public.create_project(
  p_limit       integer,
  p_name        text,
  p_platform    text,
  p_language    text,
  p_description text,
  p_entry       text,
  p_files       jsonb,
  p_folders     text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_count   integer;
  v_project public.projects;
begin
  if v_user is null then
    return null;
  end if;

  if p_limit is not null and p_limit >= 0 then
    select count(*) into v_count from public.projects where user_id = v_user;
    if v_count >= p_limit then
      return jsonb_build_object('error', 'limit');
    end if;
  end if;

  insert into public.projects (user_id, name, platform, language, description, entry)
  values (
    v_user,
    coalesce(nullif(btrim(p_name), ''), 'my-bot'),
    p_platform,
    p_language,
    coalesce(p_description, ''),
    coalesce(p_entry, '')
  )
  returning * into v_project;

  insert into public.project_files (project_id, path, content)
  select v_project.id, e->>'path', coalesce(e->>'content', '')
  from jsonb_array_elements(coalesce(p_files, '[]'::jsonb)) as e
  where coalesce(e->>'path', '') <> ''
  on conflict (project_id, path) do nothing;

  insert into public.project_folders (project_id, path)
  select v_project.id, f
  from unnest(coalesce(p_folders, '{}'::text[])) as f
  where coalesce(btrim(f), '') <> ''
  on conflict (project_id, path) do nothing;

  return public.project_json(v_project);
end;
$$;

-- ---------------------------------------------------------------------------
-- duplicate_project — atomic copy of one of the caller's own projects (with a
-- "(copy)" name by default), subject to the same per-plan cap.
-- ---------------------------------------------------------------------------

create or replace function public.duplicate_project(
  p_limit     integer,
  p_source_id uuid,
  p_new_name  text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_count   integer;
  v_src     public.projects;
  v_project public.projects;
begin
  if v_user is null then
    return null;
  end if;

  select * into v_src from public.projects where id = p_source_id and user_id = v_user;
  if not found then
    return null;
  end if;

  if p_limit is not null and p_limit >= 0 then
    select count(*) into v_count from public.projects where user_id = v_user;
    if v_count >= p_limit then
      return jsonb_build_object('error', 'limit');
    end if;
  end if;

  insert into public.projects (user_id, name, platform, language, description, entry)
  values (
    v_user,
    coalesce(nullif(btrim(p_new_name), ''), v_src.name || ' (copy)'),
    v_src.platform,
    v_src.language,
    v_src.description,
    v_src.entry
  )
  returning * into v_project;

  insert into public.project_files (project_id, path, content)
  select v_project.id, path, content from public.project_files where project_id = v_src.id;

  insert into public.project_folders (project_id, path)
  select v_project.id, path from public.project_folders where project_id = v_src.id;

  return public.project_json(v_project);
end;
$$;

-- Lock down function execution to signed-in users only.
revoke all on function public.project_json(public.projects) from public, anon;
revoke all on function public.create_project(integer, text, text, text, text, text, jsonb, text[]) from public, anon;
revoke all on function public.duplicate_project(integer, uuid, text) from public, anon;
grant execute on function public.project_json(public.projects) to authenticated;
grant execute on function public.create_project(integer, text, text, text, text, text, jsonb, text[]) to authenticated;
grant execute on function public.duplicate_project(integer, uuid, text) to authenticated;
