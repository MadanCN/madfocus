import { route, adminClient, rateLimit, clientIp, EMAIL_RE } from '../_lib/server.js'
import { sendAccessLink } from '../_lib/access.js'

// POST { email } — always answers the same way so it can't be used to
// discover which emails have accounts.
export default route(['POST'], async (req, body) => {
  const email = String(body.email || '').trim().toLowerCase()
  const started = Date.now()
  await rateLimit(`reset-ip:${clientIp(req)}`, 5, 900)

  if (EMAIL_RE.test(email)) {
    // Over the per-address limit: stay silent (same response), just don't send
    const allowed = await rateLimit(`reset-email:${email}`, 3, 3600).then(() => true, () => false)
    try {
      const { data: p } = await adminClient().from('profiles').select('status').eq('email', email).maybeSingle()
      if (allowed && p && p.status === 'active') await sendAccessLink(req, { email, kind: 'recovery' })
    } catch (e) { console.error('[reset]', e.message) }
  }

  // Even out timing between "account exists" and "doesn't"
  const wait = Math.max(0, 900 - (Date.now() - started))
  await new Promise(r => setTimeout(r, wait))
  return { ok: true }
})
