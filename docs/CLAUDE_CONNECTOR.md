# Connecting Claude to MadFocus

MadFocus exposes an MCP server at `/api/mcp` so Claude can read and update your
tasks, habits, goals, writing log and journal.

## One-time setup

1. **Run the migration.** In the Supabase SQL editor, run
   `supabase/migrations/20261119_api_tokens.sql`.
2. **Deploy.** Push to the branch Vercel deploys. No new environment variables
   are needed (it uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, which already exist).
3. **Create a key.** In MadFocus, open **Settings → Connect Claude → Create link**
   and copy the URL. It looks like `https://<your-app>/api/mcp?key=mf_...`
   and is shown only once.
4. **Add it to Claude** as a custom connector, using that URL. No OAuth is needed.

## Security

- Anyone with the URL can read and change your MadFocus data, so keep it private.
  Revoke it in Settings at any time. Revoking takes effect immediately.
- Only a SHA-256 hash of each key is stored (`api_tokens`, no client access).
- Every query is scoped to the key owner's `user_id`. Suspended accounts are refused.
- Each key is limited to 600 requests an hour.
- Dates use the profile's `timezone`, or `Asia/Kolkata` if it isn't set.

## Tools

| Tool | What it does |
|---|---|
| `get_day_summary` | One day: tasks done, due and overdue, habit check-ins and streaks, writing, goals, journal |
| `list_tasks`, `create_task`, `create_tasks`, `update_task`, `complete_task`, `delete_task` | Tasks, including recurring ones |
| `list_habits`, `create_habit`, `update_habit`, `delete_habit`, `log_habit` | Habits and check-ins |
| `log_writing` | Chapters and words for a day |
| `list_goals`, `create_goal`, `update_goal`, `delete_goal`, `add_milestone`, `update_milestone`, `delete_milestone` | Goals and milestones |
| `get_journal` | Journal entries for a date range |
| `reset_account_data` | Wipes all data but keeps the account. Requires `confirm: "DELETE EVERYTHING"` |

## Testing locally

```bash
curl -s -X POST "https://<your-app>/api/mcp?key=mf_..." \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_day_summary","arguments":{}}}'
```
