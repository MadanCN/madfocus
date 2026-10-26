import { route, requireAdmin, adminClient, rateLimit, audit, EMAIL_RE, HttpError } from '../_lib/server.js'
import { sendAccessLink } from '../_lib/access.js'

// POST { emails: string[], fullName?: string }
// Returns one result per email: invited | resent | member | invalid | failed
export default route(['POST'], async (req, body) => {
  const caller = await requireAdmin(req)
  const sb = adminClient()

  const emails = [...new Set((Array.isArray(body.emails) ? body.emails : [])
    .map(e => String(e).trim().toLowerCase()).filter(Boolean))]
  if (emails.length === 0) throw new HttpError(400, 'Add at least one email address.')
  if (emails.length > 50) throw new HttpError(400, 'Invite up to 50 people at a time.')
  const fullName = String(body.fullName || '').trim().slice(0, 120)

  await rateLimit(`invite:${caller.user.id}`, 200, 3600)
  const inviter = caller.profile.full_name || ''

  const results = []
  for (const email of emails) {
    if (!EMAIL_RE.test(email)) { results.push({ email, status: 'invalid', message: 'Not a valid email address' }); continue }
    try {
      const { data: existing } = await sb.from('profiles').select('id, status').eq('email', email).maybeSingle()
      if (existing) {
        const { data: u } = await sb.auth.admin.getUserById(existing.id)
        if (u?.user?.last_sign_in_at) { results.push({ email, status: 'member', message: 'Already has an account' }); continue }
        await sendAccessLink(req, { email, name: fullName, inviter, kind: 'reinvite' })
        await sb.from('invitations').update({ last_sent_at: new Date().toISOString() }).eq('email', email).eq('status', 'sent')
        results.push({ email, status: 'resent', message: 'Invitation sent again' })
        continue
      }

      // Record the invitation first: the sign-up trigger uses it to activate the account
      const { data: prior } = await sb.from('invitations').select('id, send_count').eq('email', email).eq('status', 'sent').maybeSingle()
      if (prior) {
        await sb.from('invitations').update({ send_count: prior.send_count + 1, last_sent_at: new Date().toISOString(), full_name: fullName || undefined }).eq('id', prior.id)
      } else {
        const { error } = await sb.from('invitations').insert({ email, full_name: fullName, invited_by: caller.user.id })
        if (error) throw error
      }

      await sendAccessLink(req, { email, name: fullName, inviter, kind: 'invite' })
      results.push({ email, status: 'invited', message: 'Invitation sent' })
    } catch (e) {
      console.error('[invite]', email, e.message)
      results.push({ email, status: 'failed', message: e.message?.slice(0, 160) || 'Could not send' })
    }
  }

  await audit(req, caller, 'user.invite', emails.join(', '), { results: results.map(r => ({ email: r.email, status: r.status })) })
  return { results }
})
