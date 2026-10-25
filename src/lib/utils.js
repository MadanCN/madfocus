// ── IDs ────────────────────────────────────────────────────────
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// ── Dates (always local time, never UTC) ───────────────────────
// The old helpers used toISOString(), which flips to "yesterday" for
// anyone east of UTC between midnight and their UTC offset.
export function ymd(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export function today() { return ymd(new Date()) }
export function parseYmd(s) { return s ? new Date(s + 'T00:00:00') : null }
export function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d) }
export function daysBetween(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000) }
export function nowIso() { return new Date().toISOString() }

export function fmtDay(s, opts = { day: 'numeric', month: 'short' }) {
  if (!s) return ''
  return parseYmd(s).toLocaleDateString('en-GB', opts)
}

// "Today", "Tomorrow", "Yesterday", "Mon 27 Oct", "3 days overdue"
export function relDay(s) {
  if (!s) return ''
  const diff = daysBetween(today(), s)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff < 7) return parseYmd(s).toLocaleDateString('en-GB', { weekday: 'long' })
  return fmtDay(s, { weekday: 'short', day: 'numeric', month: 'short' })
}
export function dueLabel(s) {
  if (!s) return ''
  const diff = daysBetween(today(), s)
  if (diff < -1) return `${-diff} days overdue`
  if (diff === -1) return 'Since yesterday'
  return relDay(s)
}

export function fmtMinutes(mins) {
  if (!mins) return '0m'
  const h = Math.floor(mins / 60), m = Math.round(mins % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
export function fmtClock(secs) {
  const s = Math.max(0, Math.round(secs))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
export function fmtNum(n) {
  if (n >= 10000) return `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k`
  return (n || 0).toLocaleString('en-GB')
}
export function plural(n, word, pluralWord) {
  return `${n} ${n === 1 ? word : (pluralWord || word + 's')}`
}

// Consecutive days ending today (or yesterday if today isn't logged yet)
export function streakFrom(dates) {
  const set = new Set(dates)
  let d = today()
  if (!set.has(d)) d = addDays(d, -1)
  let n = 0
  while (set.has(d)) { n++; d = addDays(d, -1) }
  return n
}

export function greeting(date = new Date()) {
  const h = date.getHours()
  if (h < 5) return 'Working late'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function firstName(user) {
  const meta = user?.user_metadata || {}
  const raw = meta.first_name || meta.name || meta.full_name || (user?.email || '').split('@')[0]
  const first = String(raw).split(/[\s._-]+/)[0] || ''
  return first ? first[0].toUpperCase() + first.slice(1) : ''
}

export function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

export function isTypingTarget(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export const PRIORITIES = {
  P1: { label: 'Urgent', short: 'P1', color: 'var(--c-danger)' },
  P2: { label: 'High',   short: 'P2', color: 'var(--c-warn)' },
  P3: { label: 'Normal', short: 'P3', color: 'var(--c-accent)' },
  P4: { label: 'Low',    short: 'P4', color: 'var(--c-faint)' },
}
export const PRIORITY_ORDER = { P1: 0, P2: 1, P3: 2, P4: 3 }
