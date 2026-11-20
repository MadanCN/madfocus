-- ═══════════════════════════════════════════════════════════════════════
--  MAD FOCUS — Fitness: workouts, sets, food log, body weight, targets
--  Run once in the Supabase SQL editor after the earlier migrations. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.workout_sessions (
  id             text primary key,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date           text not null,                 -- YYYY-MM-DD, local
  day_type       text not null,                 -- push_a | pull_a | legs_a | push_b | pull_b | legs_b | rest
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  cardio_kind    text,                          -- walk | run
  cardio_min     numeric(5,1),
  cardio_km      numeric(5,2),
  warmup_done    boolean not null default false,
  cooldown_done  boolean not null default false,
  stats          jsonb not null default '{}'::jsonb,
  notes          text not null default '' check (char_length(notes) <= 2000),
  created_at     timestamptz not null default now()
);
create index if not exists workout_sessions_user_date_idx on public.workout_sessions (user_id, date desc);

create table if not exists public.workout_sets (
  id           text primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id   text not null references public.workout_sessions(id) on delete cascade,
  exercise_id  text not null check (char_length(exercise_id) <= 60),
  set_no       int  not null check (set_no between 1 and 20),
  weight       numeric(6,2) not null default 0 check (weight between 0 and 1000),
  reps         int  not null default 0 check (reps between 0 and 1000),
  done         boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (session_id, exercise_id, set_no)
);
create index if not exists workout_sets_user_ex_idx on public.workout_sets (user_id, exercise_id);

create table if not exists public.food_logs (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date        text not null,
  meal        text not null default 'snack' check (meal in ('breakfast','lunch','snack','dinner')),
  name        text not null check (char_length(name) <= 120),
  qty         text not null default '' check (char_length(qty) <= 60),
  kcal        int  not null default 0 check (kcal between 0 and 10000),
  protein     numeric(6,1) not null default 0 check (protein between 0 and 1000),
  created_at  timestamptz not null default now()
);
create index if not exists food_logs_user_date_idx on public.food_logs (user_id, date);

create table if not exists public.body_weights (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date        text not null,
  kg          numeric(5,2) not null check (kg between 20 and 400),
  created_at  timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.fitness_settings (
  user_id         uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  kcal_target     int not null default 2000 check (kcal_target between 800 and 6000),
  protein_target  int not null default 140  check (protein_target between 20 and 400),
  updated_at      timestamptz not null default now()
);

-- Ownership: trigger stamps the owner, RLS limits every row to its owner
do $$
declare t text;
begin
  foreach t in array array['workout_sessions','workout_sets','food_logs','body_weights','fitness_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute (
      select coalesce(string_agg(format('drop policy if exists %I on public.%I;', policyname, t), ' '), 'select 1')
      from pg_policies where schemaname = 'public' and tablename = t
    );
    if t <> 'fitness_settings' then
      execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_user_id', t);
      execute format('create trigger %I before insert or update on public.%I for each row execute function public.set_user_id()', 'trg_' || t || '_user_id', t);
    end if;
  end loop;
end $$;

do $$
declare
  t text;
  own text := 'user_id = (select auth.uid()) and (select public.is_active_user())';
begin
  foreach t in array array['workout_sessions','food_logs','body_weights','fitness_settings'] loop
    execute format('create policy owner_select on public.%I for select to authenticated using (%s)', t, own);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check (%s)', t, own);
    execute format('create policy owner_update on public.%I for update to authenticated using (%s) with check (%s)', t, own, own);
    execute format('create policy owner_delete on public.%I for delete to authenticated using (%s)', t, own);
  end loop;
end $$;

-- Sets may only be attached to your own sessions
create policy owner_select on public.workout_sets for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));
create policy owner_insert on public.workout_sets for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user())
              and exists (select 1 from public.workout_sessions w where w.id = session_id and w.user_id = (select auth.uid())));
create policy owner_update on public.workout_sets for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.workout_sessions w where w.id = session_id and w.user_id = (select auth.uid())));
create policy owner_delete on public.workout_sets for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));

commit;
