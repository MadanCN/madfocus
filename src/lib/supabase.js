import { createClient } from '@supabase/supabase-js'

const url  = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example → .env and fill in your keys.'
  )
}

export const sb = createClient(url, anon)

// ── Generic write helper ──
// Usage: await dbRun('Save task', () => sb.from('tasks').upsert(row))
export async function dbRun(label, fn) {
  try {
    const result = await fn()
    if (result.error) throw result.error
    return result.data
  } catch (e) {
    console.error(`[mad-focus] ${label}:`, e.message)
    throw e   // re-throw so callers can show their own toast
  }
}
