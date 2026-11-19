-- ═══════════════════════════════════════════════════════════════════════
--  MAD FOCUS — Personal API keys for the Claude connector (api/mcp.js)
--  Run once in the Supabase SQL editor. Safe to re-run.
--  Only a SHA-256 hash of each key is stored. Keys are created, listed and
--  revoked by the server (service role); browsers get no direct access.
-- ═══════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.api_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null default 'Claude' check (char_length(name) <= 60),
  token_hash    text not null unique,
  prefix        text not null,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
create index if not exists api_tokens_user_idx on public.api_tokens (user_id);

alter table public.api_tokens enable row level security;
revoke all on public.api_tokens from anon, authenticated;
-- No policies on purpose: only the service role can read or write keys.

commit;
