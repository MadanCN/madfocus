-- ═══════════════════════════════════════════════════════════════════════
--  MAD FOCUS — Personal profile fields
--  Run after 20261025_saas_platform.sql. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

begin;

alter table public.profiles
  add column if not exists preferred_name       text not null default '',
  add column if not exists pronouns             text not null default '',
  add column if not exists headline             text not null default '',
  add column if not exists bio                  text not null default '',
  add column if not exists location             text not null default '',
  add column if not exists avatar_url           text,
  add column if not exists accent               text not null default 'cobalt',
  add column if not exists focus_minutes        int  not null default 25,
  add column if not exists daily_focus_goal     int  not null default 120,
  add column if not exists week_starts_monday   boolean not null default true;

-- Limits enforced by the database, whatever the client sends
do $$
declare c record;
begin
  for c in select * from (values
    ('profiles_preferred_name_len', 'char_length(preferred_name) <= 60'),
    ('profiles_pronouns_len',       'char_length(pronouns) <= 40'),
    ('profiles_headline_len',       'char_length(headline) <= 120'),
    ('profiles_bio_len',            'char_length(bio) <= 600'),
    ('profiles_location_len',       'char_length(location) <= 80'),
    -- Only small inline images: no external URLs (tracking pixels, javascript: etc.)
    ('profiles_avatar_safe',        'avatar_url is null or (char_length(avatar_url) <= 200000 and avatar_url ~ ''^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'')'),
    ('profiles_accent_valid',       'accent in (''cobalt'', ''moss'', ''plum'', ''rose'', ''ochre'', ''teal'')'),
    ('profiles_focus_minutes_range','focus_minutes between 5 and 180'),
    ('profiles_focus_goal_range',   'daily_focus_goal between 0 and 960')
  ) as v(name, expr) loop
    if not exists (select 1 from pg_constraint where conname = c.name) then
      execute format('alter table public.profiles add constraint %I check (%s)', c.name, c.expr);
    end if;
  end loop;
end $$;

-- Signed-in people may edit every profile column except the protected ones
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ') into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name not in ('id', 'email', 'role', 'status', 'plan', 'created_at', 'last_seen_at');
  execute format('revoke update on public.profiles from authenticated');
  execute format('grant update (%s) on public.profiles to authenticated', cols);
end $$;

commit;
