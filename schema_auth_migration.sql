-- ============================================================
-- mad.focus — Auth migration
-- Run this entire script in your Supabase SQL editor once.
--
-- What it does:
--   1. Adds user_id to every table (DEFAULT auth.uid() means
--      existing INSERT statements need no changes)
--   2. Enables Row Level Security on every table
--   3. Creates policies so each user only sees their own data
--   4. Adds a trigger to guarantee user_id is always set
-- ============================================================

-- ── Helper: auto-fill user_id on INSERT ───────────────────────
-- This trigger ensures user_id is always auth.uid() even if the
-- client forgets to include it.
CREATE OR REPLACE FUNCTION set_user_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$;

-- ── tasks ─────────────────────────────────────────────────────
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE OR REPLACE TRIGGER trg_tasks_user_id
  BEFORE INSERT ON tasks FOR EACH ROW EXECUTE FUNCTION set_user_id();

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users own tasks" ON tasks;
CREATE POLICY "users own tasks" ON tasks
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── habits ────────────────────────────────────────────────────
ALTER TABLE habits
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE OR REPLACE TRIGGER trg_habits_user_id
  BEFORE INSERT ON habits FOR EACH ROW EXECUTE FUNCTION set_user_id();

ALTER TABLE habits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users own habits" ON habits;
CREATE POLICY "users own habits" ON habits
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── habit_logs ────────────────────────────────────────────────
ALTER TABLE habit_logs
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE OR REPLACE TRIGGER trg_habit_logs_user_id
  BEFORE INSERT ON habit_logs FOR EACH ROW EXECUTE FUNCTION set_user_id();

ALTER TABLE habit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users own habit_logs" ON habit_logs;
CREATE POLICY "users own habit_logs" ON habit_logs
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── notes ─────────────────────────────────────────────────────
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE OR REPLACE TRIGGER trg_notes_user_id
  BEFORE INSERT ON notes FOR EACH ROW EXECUTE FUNCTION set_user_id();

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users own notes" ON notes;
CREATE POLICY "users own notes" ON notes
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── goals ─────────────────────────────────────────────────────
ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE OR REPLACE TRIGGER trg_goals_user_id
  BEFORE INSERT ON goals FOR EACH ROW EXECUTE FUNCTION set_user_id();

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users own goals" ON goals;
CREATE POLICY "users own goals" ON goals
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── journal_entries ───────────────────────────────────────────
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE OR REPLACE TRIGGER trg_journal_entries_user_id
  BEFORE INSERT ON journal_entries FOR EACH ROW EXECUTE FUNCTION set_user_id();

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users own journal_entries" ON journal_entries;
CREATE POLICY "users own journal_entries" ON journal_entries
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── pomodoro_sessions ─────────────────────────────────────────
ALTER TABLE pomodoro_sessions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE OR REPLACE TRIGGER trg_pomodoro_sessions_user_id
  BEFORE INSERT ON pomodoro_sessions FOR EACH ROW EXECUTE FUNCTION set_user_id();

ALTER TABLE pomodoro_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users own pomodoro_sessions" ON pomodoro_sessions;
CREATE POLICY "users own pomodoro_sessions" ON pomodoro_sessions
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── books ─────────────────────────────────────────────────────
ALTER TABLE books
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE OR REPLACE TRIGGER trg_books_user_id
  BEFORE INSERT ON books FOR EACH ROW EXECUTE FUNCTION set_user_id();

ALTER TABLE books ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users own books" ON books;
CREATE POLICY "users own books" ON books
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── authors ───────────────────────────────────────────────────
ALTER TABLE authors
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE OR REPLACE TRIGGER trg_authors_user_id
  BEFORE INSERT ON authors FOR EACH ROW EXECUTE FUNCTION set_user_id();

ALTER TABLE authors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users own authors" ON authors;
CREATE POLICY "users own authors" ON authors
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── series ────────────────────────────────────────────────────
ALTER TABLE series
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE OR REPLACE TRIGGER trg_series_user_id
  BEFORE INSERT ON series FOR EACH ROW EXECUTE FUNCTION set_user_id();

ALTER TABLE series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users own series" ON series;
CREATE POLICY "users own series" ON series
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── reading_sessions ──────────────────────────────────────────
ALTER TABLE reading_sessions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE OR REPLACE TRIGGER trg_reading_sessions_user_id
  BEFORE INSERT ON reading_sessions FOR EACH ROW EXECUTE FUNCTION set_user_id();

ALTER TABLE reading_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users own reading_sessions" ON reading_sessions;
CREATE POLICY "users own reading_sessions" ON reading_sessions
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── reading_goals ─────────────────────────────────────────────
ALTER TABLE reading_goals
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE OR REPLACE TRIGGER trg_reading_goals_user_id
  BEFORE INSERT ON reading_goals FOR EACH ROW EXECUTE FUNCTION set_user_id();

ALTER TABLE reading_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users own reading_goals" ON reading_goals;
CREATE POLICY "users own reading_goals" ON reading_goals
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Backfill existing rows (if any) ──────────────────────────
-- If you already have data in the DB and want to assign it to
-- a specific user, replace <YOUR_USER_ID> with the UUID from
-- the Supabase Auth → Users table.
--
-- UPDATE tasks             SET user_id = '<YOUR_USER_ID>' WHERE user_id IS NULL;
-- UPDATE habits            SET user_id = '<YOUR_USER_ID>' WHERE user_id IS NULL;
-- UPDATE habit_logs        SET user_id = '<YOUR_USER_ID>' WHERE user_id IS NULL;
-- UPDATE notes             SET user_id = '<YOUR_USER_ID>' WHERE user_id IS NULL;
-- UPDATE goals             SET user_id = '<YOUR_USER_ID>' WHERE user_id IS NULL;
-- UPDATE journal_entries   SET user_id = '<YOUR_USER_ID>' WHERE user_id IS NULL;
-- UPDATE pomodoro_sessions SET user_id = '<YOUR_USER_ID>' WHERE user_id IS NULL;
-- UPDATE books             SET user_id = '<YOUR_USER_ID>' WHERE user_id IS NULL;
-- UPDATE authors           SET user_id = '<YOUR_USER_ID>' WHERE user_id IS NULL;
-- UPDATE series            SET user_id = '<YOUR_USER_ID>' WHERE user_id IS NULL;
-- UPDATE reading_sessions  SET user_id = '<YOUR_USER_ID>' WHERE user_id IS NULL;
-- UPDATE reading_goals     SET user_id = '<YOUR_USER_ID>' WHERE user_id IS NULL;
