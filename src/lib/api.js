import { sb } from './supabase'

// Calls our serverless API with the current session's access token.
export async function api(path, { method = 'POST', body, raw } = {}) {
  const { data: { session } } = await sb.auth.getSession()
  const res = await fetch(`/api/${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (raw && res.ok) return res
  let data = null
  try { data = await res.json() } catch {}
  if (!res.ok) {
    const err = new Error(data?.error || (res.status === 429 ? 'Too many requests. Wait a little and try again.' : 'Something went wrong. Try again.'))
    err.status = res.status
    err.code = data?.code
    throw err
  }
  return data
}
