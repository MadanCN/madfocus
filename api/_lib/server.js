// Shared helpers for the serverless API.
// Files and folders starting with "_" are not exposed as routes by Vercel.
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
// "madfocus.app", "https://madfocus.app/", "HTTPS://MadFocus.app" → "https://madfocus.app"
function normOrigin(v) {
  if (!v) return null
  let s = String(v).trim()
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s
  try { const u = new URL(s); return `${u.protocol}//${u.host}`.toLowerCase() } catch { return null }
}
const bareHost = o => o.replace(/^https?:\/\//, '').replace(/^www\./, '')

export const APP_URL = normOrigin(process.env.APP_URL) || ''

// Every address this deployment answers on: APP_URL, extra ALLOWED_ORIGINS,
// and the URLs Vercel injects (production, branch and per-deployment).
const ALLOWED_ORIGINS = [
  process.env.APP_URL,
  ...(process.env.ALLOWED_ORIGINS || '').split(','),
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
  process.env.VERCEL_BRANCH_URL,
  process.env.VERCEL_URL,
].map(normOrigin).filter(Boolean)

// Same-origin check. Requests are authenticated with a bearer token (not cookies),
// so this is defence in depth against other sites driving the API.
export function checkOrigin(req) {
  const origin = normOrigin(req.headers.origin)
  if (!origin) return // same-origin GETs and server-to-server calls send no Origin
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase()
  if (host && bareHost(origin) === host.replace(/^www\./, '')) return
  if (ALLOWED_ORIGINS.some(a => bareHost(a) === bareHost(origin))) return
  console.warn('[origin] blocked', origin, 'host', host, 'allowed', ALLOWED_ORIGINS)
  throw new HttpError(403, `Requests from ${origin} aren’t allowed. Set APP_URL (or ALLOWED_ORIGINS) in Vercel to this address.`)
}

export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code }
}

let admin
export function adminClient() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new HttpError(500, 'Server is not configured: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  admin ||= createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  return admin
}

// A throwaway client used only to verify a password (never persists a session)
export function anonClient() {
  if (!SUPABASE_URL || !ANON_KEY) throw new HttpError(500, 'Server is not configured: SUPABASE_ANON_KEY is required.')
  return createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function appUrl(req) {
  if (APP_URL) return APP_URL
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || 'https'
  return `${proto}://${host}`
}

export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
}

function decodeJwt(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) } catch { return {} }
}

// Verifies the caller's access token with Supabase (signature + expiry + revocation)
export async function getCaller(req) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) throw new HttpError(401, 'Sign in to continue.')
  const sb = adminClient()
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data?.user) throw new HttpError(401, 'Your session has expired. Sign in again.')
  const claims = decodeJwt(token)
  const { data: profile } = await sb.from('profiles').select('*').eq('id', data.user.id).single()
  if (!profile) throw new HttpError(403, 'Your account isn’t set up yet.')
  return { user: data.user, profile, aal: claims.aal || 'aal1', token }
}

export async function requireUser(req) {
  const caller = await getCaller(req)
  if (caller.profile.status !== 'active') throw new HttpError(403, 'Your account isn’t active.')
  return caller
}

export async function requireAdmin(req) {
  const caller = await requireUser(req)
  if (caller.profile.role !== 'admin') throw new HttpError(403, 'Admin access required.')
  if (caller.aal !== 'aal2') throw new HttpError(403, 'Verify with your authenticator app to continue.', 'mfa_required')
  return caller
}

// Fixed-window rate limit stored in Postgres (works across serverless instances).
// Fails closed: if the limiter can't be reached, the request is refused.
export async function rateLimit(key, max, windowSeconds) {
  const { data, error } = await adminClient().rpc('rate_limit_hit', { p_key: key, p_max: max, p_window_seconds: windowSeconds })
  if (error) { console.error('[rate-limit]', error.message); throw new HttpError(503, 'Please try again in a moment.') }
  if (!data) throw new HttpError(429, 'Too many requests. Wait a little and try again.')
}

export async function audit(req, actor, action, target, metadata = {}) {
  const { error } = await adminClient().from('audit_log').insert({
    actor_id: actor?.user?.id || null, actor_email: actor?.user?.email || null,
    action, target: target || null, metadata, ip: clientIp(req),
  })
  if (error) console.error('[audit]', error.message)
}

export const EMAIL_RE = /^[^\s@<>()[\],;:"]{1,64}@[^\s@<>()[\],;:"]{1,190}\.[a-z]{2,}$/i

// Wraps a route: method check, same-origin check, body size, uniform errors.
export function route(methods, fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    try {
      if (!methods.includes(req.method)) throw new HttpError(405, 'Method not allowed.')
      checkOrigin(req)
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})
      if (raw.length > 64 * 1024) throw new HttpError(413, 'Request is too large.')
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      const out = await fn(req, body, res)
      if (!res.headersSent) res.status(200).json(out ?? { ok: true })
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500
      if (status >= 500) console.error('[api]', req.url, e)
      res.status(status).json({ error: status >= 500 && !(e instanceof HttpError) ? 'Something went wrong on our side.' : e.message, code: e.code })
    }
  }
}
