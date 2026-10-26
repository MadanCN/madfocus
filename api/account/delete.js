import { route, requireUser, adminClient, anonClient, rateLimit, audit, HttpError } from '../_lib/server.js'

// POST { password } — permanently deletes the caller's account and all their data
export default route(['POST'], async (req, body) => {
  const caller = await requireUser(req)
  await rateLimit(`delete-account:${caller.user.id}`, 5, 3600)

  // Re-check the password so a stolen session alone can't delete the account
  const { error: pwErr } = await anonClient().auth.signInWithPassword({ email: caller.user.email, password: String(body.password || '') })
  if (pwErr) throw new HttpError(403, 'That password isn’t right.')

  const sb = adminClient()
  if (caller.profile.role === 'admin') {
    const { count } = await sb.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('status', 'active')
    if ((count || 0) <= 1) throw new HttpError(400, 'You’re the only admin. Make someone else an admin before deleting your account.')
  }

  await audit(req, caller, 'account.delete', caller.user.email)
  const { error } = await sb.auth.admin.deleteUser(caller.user.id)
  if (error) throw new HttpError(500, 'Couldn’t delete the account. Try again.')
  return { ok: true }
})
