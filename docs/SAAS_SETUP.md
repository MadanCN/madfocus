# Running Mad Focus as a SaaS

Do these in order. Each step is required unless marked optional.

## 1. Database (Supabase → SQL editor)

Run these once, in order. Both are safe to re-run.

1. `supabase/migrations/20261025_saas_platform.sql`
2. `supabase/migrations/20261026_profile_fields.sql` (photo, preferred name, pronouns, headline, bio, location, accent colour, focus preferences)

It removes the old `"anon all"` policies (which let anyone with the public key read every row), adds strict per-user row-level security, profiles, roles, invitations, an audit log and rate limits, and makes `madancn03@gmail.com` the admin.

**Existing data:** if the project has exactly one account, rows with no owner are assigned to it automatically. If there are several accounts, run this for the right one:

```sql
update public.tasks set user_id = '<uuid from Authentication → Users>' where user_id is null;
-- repeat for habits, habit_logs, goals, goal_milestones, journal_entries, pomodoro_sessions,
-- notes, note_folders, authors, series, books, reading_sessions, reading_goals, writing_logs
```

Check that nothing is open to anonymous users:

```sql
select tablename, policyname, roles from pg_policies where schemaname = 'public' order by 1, 2;
```

Every policy should list `{authenticated}`. None should mention `anon` or `public`.

## 2. Supabase Auth settings

**Authentication → Sign In / Providers**
- Turn **off** "Allow new users to sign up". Mad Focus is invite-only. If someone signs up anyway, the database keeps them in "Needs approval" with no access.
- Email: turn on **Confirm email** and **Secure email change**.
- Password: minimum length **10**, and turn on **Leaked password protection** (Pro plan).

**Authentication → Multi-Factor**: enable **TOTP**. Admins must use it, and anyone can turn it on in Settings.

**Authentication → URL Configuration**
- Site URL: your app URL, for example `https://madfocus.yourdomain.com`
- Redirect URLs: add `https://madfocus.yourdomain.com/auth/accept`, `https://madfocus.yourdomain.com/auth/reset` and `https://madfocus.yourdomain.com/settings`

**Authentication → Rate Limits**: keep the defaults or lower them. Our API adds its own limits on top.

**Authentication → Emails → SMTP** (recommended): connect your Resend SMTP credentials so Supabase's own emails come from your domain too. Then paste the templates from `supabase/templates/` into **Email Templates**: invite, reset password, change email address, magic link.

## 3. Branded email (Resend)

1. Create an account at resend.com and verify your sending domain (add the DNS records it gives you).
2. Create an API key.
3. Set `RESEND_API_KEY` and `MAIL_FROM` (step 4).

Without `RESEND_API_KEY`, invites and resets still work, but they're sent by Supabase using the templates from step 2.

## 4. Environment variables (Vercel → Settings → Environment Variables)

| Name | Where it's used |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Browser (safe, protected by RLS) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Server |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Never prefix it with `VITE_`. |
| `APP_URL` | Email links and the same-origin check. `https://` is optional; `www.` and your Vercel URLs are accepted automatically. |
| `ALLOWED_ORIGINS` | Optional. Comma-separated extra addresses the app is served on (another custom domain). |
| `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_REPLY_TO` | Branded email |
| `ANTHROPIC_API_KEY` | AI coach |

Redeploy after setting them.

## 5. Your admin account

- **If `madancn03@gmail.com` doesn't have an account yet:** in Supabase go to Authentication → Users → *Invite user*, enter it, and follow the email. The account becomes an admin automatically.
- **If it already exists:** the migration has already made it an admin.

On first visit to **Account menu → Admin console**, you'll be asked to set up an authenticator app. Every admin session needs a code from it.

To add another admin later, run `insert into public.admin_allowlist (email) values ('their@email');` and `update public.profiles set role = 'admin' where email = 'their@email';`. Admin roles can't be granted from the app on purpose.

## How it's protected

- **Isolation:** every table has row-level security keyed to `auth.uid()`. A trigger forces `user_id` to the caller, so rows can't be written as, or moved to, someone else. Child rows (habit logs, milestones, reading sessions, notes in folders, books in series) can only attach to parents you own. Pending and suspended accounts see nothing.
- **Admins** see aggregate counts and the user list through `security definer` functions that require the admin role **and** a two-step-verified session (`aal2`). Admins can't read anyone's tasks, notes or journal.
- **Server actions** (invites, suspend, delete, export) verify the caller's token with Supabase, re-check role and two-step on the server, are rate-limited in Postgres, refuse cross-origin calls, and are written to the audit log.
- **The AI coach** needs a signed-in, active user and is limited to 40 requests an hour and 200 a day per person.
- **Password reset** always gives the same answer and timing, so it can't reveal which emails have accounts. It's limited per IP and per address.
- **Account deletion** needs the password again and removes everything through cascading foreign keys.
- **Headers:** a strict Content-Security-Policy, HSTS, `frame-ancestors 'none'`, nosniff, and a Permissions-Policy (`vercel.json`).
- **Size limits** on notes, covers, titles and journal entries stop one account from bloating the database.

## Before you charge money (next steps)

- **Billing:** add Stripe Checkout and a webhook that sets `profiles.plan`. The column is already there and only the server can change it.
- **Legal:** publish Terms and a Privacy Policy. User data export and account deletion already exist in Settings.
- **Monitoring:** error tracking (Sentry) and uptime checks, plus Supabase's database backups (Point-in-Time Recovery on Pro).
- **Book covers** are stored inline as small JPEGs. Moving them to Supabase Storage with per-user policies would scale better.
