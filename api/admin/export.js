import { route, requireAdmin, rateLimit, audit, HttpError } from '../_lib/server.js'
import { createClient } from '@supabase/supabase-js'

// Neutralise spreadsheet formulas (CSV injection) and quote every cell
const cell = v => {
  let s = v == null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

// GET → CSV of every user with usage counts. Runs as the admin (aal2 enforced by the DB too).
export default route(['GET'], async (req, _body, res) => {
  const caller = await requireAdmin(req)
  await rateLimit(`export:${caller.user.id}`, 20, 3600)

  const sb = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${caller.token}` } },
  })
  const { data, error } = await sb.rpc('admin_users')
  if (error) throw new HttpError(403, error.message)

  const cols = ['email', 'full_name', 'role', 'status', 'created_at', 'last_sign_in_at', 'last_seen_at', 'has_mfa', 'tasks', 'habits', 'goals', 'notes', 'books', 'journal_entries']
  const csv = [cols.join(','), ...data.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n')

  await audit(req, caller, 'users.export', `${data.length} users`)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="madfocus-users-${new Date().toISOString().slice(0, 10)}.csv"`)
  res.status(200).send('﻿' + csv)
})
