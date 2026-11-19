import crypto from 'node:crypto'
import { route, requireUser, adminClient, rateLimit, audit, HttpError } from './_lib/server.js'
import { hashToken } from './_lib/mcp-tools.js'

const COLS = 'id,name,prefix,created_at,last_used_at'

// Personal keys for the Claude connector (api/mcp.js).
//   GET    → list your active keys (never the key itself)
//   POST   { name } → create a key; the plaintext key is returned once
//   DELETE { id }   → revoke a key
export default route(['GET', 'POST', 'DELETE'], async (req, body) => {
  const caller = await requireUser(req)
  const sb = adminClient()
  const uid = caller.user.id

  if (req.method === 'GET') {
    const { data, error } = await sb.from('api_tokens').select(COLS).eq('user_id', uid).is('revoked_at', null).order('created_at', { ascending: false })
    if (error) throw new HttpError(500, 'Couldn’t load your keys. Has the api_tokens migration been run?')
    return { tokens: data }
  }

  if (req.method === 'POST') {
    await rateLimit(`token-create:${uid}`, 10, 3600)
    const { count } = await sb.from('api_tokens').select('id', { count: 'exact', head: true }).eq('user_id', uid).is('revoked_at', null)
    if ((count || 0) >= 5) throw new HttpError(400, 'You already have 5 keys. Revoke one first.')
    const name = String(body.name || '').trim().slice(0, 60) || 'Claude'
    const token = 'mf_' + crypto.randomBytes(32).toString('base64url')
    const { data, error } = await sb.from('api_tokens')
      .insert({ user_id: uid, name, token_hash: hashToken(token), prefix: token.slice(0, 9) })
      .select(COLS).single()
    if (error) throw new HttpError(500, 'Couldn’t create a key. Has the api_tokens migration been run?')
    await audit(req, caller, 'token.create', name)
    return { token, key: data }
  }

  const id = String(body.id || '')
  const { data, error } = await sb.from('api_tokens').update({ revoked_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', uid).is('revoked_at', null).select('id')
  if (error || !data?.length) throw new HttpError(404, 'Key not found.')
  await audit(req, caller, 'token.revoke', id)
  return { ok: true }
})
