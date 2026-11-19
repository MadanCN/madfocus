// MCP server (Streamable HTTP, stateless JSON responses) so Claude can work with a user's MadFocus data.
// Authenticated with a personal key created in Settings → Connect Claude:
//   POST /api/mcp?key=mf_...   or   Authorization: Bearer mf_...
import { adminClient, rateLimit, HttpError } from './_lib/server.js'
import { TOOLS, ToolError, hashToken, todayIn } from './_lib/mcp-tools.js'

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05']
const INSTRUCTIONS = `MadFocus is the user's personal productivity app: tasks, habits, goals with milestones, a daily writing log and a journal.
All dates are YYYY-MM-DD in the user's own timezone; "today" is returned by get_day_summary.
For a daily review, call get_day_summary for yesterday and for today first, then make changes.
Never call reset_account_data unless the user has explicitly asked in this conversation to wipe all of their data.`

async function authenticate(req) {
  const header = String(req.headers.authorization || '')
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : String(req.query?.key || '').trim()
  if (!token.startsWith('mf_') || token.length < 20) throw new HttpError(401, 'Missing or invalid MadFocus key.')
  const sb = adminClient()
  const { data: key } = await sb.from('api_tokens').select('id,user_id,revoked_at,last_used_at').eq('token_hash', hashToken(token)).maybeSingle()
  if (!key || key.revoked_at) throw new HttpError(401, 'This MadFocus key is invalid or was revoked.')
  const { data: profile } = await sb.from('profiles').select('id,status,timezone').eq('id', key.user_id).maybeSingle()
  if (!profile || profile.status !== 'active') throw new HttpError(403, 'This MadFocus account isn’t active.')
  await rateLimit(`mcp:${key.id}`, 600, 3600)
  if (!key.last_used_at || Date.now() - new Date(key.last_used_at).getTime() > 5 * 60 * 1000) {
    await sb.from('api_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', key.id)
  }
  const tz = profile.timezone || 'Asia/Kolkata'
  return { sb, userId: key.user_id, tz, today: todayIn(tz) }
}

const ok = (id, result) => ({ jsonrpc: '2.0', id, result })
const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } })

export async function handleMessage(ctx, m) {
  if (!m || typeof m !== 'object' || m.jsonrpc !== '2.0' || typeof m.method !== 'string') {
    return m && typeof m === 'object' && 'id' in m ? fail(m.id ?? null, -32600, 'Invalid request') : null
  }
  if (!('id' in m)) return null // notification: nothing to send back
  const { id, method } = m
  const params = m.params || {}
  switch (method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'madfocus', title: 'MadFocus', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      })
    case 'ping':
      return ok(id, {})
    case 'tools/list':
      return ok(id, { tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })) })
    case 'resources/list':
      return ok(id, { resources: [] })
    case 'prompts/list':
      return ok(id, { prompts: [] })
    case 'tools/call': {
      const tool = TOOLS.find(t => t.name === params.name)
      if (!tool) return fail(id, -32602, `Unknown tool: ${params.name}`)
      try {
        const result = await tool.run(ctx, params.arguments && typeof params.arguments === 'object' ? params.arguments : {})
        return ok(id, { content: [{ type: 'text', text: JSON.stringify(result) }] })
      } catch (e) {
        if (!(e instanceof ToolError)) console.error('[mcp]', params.name, e)
        return ok(id, { content: [{ type: 'text', text: e instanceof ToolError ? e.message : 'Something went wrong inside MadFocus. Try again.' }], isError: true })
      }
    }
    default:
      return fail(id, -32601, `Method not found: ${method}`)
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json(fail(null, -32000, 'Use POST.'))
  }

  let ctx
  try { ctx = await authenticate(req) } catch (e) {
    const status = e instanceof HttpError ? e.status : 500
    if (status >= 500) console.error('[mcp auth]', e)
    return res.status(status).json(fail(null, -32001, status >= 500 && !(e instanceof HttpError) ? 'Server error.' : e.message))
  }

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body || 'null') } catch { return res.status(400).json(fail(null, -32700, 'Parse error')) }
  }
  if (JSON.stringify(body ?? null).length > 256 * 1024) return res.status(413).json(fail(null, -32600, 'Request too large.'))

  const batch = Array.isArray(body)
  const replies = []
  for (const m of batch ? body : [body]) {
    const r = await handleMessage(ctx, m)
    if (r) replies.push(r)
  }
  if (!replies.length) return res.status(202).end()
  res.setHeader('Content-Type', 'application/json')
  return res.status(200).json(batch ? replies : replies[0])
}
