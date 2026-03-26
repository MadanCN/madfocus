-- ═══════════════════════════════════════════════════════════════
--  MAD FOCUS — Full Supabase Schema
--  Run this entire block in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ── Tasks ──────────────────────────────────────────────────────
create table public.tasks (
  id           text primary key,
  title        text not null,
  notes        text default '',
  priority     text default 'P3',
  due          text,
  project      text,
  type         text,
  done         boolean default false,
  completed_at text,
  dep_ids      text[]  default '{}',
  created_at   text
);

-- ── Habits ─────────────────────────────────────────────────────
create table public.habits (
  id          text primary key,
  name        text not null,
  freq        text default 'daily',
  track_type  text default 'simple',
  variants    text[] default '{}',
  created_at  text
);

create table public.habit_logs (
  habit_id   text references public.habits(id) on delete cascade,
  date       text not null,
  variant    text,
  primary key (habit_id, date)
);

-- ── Goals ──────────────────────────────────────────────────────
create table public.goals (
  id           text primary key,
  title        text not null,
  description  text default '',
  horizon      text default 'quarterly', -- quarterly | monthly | yearly
  status       text default 'active',    -- active | done | paused
  target       int  default 100,         -- numeric target (e.g. 100%)
  current      int  default 0,
  due          text,
  created_at   text,
  updated_at   text
);

-- ── Daily Journal ──────────────────────────────────────────────
create table public.journal_entries (
  id          text primary key,
  date        text not null unique,      -- one entry per day
  mood        int  default 3,            -- 1-5
  content     text default '',           -- rich HTML
  highlights  text default '',
  gratitude   text default '',
  created_at  text,
  updated_at  text
);

-- ── Pomodoro Sessions ──────────────────────────────────────────
create table public.pomodoro_sessions (
  id          text primary key,
  task_id     text,                      -- optional link to a task
  duration    int  not null,             -- minutes
  type        text default 'focus',      -- focus | short_break | long_break
  completed   boolean default true,
  date        text not null,
  created_at  text
);

-- ── Kanban ─────────────────────────────────────────────────────
-- Uses existing tasks table; kanban_status column added to tasks
alter table public.tasks add column if not exists kanban_status text default 'todo'; -- todo | in_progress | in_review | done

-- ── Notes ──────────────────────────────────────────────────────
create table public.notes (
  id          text primary key,
  title       text default 'Untitled',
  content     text default '',           -- rich HTML from contentEditable
  tags        text[] default '{}',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── Library: Authors ───────────────────────────────────────────
create table public.authors (
  id         text primary key,
  name       text not null,
  bio        text default '',
  created_at text
);

-- ── Library: Series ────────────────────────────────────────────
create table public.series (
  id          text primary key,
  name        text not null,
  description text default '',
  cover_url   text,
  created_at  text
);

-- ── Library: Books ─────────────────────────────────────────────
create table public.books (
  id            text primary key,
  title         text not null,
  author_id     text references public.authors(id) on delete set null,
  series_id     text references public.series(id)  on delete set null,
  series_order  int,                                -- position in series
  cover_url     text,
  description   text default '',
  total_pages   int  default 0,
  genres        text[] default '{}',
  status        text default 'unread',              -- unread | reading | completed | paused
  pages_read    int  default 0,
  rating        int,                                -- 1-5, set on completion
  review        text default '',
  completed_at  text,
  created_at    text
);

-- ── Library: Reading Sessions ──────────────────────────────────
create table public.reading_sessions (
  id           text primary key,
  book_id      text not null references public.books(id) on delete cascade,
  date         text not null,
  start_page   int  not null,
  end_page     int  not null,
  duration_min int  not null,             -- minutes spent reading
  created_at   text
);

-- ── Library: Daily Reading Goals ───────────────────────────────
create table public.reading_goals (
  id         text primary key,
  goal_type  text not null,               -- 'pages' | 'minutes'
  target     int  not null,
  active     boolean default true,
  created_at text
);

-- ── Custom data (projects, task types) ─────────────────────────
create table public.custom_data (
  key   text primary key,
  value jsonb default '[]'::jsonb
);

-- ═══════════════════════════════════════════════════════════════
--  Row-Level Security — allow anon access (no auth required)
--  If you add Supabase Auth later, update these policies.
-- ═══════════════════════════════════════════════════════════════

do $$ 
declare t text;
begin
  foreach t in array array[
    'tasks','habits','habit_logs','goals','journal_entries',
    'pomodoro_sessions','notes','authors','series','books',
    'reading_sessions','reading_goals','custom_data'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "anon all" on public.%I for all using (true) with check (true)', t);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════
--  Storage bucket for book covers
-- ═══════════════════════════════════════════════════════════════
-- Run this separately in the SQL editor:
-- insert into storage.buckets (id, name, public) values ('covers', 'covers', true);

-- Then in Storage > Policies, add:
-- Allow anon uploads: (bucket_id = 'covers')
-- Allow anon reads:   (bucket_id = 'covers')
