import { route, requireAdmin, adminClient, rateLimit, audit, HttpError } from '../_lib/server.js'
import { sendAccessLink } from '../_lib/access.js'

const BAN_FOREVER = '876000h' // ~100 years

// POST { action, userId?, invitationId?, confirmEmail? }
export default route(['POST'], async (req, body) => {
  const caller = await requireAdmin(req)
  await rateLimit(`admin-users:${caller.user.id}`, 120, 3600)
  const sb = adminClient()
  const { action } = body

  if (action === 'revoke_invite') {
    const { data: inv } = await sb.from('invitations').select('*').eq('id', body.invitationId).single()
    if (!inv) throw new HttpError(404, 'Invitation not found.')
    if (inv.status !== 'sent') throw new HttpError(400, 'Only open invitations can be revoked.')
    // If the invitee never signed in, remove the placeholder account too
    const { data: p } = await sb.from('profiles').select('id').eq('email', inv.email).maybeSingle()
    if (p) {
      const { data: u } = await sb.auth.admin.getUserById(p.id)
      if (u?.user && !u.user.last_sign_in_at) await sb.auth.admin.deleteUser(p.id)
    }
    await sb.from('invitations').update({ status: 'revoked' }).eq('id', inv.id)
    await audit(req, caller, 'invite.revoke', inv.email)
    return { ok: true }
  }

  const userId = String(body.userId || '')
  const { data: target } = await sb.from('profiles').select('*').eq('id', userId).single()
  if (!target) throw new HttpError(404, 'User not found.')
  if (target.id === caller.user.id) throw new HttpError(400, 'You can’t do that to your own account here.')
  if (target.role === 'admin' && action !== 'resend_invite') throw new HttpError(403, 'Admin accounts can only be changed in the database.')

  switch (action) {
    case 'suspend': {
      await sb.from('profiles').update({ status: 'suspended' }).eq('id', userId)
      // Ban blocks sign-in and token refresh; RLS already hides all data
      await sb.auth.admin.updateUserById(userId, { ban_duration: BAN_FOREVER })
      await audit(req, caller, 'user.suspend', target.email)
      return { ok: true, status: 'suspended' }
    }
    case 'reactivate':
    case 'approve': {
      await sb.from('profiles').update({ status: 'active' }).eq('id', userId)
      await sb.auth.admin.updateUserById(userId, { ban_duration: 'none' })
      await audit(req, caller, action === 'approve' ? 'user.approve' : 'user.reactivate', target.email)
      return { ok: true, status: 'active' }
    }
    case 'resend_invite': {
      const { data: u } = await sb.auth.admin.getUserById(userId)
      if (u?.user?.last_sign_in_at) throw new HttpError(400, 'This person has already signed in.')
      await sendAccessLink(req, { email: target.email, name: target.full_name, inviter: caller.profile.full_name, kind: 'reinvite' })
      await sb.from('invitations').update({ last_sent_at: new Date().toISOString() }).eq('email', target.email).eq('status', 'sent')
      await audit(req, caller, 'invite.resend', target.email)
      return { ok: true }
    }
    case 'delete': {
      if (String(body.confirmEmail || '').trim().toLowerCase() !== target.email.toLowerCase()) {
        throw new HttpError(400, 'Type the person’s email address exactly to confirm.')
      }
      await audit(req, caller, 'user.delete', target.email, { userId })
      const { error } = await sb.auth.admin.deleteUser(userId)
      if (error) throw new HttpError(400, error.message)
      return { ok: true }
    }
    default:
      throw new HttpError(400, 'Unknown action.')
  }
})
