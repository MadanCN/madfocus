-- ═══════════════════════════════════════════════════════════════════════
--  MAD FOCUS — Habit-linked tasks and habit stats
--  Run once in the Supabase SQL editor. Safe to re-run.
--   • tasks.habit_id   : a task that checks in a habit when completed
--   • habits.metric    : what to ask for when that happens
--   • habit_logs.amount/note : the numbers (pages, screen-time minutes…)
-- ═══════════════════════════════════════════════════════════════════════

begin;

alter table public.tasks
  add column if not exists habit_id text references public.habits(id) on delete set null;
create index if not exists tasks_habit_id_idx on public.tasks (habit_id) where habit_id is not null;

alter table public.habits
  add column if not exists metric text not null default 'none';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'habits_metric_valid') then
    alter table public.habits add constraint habits_metric_valid
      check (metric in ('none','minutes','reading','writing','workout','screentime'));
  end if;
end $$;
update public.habits set metric = 'writing' where track_type = 'writing' and metric = 'none';

alter table public.habit_logs
  add column if not exists amount numeric(8,1),
  add column if not exists note   text not null default '';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'habit_logs_note_len') then
    alter table public.habit_logs add constraint habit_logs_note_len check (char_length(note) <= 500);
  end if;
end $$;

-- A task may only point at your own habit
drop policy if exists owner_insert on public.tasks;
drop policy if exists owner_update on public.tasks;
create policy owner_insert on public.tasks for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user())
              and (habit_id is null or exists (select 1 from public.habits h where h.id = habit_id and h.user_id = (select auth.uid()))));
create policy owner_update on public.tasks for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid()) and (select public.is_active_user())
              and (habit_id is null or exists (select 1 from public.habits h where h.id = habit_id and h.user_id = (select auth.uid()))));

commit;
