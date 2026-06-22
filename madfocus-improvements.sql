-- ═══════════════════════════════════════════════════════════════
--  MAD FOCUS — Comprehensive Improvements Migration
--  Run this in the Supabase SQL Editor after applying
--  schema_auth_migration.sql
-- ═══════════════════════════════════════════════════════════════

-- ── Fix missing user_id on writing_logs + custom_data ─────────
ALTER TABLE public.writing_logs
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE OR REPLACE TRIGGER trg_writing_logs_user_id
  BEFORE INSERT ON writing_logs FOR EACH ROW EXECUTE FUNCTION set_user_id();

ALTER TABLE public.writing_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users own writing_logs" ON writing_logs;
CREATE POLICY "users own writing_logs" ON writing_logs
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE public.custom_data
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE OR REPLACE TRIGGER trg_custom_data_user_id
  BEFORE INSERT ON custom_data FOR EACH ROW EXECUTE FUNCTION set_user_id();

ALTER TABLE public.custom_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users own custom_data" ON custom_data;
CREATE POLICY "users own custom_data" ON custom_data
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── Journal: new structured prompt fields ─────────────────────
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS emotions      text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS important_events text  DEFAULT '',
  ADD COLUMN IF NOT EXISTS went_well     text    DEFAULT '',
  ADD COLUMN IF NOT EXISTS difficult     text    DEFAULT '',
  ADD COLUMN IF NOT EXISTS learned       text    DEFAULT '',
  ADD COLUMN IF NOT EXISTS values_alignment text DEFAULT '',
  ADD COLUMN IF NOT EXISTS tomorrow_priority text DEFAULT '';

-- ── Habits: archived flag + category ──────────────────────────
ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS archived  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS category  text    DEFAULT '';

-- ── Tasks: recurring task support ─────────────────────────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_recurring     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_rule  text,   -- 'daily' | 'weekdays' | 'weekly' | 'monthly'
  ADD COLUMN IF NOT EXISTS recurrence_end   text,   -- YYYY-MM-DD or null
  ADD COLUMN IF NOT EXISTS parent_task_id   text;   -- for generated recurrence instances

-- ── Goals: milestone support ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goal_milestones (
  id          text PRIMARY KEY,
  goal_id     text NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  due         text,
  done        boolean DEFAULT false,
  sort_order  int   DEFAULT 0,
  created_at  text
);

CREATE OR REPLACE TRIGGER trg_goal_milestones_user_id
  BEFORE INSERT ON goal_milestones FOR EACH ROW EXECUTE FUNCTION set_user_id();

ALTER TABLE public.goal_milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users own goal_milestones" ON goal_milestones;
CREATE POLICY "users own goal_milestones" ON goal_milestones
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── Notes: folder support + pinning + archiving ───────────────
CREATE TABLE IF NOT EXISTS public.note_folders (
  id         text PRIMARY KEY,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  color      text DEFAULT '#2d5a3d',
  sort_order int  DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE TRIGGER trg_note_folders_user_id
  BEFORE INSERT ON note_folders FOR EACH ROW EXECUTE FUNCTION set_user_id();

ALTER TABLE public.note_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users own note_folders" ON note_folders;
CREATE POLICY "users own note_folders" ON note_folders
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS folder_id  text REFERENCES public.note_folders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pinned     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS emoji      text    DEFAULT '';

-- ── Backfill user_id on writing_logs / custom_data ────────────
-- Replace <YOUR_USER_ID> with your actual user UUID from Supabase Auth > Users
-- UPDATE public.writing_logs SET user_id = '<YOUR_USER_ID>' WHERE user_id IS NULL;
-- UPDATE public.custom_data  SET user_id = '<YOUR_USER_ID>' WHERE user_id IS NULL;
-- UPDATE public.goal_milestones SET user_id = '<YOUR_USER_ID>' WHERE user_id IS NULL;
-- UPDATE public.note_folders  SET user_id = '<YOUR_USER_ID>' WHERE user_id IS NULL;
