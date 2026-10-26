-- ═══════════════════════════════════════════════════════════════════════
--  MAD FOCUS — SaaS platform migration
--
--  Run once in the Supabase SQL editor (it is safe to re-run).
--  Requires the earlier schema files to have been applied.
--
--  What it does
--   1. Closes the old "anon all" policies that let anyone read every row
--   2. Gives every table a non-spoofable owner (user_id) and strict,
--      per-operation row-level security, including parent-ownership checks
--   3. Makes per-day uniqueness per user (journal, writing) instead of global
--   4. Adds profiles, roles (user/admin), account status, invitations,
--      an audit log and a rate-limit table
--   5. Adds admin analytics functions that return counts, never content,
--      and only to an admin who has passed two-step verification (aal2)
--   6. Adds size limits so a single account can't bloat the database
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ───────────────────────────────────────────────────────────────────────
-- 0. Tables that belong to a user
-- ───────────────────────────────────────────────────────────────────────
create table if not exists public.note_folders (
  id text primary key, user_id uuid, name text not null, color text default '#2d5a3d',
  sort_order int default 0, created_at timestamptz default now()
);

do $$
declare t text;
begin
  foreach t in array array[
    'tasks','habits','habit_logs','goals','goal_milestones','journal_entries',
    'pomodoro_sessions','notes','note_folders','authors','series','books',
    'reading_sessions','reading_goals','custom_data','writing_logs'
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice 'Skipping missing table %', t;
      continue;
    end if;

    -- 1. Remove every existing policy on the table (including "anon all")
    perform 1;
    execute (
      select coalesce(string_agg(format('drop policy if exists %I on public.%I;', policyname, t), ' '), 'select 1')
      from pg_policies where schemaname = 'public' and tablename = t
    );

    -- 2. Owner column
    execute format('alter table public.%I add column if not exists user_id uuid', t);
    execute format('alter table public.%I alter column user_id set default auth.uid()', t);
    execute format('create index if not exists %I on public.%I (user_id)', t || '_user_id_idx', t);

    -- FK to auth.users with cascade, so deleting an account deletes its data
    if not exists (
      select 1 from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.conrelid = ('public.' || t)::regclass and c.contype = 'f' and a.attname = 'user_id'
    ) then
      execute format('alter table public.%I add constraint %I foreign key (user_id) references auth.users(id) on delete cascade', t, t || '_user_id_fkey');
    end if;

    execute format('alter table public.%I enable row level security', t);

    -- Anonymous visitors get nothing, ever
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ───────────────────────────────────────────────────────────────────────
-- 1. Profiles, roles and status
-- ───────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  full_name     text not null default '',
  role          text not null default 'user'    check (role in ('user','admin')),
  status        text not null default 'pending' check (status in ('active','pending','suspended')),
  plan          text not null default 'free',
  timezone      text,
  onboarded     boolean not null default false,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);
create index if not exists profiles_email_idx on public.profiles (lower(email));

-- Admins are granted by email here, never from the client
create table if not exists public.admin_allowlist (
  email text primary key
);
insert into public.admin_allowlist (email) values ('madancn03@gmail.com') on conflict do nothing;
update public.profiles set email = lower(email) where email <> lower(email);

create table if not exists public.invitations (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  full_name    text not null default '',
  invited_by   uuid references auth.users(id) on delete set null,
  status       text not null default 'sent' check (status in ('sent','accepted','revoked')),
  send_count   int not null default 1,
  created_at   timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  accepted_at  timestamptz
);
create index if not exists invitations_email_idx on public.invitations (lower(email));

create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  actor_email text,
  action      text not null,
  target      text,
  metadata    jsonb not null default '{}'::jsonb,
  ip          text,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

create table if not exists public.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  hits         int not null default 0
);

-- ───────────────────────────────────────────────────────────────────────
-- 2. Helper functions (security definer, pinned search_path)
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.status = 'active' from public.profiles p where p.id = auth.uid()), false)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role = 'admin' and p.status = 'active' from public.profiles p where p.id = auth.uid()), false)
$$;

create or replace function public.is_mfa_verified()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

-- Owner is always the caller. The client can't write or move rows to someone else.
create or replace function public.set_user_id()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.user_id := coalesce(auth.uid(), new.user_id);
  else
    new.user_id := old.user_id;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'tasks','habits','habit_logs','goals','goal_milestones','journal_entries',
    'pomodoro_sessions','notes','note_folders','authors','series','books',
    'reading_sessions','reading_goals','custom_data','writing_logs'
  ] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_user_id', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.set_user_id()', 'trg_' || t || '_user_id', t);
  end loop;
end $$;

-- New sign-ups: create a profile. Invite-only: unknown emails stay "pending"
-- until an admin approves, even if public sign-up is accidentally left on.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  is_allowlisted boolean;
  is_invited boolean;
begin
  select exists(select 1 from public.admin_allowlist a where lower(a.email) = lower(new.email)) into is_allowlisted;
  select exists(select 1 from public.invitations i where lower(i.email) = lower(new.email) and i.status = 'sent') into is_invited;

  insert into public.profiles (id, email, full_name, role, status)
  values (
    new.id, lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when is_allowlisted then 'admin' else 'user' end,
    case when is_allowlisted or is_invited then 'active' else 'pending' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profile email in sync; mark invitations accepted on first sign-in
create or replace function public.handle_user_updated()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = lower(new.email) where id = new.id;
  end if;
  if new.last_sign_in_at is not null and old.last_sign_in_at is null then
    update public.invitations set status = 'accepted', accepted_at = now()
     where lower(email) = lower(new.email) and status = 'sent';
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated after update on auth.users
  for each row execute function public.handle_user_updated();

-- Block role/status/plan changes by anyone but the service role
create or replace function public.protect_profile_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Signed-in users (and anonymous callers) can't change these; the service role and SQL editor can
  if coalesce(auth.jwt() ->> 'role', '') in ('authenticated', 'anon') then
    new.role := old.role;
    new.status := old.status;
    new.plan := old.plan;
    new.email := old.email;
    new.id := old.id;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_profile on public.profiles;
create trigger trg_protect_profile before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- Backfill profiles for existing accounts (existing users are trusted → active)
insert into public.profiles (id, email, full_name, role, status)
select u.id, lower(u.email), coalesce(u.raw_user_meta_data ->> 'full_name', ''),
       case when exists(select 1 from public.admin_allowlist a where lower(a.email) = lower(u.email)) then 'admin' else 'user' end,
       'active'
from auth.users u
on conflict (id) do nothing;

update public.profiles p set role = 'admin', status = 'active'
 where lower(p.email) in (select lower(email) from public.admin_allowlist);

-- Rate limiting for the API (service role only)
create or replace function public.rate_limit_hit(p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r public.rate_limits;
begin
  insert into public.rate_limits as rl (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rl.hits + 1 end,
    window_start = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then now() else rl.window_start end
  returning * into r;
  return r.hits <= p_max;
end $$;

-- Users stamp their own "last seen" (throttled to every 5 minutes)
create or replace function public.touch_last_seen()
returns void language sql security definer set search_path = '' as $$
  update public.profiles set last_seen_at = now()
   where id = auth.uid() and (last_seen_at is null or last_seen_at < now() - interval '5 minutes')
$$;

-- ───────────────────────────────────────────────────────────────────────
-- 3. Row-level security policies
-- ───────────────────────────────────────────────────────────────────────
-- Generic owner policies for every user table
do $$
declare
  t text;
  own text := 'user_id = (select auth.uid()) and (select public.is_active_user())';
begin
  foreach t in array array[
    'tasks','habits','goals','journal_entries','pomodoro_sessions','note_folders',
    'authors','series','reading_goals','custom_data','writing_logs'
  ] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('create policy owner_select on public.%I for select to authenticated using (%s)', t, own);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check (%s)', t, own);
    execute format('create policy owner_update on public.%I for update to authenticated using (%s) with check (%s)', t, own, own);
    execute format('create policy owner_delete on public.%I for delete to authenticated using (%s)', t, own);
  end loop;
end $$;

-- Child tables: you may only attach rows to parents you own
create policy owner_select on public.habit_logs for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));
create policy owner_insert on public.habit_logs for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user())
              and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = (select auth.uid())));
create policy owner_update on public.habit_logs for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = (select auth.uid())));
create policy owner_delete on public.habit_logs for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));

create policy owner_select on public.goal_milestones for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));
create policy owner_insert on public.goal_milestones for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user())
              and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())));
create policy owner_update on public.goal_milestones for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())));
create policy owner_delete on public.goal_milestones for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));

create policy owner_select on public.reading_sessions for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));
create policy owner_insert on public.reading_sessions for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user())
              and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid())));
create policy owner_update on public.reading_sessions for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid())));
create policy owner_delete on public.reading_sessions for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));

create policy owner_select on public.books for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));
create policy owner_insert on public.books for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user())
              and (author_id is null or exists (select 1 from public.authors a where a.id = author_id and a.user_id = (select auth.uid())))
              and (series_id is null or exists (select 1 from public.series s where s.id = series_id and s.user_id = (select auth.uid()))));
create policy owner_update on public.books for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid())
              and (author_id is null or exists (select 1 from public.authors a where a.id = author_id and a.user_id = (select auth.uid())))
              and (series_id is null or exists (select 1 from public.series s where s.id = series_id and s.user_id = (select auth.uid()))));
create policy owner_delete on public.books for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));

create policy owner_select on public.notes for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));
create policy owner_insert on public.notes for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user())
              and (folder_id is null or exists (select 1 from public.note_folders f where f.id = folder_id and f.user_id = (select auth.uid()))));
create policy owner_update on public.notes for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid())
              and (folder_id is null or exists (select 1 from public.note_folders f where f.id = folder_id and f.user_id = (select auth.uid()))));
create policy owner_delete on public.notes for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));

-- Platform tables
alter table public.profiles        enable row level security;
alter table public.admin_allowlist enable row level security;
alter table public.invitations     enable row level security;
alter table public.audit_log       enable row level security;
alter table public.rate_limits     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['profiles','admin_allowlist','invitations','audit_log','rate_limits'] loop
    execute (
      select coalesce(string_agg(format('drop policy if exists %I on public.%I;', policyname, t), ' '), 'select 1')
      from pg_policies where schemaname = 'public' and tablename = t
    );
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Profiles: read your own (admins read all after 2-step), edit only safe columns
grant select on public.profiles to authenticated;
grant update (full_name, timezone, onboarded) on public.profiles to authenticated;
create policy profile_self_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or ((select public.is_admin()) and (select public.is_mfa_verified())));
create policy profile_self_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Invitations and audit log: admins (2-step verified) can read; writes go through the server
grant select on public.invitations, public.audit_log to authenticated;
create policy invitations_admin_read on public.invitations for select to authenticated
  using ((select public.is_admin()) and (select public.is_mfa_verified()));
create policy audit_admin_read on public.audit_log for select to authenticated
  using ((select public.is_admin()) and (select public.is_mfa_verified()));
-- admin_allowlist and rate_limits: no client access at all (RLS on, no policies)

-- ───────────────────────────────────────────────────────────────────────
-- 4. Per-user uniqueness (was global — two users couldn't share a date)
-- ───────────────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass::text as tbl
    from pg_constraint c
    where c.contype = 'u'
      and c.conrelid in ('public.journal_entries'::regclass, 'public.writing_logs'::regclass)
      and (select array_agg(a.attname::text order by a.attname) from pg_attribute a
           where a.attrelid = c.conrelid and a.attnum = any (c.conkey)) = array['date']
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;
create unique index if not exists journal_entries_user_date_key on public.journal_entries (user_id, date);
create unique index if not exists writing_logs_user_date_key    on public.writing_logs (user_id, date);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'journal_entries_user_date_uniq') then
    alter table public.journal_entries add constraint journal_entries_user_date_uniq unique using index journal_entries_user_date_key;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'writing_logs_user_date_uniq') then
    alter table public.writing_logs add constraint writing_logs_user_date_uniq unique using index writing_logs_user_date_key;
  end if;
end $$;

-- custom_data was keyed globally by "key"
do $$ begin
  if to_regclass('public.custom_data') is not null
     and exists (select 1 from pg_constraint where conname = 'custom_data_pkey'
                 and (select count(*) from unnest(conkey)) = 1) then
    alter table public.custom_data drop constraint custom_data_pkey;
    create unique index if not exists custom_data_user_key on public.custom_data (user_id, key);
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────
-- 5. Existing rows with no owner
--    If this project has exactly one account, its data is assigned to it.
--    Otherwise orphan rows stay invisible to everyone (safe) — assign them
--    manually with:  update public.<table> set user_id = '<uuid>' where user_id is null;
-- ───────────────────────────────────────────────────────────────────────
do $$
declare t text; only_user uuid; n int;
begin
  if (select count(*) from auth.users) = 1 then
    select id into only_user from auth.users limit 1;
    foreach t in array array[
      'tasks','habits','habit_logs','goals','goal_milestones','journal_entries',
      'pomodoro_sessions','notes','note_folders','authors','series','books',
      'reading_sessions','reading_goals','custom_data','writing_logs'
    ] loop
      if to_regclass('public.' || t) is null then continue; end if;
      execute format('alter table public.%I disable trigger %I', t, 'trg_' || t || '_user_id');
      execute format('update public.%I set user_id = $1 where user_id is null', t) using only_user;
      get diagnostics n = row_count;
      execute format('alter table public.%I enable trigger %I', t, 'trg_' || t || '_user_id');
      if n > 0 then raise notice 'Assigned % orphan rows in % to the only account', n, t; end if;
    end loop;
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────
-- 6. Abuse limits (NOT VALID: existing rows are left alone)
-- ───────────────────────────────────────────────────────────────────────
do $$
declare c record;
begin
  for c in select * from (values
    ('tasks',           'tasks_title_len',        'char_length(title) <= 500 and char_length(coalesce(notes, '''')) <= 20000'),
    ('notes',           'notes_size',             'char_length(coalesce(title, '''')) <= 500 and char_length(coalesce(content, '''')) <= 1000000'),
    ('journal_entries', 'journal_size',           'char_length(coalesce(content, '''')) <= 500000'),
    ('books',           'books_size',             'char_length(title) <= 500 and char_length(coalesce(cover_url, '''')) <= 700000 and char_length(coalesce(review, '''')) <= 50000'),
    ('goals',           'goals_title_len',        'char_length(title) <= 500'),
    ('habits',          'habits_name_len',        'char_length(name) <= 200'),
    ('profiles',        'profiles_name_len',      'char_length(full_name) <= 120')
  ) as v(tbl, name, expr) loop
    if to_regclass('public.' || c.tbl) is not null
       and not exists (select 1 from pg_constraint where conname = c.name) then
      execute format('alter table public.%I add constraint %I check (%s) not valid', c.tbl, c.name, c.expr);
    end if;
  end loop;
end $$;

-- ───────────────────────────────────────────────────────────────────────
-- 7. Admin analytics — aggregates only, admin + 2-step verified only
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.assert_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if not public.is_mfa_verified() then
    raise exception 'Two-step verification required' using errcode = '42501';
  end if;
end $$;

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; since date := current_date - 29;
begin
  perform public.assert_admin();
  select jsonb_build_object(
    'users', jsonb_build_object(
      'total',      (select count(*) from public.profiles),
      'active',     (select count(*) from public.profiles where status = 'active'),
      'pending',    (select count(*) from public.profiles where status = 'pending'),
      'suspended',  (select count(*) from public.profiles where status = 'suspended'),
      'active_7d',  (select count(*) from public.profiles where last_seen_at > now() - interval '7 days'),
      'active_30d', (select count(*) from public.profiles where last_seen_at > now() - interval '30 days'),
      'new_30d',    (select count(*) from public.profiles where created_at > now() - interval '30 days'),
      'invites_open', (select count(*) from public.invitations where status = 'sent')
    ),
    'usage', jsonb_build_object(
      'tasks',            (select count(*) from public.tasks),
      'tasks_done',       (select count(*) from public.tasks where done),
      'habits',           (select count(*) from public.habits),
      'habit_checkins',   (select count(*) from public.habit_logs),
      'goals',            (select count(*) from public.goals),
      'journal_entries',  (select count(*) from public.journal_entries),
      'notes',            (select count(*) from public.notes),
      'books',            (select count(*) from public.books),
      'books_finished',   (select count(*) from public.books where status = 'completed'),
      'reading_minutes',  (select coalesce(sum(duration_min), 0) from public.reading_sessions),
      'focus_minutes',    (select coalesce(sum(duration), 0) from public.pomodoro_sessions where type = 'focus' and completed),
      'words_written',    (select coalesce(sum(word_count), 0) from public.writing_logs)
    ),
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'date', d::date,
        'signups', (select count(*) from public.profiles p where p.created_at::date = d::date),
        'active',  (select count(distinct x.user_id) from (
                      select user_id from public.tasks where left(created_at, 10) = to_char(d, 'YYYY-MM-DD')
                      union all select user_id from public.habit_logs where date = to_char(d, 'YYYY-MM-DD')
                      union all select user_id from public.journal_entries where date = to_char(d, 'YYYY-MM-DD')
                      union all select user_id from public.pomodoro_sessions where date = to_char(d, 'YYYY-MM-DD')
                    ) x),
        'tasks',   (select count(*) from public.tasks t where left(t.created_at, 10) = to_char(d, 'YYYY-MM-DD'))
      ) order by d)
      from generate_series(since, current_date, interval '1 day') d
    )
  ) into result;
  return result;
end $$;

create or replace function public.admin_users()
returns table (
  id uuid, email text, full_name text, role text, status text, plan text,
  created_at timestamptz, last_sign_in_at timestamptz, last_seen_at timestamptz,
  invited boolean, has_mfa boolean,
  tasks bigint, habits bigint, goals bigint, notes bigint, books bigint, journal_entries bigint
) language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public.assert_admin();
  return query
  select p.id, p.email, p.full_name, p.role, p.status, p.plan,
         p.created_at, u.last_sign_in_at, p.last_seen_at,
         (u.invited_at is not null), exists(select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'),
         (select count(*) from public.tasks x where x.user_id = p.id),
         (select count(*) from public.habits x where x.user_id = p.id),
         (select count(*) from public.goals x where x.user_id = p.id),
         (select count(*) from public.notes x where x.user_id = p.id),
         (select count(*) from public.books x where x.user_id = p.id),
         (select count(*) from public.journal_entries x where x.user_id = p.id)
  from public.profiles p
  join auth.users u on u.id = p.id
  order by p.created_at desc;
end $$;

-- Function privileges: nothing for anonymous callers
revoke execute on function public.is_active_user(), public.is_admin(), public.is_mfa_verified(),
  public.touch_last_seen(), public.assert_admin(), public.admin_overview(), public.admin_users(),
  public.rate_limit_hit(text, int, int), public.set_user_id(), public.handle_new_user(),
  public.handle_user_updated(), public.protect_profile_columns()
  from public, anon;
grant execute on function public.is_active_user(), public.is_admin(), public.is_mfa_verified(),
  public.touch_last_seen(), public.assert_admin(), public.admin_overview(), public.admin_users()
  to authenticated;
revoke execute on function public.rate_limit_hit(text, int, int) from authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;

commit;

-- After running: confirm nothing is readable anonymously
--   select tablename, policyname, roles, qual from pg_policies where schemaname = 'public' order by 1, 2;
