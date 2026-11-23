-- ═══════════════════════════════════════════════════════════════════════
--  MAD FOCUS — Body measurements, free-form workouts, measuring cadence
--  Run once in the Supabase SQL editor after 20261120_fitness.sql. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- One row per measuring day. `vals` holds the numbers keyed by metric id
-- (see BODY_METRICS in src/lib/fitness.js), e.g. {"weight":73.7,"body_fat":27.6,"waist":34}
create table if not exists public.body_measurements (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date        text not null,
  vals        jsonb not null default '{}'::jsonb,
  notes       text not null default '' check (char_length(notes) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, date)
);
create index if not exists body_measurements_user_date_idx on public.body_measurements (user_id, date);

alter table public.body_measurements enable row level security;
revoke all on public.body_measurements from anon;
grant select, insert, update, delete on public.body_measurements to authenticated;
drop trigger if exists trg_body_measurements_user_id on public.body_measurements;
create trigger trg_body_measurements_user_id before insert or update on public.body_measurements
  for each row execute function public.set_user_id();

drop policy if exists owner_select on public.body_measurements;
drop policy if exists owner_insert on public.body_measurements;
drop policy if exists owner_update on public.body_measurements;
drop policy if exists owner_delete on public.body_measurements;
create policy owner_select on public.body_measurements for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));
create policy owner_insert on public.body_measurements for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));
create policy owner_update on public.body_measurements for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));
create policy owner_delete on public.body_measurements for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));

-- Free-form workouts (day_type = 'custom'): a title and a list of activities
-- [{ "name": "Sumo squats", "detail": "2 × 15, bodyweight", "group": "strength" }]
alter table public.workout_sessions add column if not exists title text not null default '' check (char_length(title) <= 120);
alter table public.workout_sessions add column if not exists activities jsonb not null default '[]'::jsonb;

-- How often to re-measure: drives the "next measurement due" reminder
alter table public.fitness_settings add column if not exists measure_every text not null default 'monthly';
alter table public.fitness_settings drop constraint if exists fitness_settings_measure_every_check;
alter table public.fitness_settings add constraint fitness_settings_measure_every_check
  check (measure_every in ('weekly', 'fortnightly', 'monthly'));

commit;
