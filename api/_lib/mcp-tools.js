// Tools exposed to Claude through the MCP endpoint (api/mcp.js).
// Every query runs with the service role, so every query MUST be scoped to ctx.userId.
import crypto from 'node:crypto'
import { EXERCISES, DAYS, CYCLE, nextDay, CUSTOM, sessionLabel, BODY_METRICS, METRIC } from '../../src/lib/fitness.js'

export class ToolError extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const PRIORITIES = ['P1', 'P2', 'P3', 'P4']
const STATUSES = ['todo', 'in_progress', 'in_review', 'done']
const RECUR = ['daily', 'weekdays', 'weekly', 'monthly']
const FREQS = ['daily', 'weekdays', 'weekly']
const TRACK = ['simple', 'variants', 'writing']
const CATEGORIES = ['Health', 'Mind', 'Creativity', 'Learning', 'Relationships', 'Finance', 'Spirituality', 'Work', 'Other']
const HORIZONS = ['monthly', 'quarterly', 'yearly']
const GOAL_STATUS = ['active', 'paused', 'done']
const METRICS = ['none', 'minutes', 'reading', 'writing', 'workout', 'screentime']
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Children before parents. Keeps the account, profile and Claude keys.
const RESET_ORDER = ['workout_sets', 'workout_sessions', 'food_logs', 'body_weights', 'body_measurements', 'fitness_settings', 'habit_logs', 'goal_milestones', 'reading_sessions', 'notes', 'note_folders', 'books', 'authors', 'series',
  'reading_goals', 'tasks', 'habits', 'goals', 'journal_entries', 'pomodoro_sessions', 'writing_logs', 'custom_data']

const BOOK_STATUS = ['unread', 'reading', 'completed', 'paused']

// Fetches an image server-side and returns a small data: URL (the app's CSP only allows self/data images)
async function fetchCover(url) {
  if (!/^https:\/\//i.test(url)) throw new ToolError('cover_image_url must start with https://')
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10000) })
  if (!res.ok) return null
  const type = (res.headers.get('content-type') || '').split(';')[0].trim()
  if (!/^image\/(jpeg|png|webp)$/.test(type)) return null
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 1000) return null            // Open Library's 1×1 placeholder
  if (buf.length > 450 * 1024) throw new ToolError('Cover image is too large (max 450 KB).')
  return `data:${type};base64,${buf.toString('base64')}`
}

// ── Helpers ────────────────────────────────────────────────────
export function uid() { return Date.now().toString(36) + crypto.randomBytes(3).toString('hex') }
export const hashToken = t => crypto.createHash('sha256').update(String(t)).digest('hex')

export function todayIn(tz) {
  const fmt = z => new Intl.DateTimeFormat('en-CA', { timeZone: z, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  try { return fmt(tz || 'Asia/Kolkata') } catch { return fmt('Asia/Kolkata') }
}
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const weekday = s => new Date(s + 'T00:00:00Z').getUTCDay()
const nowIso = () => new Date().toISOString()
const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))

function text(v, name, { max = 500, required = false } = {}) {
  if (v === undefined || v === null) { if (required) throw new ToolError(`${name} is required.`); return undefined }
  if (typeof v !== 'string') throw new ToolError(`${name} must be text.`)
  const t = v.trim()
  if (required && !t) throw new ToolError(`${name} can’t be empty.`)
  if (t.length > max) throw new ToolError(`${name} must be ${max} characters or fewer.`)
  return t
}
function date(v, name) {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  if (typeof v !== 'string' || !DATE_RE.test(v) || isNaN(new Date(v + 'T00:00:00Z'))) throw new ToolError(`${name} must be a date like 2026-11-19.`)
  return v
}
function pick(v, name, options) {
  if (v === undefined || v === null) return undefined
  if (!options.includes(v)) throw new ToolError(`${name} must be one of: ${options.join(', ')}.`)
  return v
}
function int(v, name, min, max) {
  if (v === undefined || v === null) return undefined
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) throw new ToolError(`${name} must be a whole number from ${min} to ${max}.`)
  return n
}
function bool(v, name) {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'boolean') throw new ToolError(`${name} must be true or false.`)
  return v
}
function textList(v, name, maxItems = 20) {
  if (v === undefined || v === null) return undefined
  if (!Array.isArray(v)) throw new ToolError(`${name} must be a list.`)
  if (v.length > maxItems) throw new ToolError(`${name} can have at most ${maxItems} items.`)
  return v.map(x => text(x, name, { max: 60, required: true }))
}

async function q(p) {
  const { data, error } = await p
  if (error) throw new ToolError(`Database error: ${error.message}`)
  return data
}
async function owned(ctx, table, id, label) {
  const rid = text(id, 'id', { max: 64, required: true })
  const row = await q(ctx.sb.from(table).select('*').eq('id', rid).eq('user_id', ctx.userId).maybeSingle())
  if (!row) throw new ToolError(`No ${label} with id ${rid}.`)
  return row
}

function streak(dates, day) {
  const set = new Set(dates)
  let d = set.has(day) ? day : addDays(day, -1)
  let n = 0
  while (set.has(d)) { n++; d = addDays(d, -1) }
  return n
}
const byPriority = (a, b) => (a.priority || 'P3').localeCompare(b.priority || 'P3') || String(a.due || '9999').localeCompare(String(b.due || '9999'))
const byDue = (a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')) || byPriority(a, b)

// ── Output shapes ──────────────────────────────────────────────
const taskOut = r => clean({
  id: r.id, title: r.title, notes: r.notes || undefined, priority: r.priority || 'P3', due: r.due || null,
  project: r.project || undefined, type: r.type || undefined,
  status: r.kanban_status || (r.done ? 'done' : 'todo'), done: !!r.done, completed_at: r.completed_at || undefined,
  recurring: r.is_recurring ? (r.recurrence_rule || 'daily') + (r.recurrence_end ? ` until ${r.recurrence_end}` : '') : undefined,
  habit_id: r.habit_id || undefined,
})
const goalOut = (g, ms) => clean({
  id: g.id, title: g.title, description: g.description || undefined, horizon: g.horizon, status: g.status,
  target: g.target, current: g.current, progress_pct: g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0,
  due: g.due || null,
  milestones: ms.map(m => clean({ id: m.id, title: m.title, due: m.due || undefined, done: !!m.done })),
})
const stripHtml = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
const journalOut = j => clean({
  date: j.date, mood: j.mood, emotions: j.emotions?.length ? j.emotions : undefined,
  entry: stripHtml(j.content).slice(0, 1500) || undefined, highlights: j.highlights || undefined,
  went_well: j.went_well || undefined, difficult: j.difficult || undefined, learned: j.learned || undefined,
  gratitude: j.gratitude || undefined, tomorrow_priority: j.tomorrow_priority || undefined,
})

// ── Tasks ──────────────────────────────────────────────────────
function taskFields(a, creating) {
  const row = clean({
    title: text(a.title, 'title', { max: 500, required: creating || a.title !== undefined }),
    notes: text(a.notes, 'notes', { max: 20000 }),
    priority: pick(a.priority, 'priority', PRIORITIES),
    due: date(a.due, 'due'),
    project: text(a.project, 'project', { max: 100 }),
    type: text(a.type, 'type', { max: 60 }),
    kanban_status: pick(a.status, 'status', STATUSES),
    is_recurring: bool(a.is_recurring, 'is_recurring'),
    recurrence_rule: pick(a.recurrence_rule, 'recurrence_rule', RECUR),
    recurrence_end: date(a.recurrence_end, 'recurrence_end'),
    habit_id: a.habit_id === null ? null : text(a.habit_id, 'habit_id', { max: 64 }),
  })
  if (row.project === '') row.project = null
  if (row.habit_id === '') row.habit_id = null
  if (row.type === '') row.type = null
  if (creating && row.recurrence_rule && row.is_recurring === undefined) row.is_recurring = true
  return row
}

async function checkHabit(ctx, row) {
  if (row.habit_id) await owned(ctx, 'habits', row.habit_id, 'habit')
}

async function insertTask(ctx, a) {
  const row = taskFields(a, true)
  await checkHabit(ctx, row)
  const status = row.kanban_status || 'todo'
  const ins = {
    id: uid(), user_id: ctx.userId, created_at: ctx.today, notes: '', priority: 'P3', dep_ids: [],
    is_recurring: false, recurrence_rule: 'daily', ...row,
    kanban_status: status, done: status === 'done', completed_at: status === 'done' ? ctx.today : null,
  }
  if (ins.is_recurring && !ins.due) ins.due = ctx.today
  return taskOut(await q(ctx.sb.from('tasks').insert(ins).select().single()))
}

function nextOccurrence(t, today) {
  const base = t.due && t.due > today ? t.due : today
  let next
  switch (t.recurrence_rule) {
    case 'weekdays': next = addDays(base, 1); while ([0, 6].includes(weekday(next))) next = addDays(next, 1); break
    case 'weekly': next = addDays(base, 7); break
    case 'monthly': { const d = new Date(base + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); next = d.toISOString().slice(0, 10); break }
    default: next = addDays(base, 1)
  }
  if (t.recurrence_end && next > t.recurrence_end) return null
  return next
}

const TASK_PROPS = {
  title: { type: 'string', description: 'Short, specific action.' },
  notes: { type: 'string' },
  priority: { type: 'string', enum: PRIORITIES, description: 'P1 urgent, P2 high, P3 normal (default), P4 low.' },
  due: { type: ['string', 'null'], description: 'YYYY-MM-DD, or null for no date.' },
  project: { type: ['string', 'null'], description: 'Free-text project name, e.g. "Webnovel", "MSc", "Work".' },
  type: { type: ['string', 'null'] },
  status: { type: 'string', enum: STATUSES },
  is_recurring: { type: 'boolean' },
  recurrence_rule: { type: 'string', enum: RECUR },
  recurrence_end: { type: ['string', 'null'], description: 'YYYY-MM-DD last day the task repeats.' },
  habit_id: { type: ['string', 'null'], description: 'Link to a habit: when the user ticks this task in the app, it asks for the habit\'s numbers (minutes, pages, words…) and checks the habit in. Use with a recurring task matching the habit\'s frequency.' },
}

// ── Tool list ──────────────────────────────────────────────────
const RO = { readOnlyHint: true, openWorldHint: false }
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false }

export const TOOLS = [
  {
    name: 'get_day_summary', title: 'Day summary', annotations: RO,
    description: 'Everything for one day in one call: tasks completed that day, open tasks due that day, overdue and upcoming tasks, each habit with whether it was done that day and its streak, writing logs for the last 7 days, active goals with milestones, and the journal entry. Use this first for a daily review (pass yesterday\'s date to review yesterday).',
    inputSchema: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD. Defaults to today in the user\'s timezone.' } } },
    run: async (ctx, a) => {
      const day = date(a.date, 'date') || ctx.today
      const since = addDays(day, -60), week = addDays(day, -7)
      const sb = ctx.sb, u = ctx.userId
      const [tasks, habits, logs, writing, goals, ms, journal] = await Promise.all([
        q(sb.from('tasks').select('*').eq('user_id', u)),
        q(sb.from('habits').select('*').eq('user_id', u)),
        q(sb.from('habit_logs').select('*').eq('user_id', u).gte('date', since).lte('date', day)),
        q(sb.from('writing_logs').select('date,chapters,word_count').eq('user_id', u).gte('date', since).lte('date', day)),
        q(sb.from('goals').select('*').eq('user_id', u).neq('status', 'done')),
        q(sb.from('goal_milestones').select('*').eq('user_id', u).order('sort_order', { ascending: true })),
        q(sb.from('journal_entries').select('*').eq('user_id', u).eq('date', day).maybeSingle()),
      ])
      const open = tasks.filter(t => !t.done)
      const written = writing.filter(w => (w.chapters || 0) > 0 || (w.word_count || 0) > 0)
      return {
        date: day, weekday: WEEKDAYS[weekday(day)], today: ctx.today, timezone: ctx.tz,
        tasks: {
          completed_on_date: tasks.filter(t => t.done && t.completed_at === day).map(taskOut),
          due_on_date_open: open.filter(t => t.due === day).sort(byPriority).map(taskOut),
          overdue_open: open.filter(t => t.due && t.due < day).sort(byDue).map(taskOut),
          upcoming_7_days: open.filter(t => t.due && t.due > day && t.due <= addDays(day, 7)).sort(byDue).map(taskOut),
          undated_open: open.filter(t => !t.due).sort(byPriority).slice(0, 25).map(taskOut),
          open_total: open.length,
        },
        habits: habits.filter(h => !h.archived).map(h => {
          const entries = h.track_type === 'writing' ? written : logs.filter(l => l.habit_id === h.id)
          const dates = entries.map(l => l.date)
          const todays = entries.find(l => l.date === day)
          return clean({
            id: h.id, name: h.name, freq: h.freq, track_type: h.track_type, category: h.category || undefined,
            variants: h.variants?.length ? h.variants : undefined,
            metric: h.metric && h.metric !== 'none' ? h.metric : undefined,
            done_on_date: !!todays, variant_on_date: todays?.variant || undefined, minutes_on_date: todays?.duration_min || undefined,
            amount_on_date: todays?.amount != null ? Number(todays.amount) : undefined, note_on_date: todays?.note || undefined,
            minutes_last_7: entries.filter(x => x.date > week).reduce((t, x) => t + (x.duration_min || 0), 0) || undefined,
            amount_last_7: entries.filter(x => x.date > week).reduce((t, x) => t + (Number(x.amount) || 0), 0) || undefined,
            streak: streak(dates, day), days_done_last_7: dates.filter(x => x > week).length,
          })
        }),
        writing_last_7_days: writing.filter(w => w.date > week).sort((a, b) => a.date.localeCompare(b.date)).map(w => ({ date: w.date, chapters: w.chapters || 0, word_count: w.word_count || 0 })),
        goals: goals.map(g => goalOut(g, ms.filter(m => m.goal_id === g.id))),
        journal: journal ? journalOut(journal) : null,
      }
    },
  },

  {
    name: 'list_tasks', title: 'List tasks', annotations: RO,
    description: 'List tasks with optional filters. Sorted by due date (undated last).',
    inputSchema: { type: 'object', properties: {
      status: { type: 'string', enum: ['open', 'done', 'all'], description: 'Default open.' },
      due_from: { type: 'string' }, due_to: { type: 'string' },
      completed_on: { type: 'string', description: 'YYYY-MM-DD: only tasks completed that day.' },
      project: { type: 'string' }, search: { type: 'string', description: 'Text in the title.' },
      limit: { type: 'integer', description: 'Default 100, max 300.' },
    } },
    run: async (ctx, a) => {
      let qb = ctx.sb.from('tasks').select('*').eq('user_id', ctx.userId)
      const status = pick(a.status, 'status', ['open', 'done', 'all']) || 'open'
      if (status === 'open') qb = qb.eq('done', false)
      if (status === 'done') qb = qb.eq('done', true)
      const from = date(a.due_from, 'due_from'), to = date(a.due_to, 'due_to'), comp = date(a.completed_on, 'completed_on')
      if (from) qb = qb.gte('due', from)
      if (to) qb = qb.lte('due', to)
      if (comp) qb = qb.eq('completed_at', comp)
      const project = text(a.project, 'project', { max: 100 })
      if (project) qb = qb.eq('project', project)
      const search = text(a.search, 'search', { max: 100 })
      if (search) qb = qb.ilike('title', `%${search.replace(/[%_\\]/g, m => '\\' + m)}%`)
      const limit = int(a.limit, 'limit', 1, 300) || 100
      const rows = await q(qb.order('due', { ascending: true, nullsFirst: false }).limit(limit))
      return { count: rows.length, tasks: rows.map(taskOut) }
    },
  },
  {
    name: 'create_task', title: 'Create task', annotations: WRITE,
    description: 'Create one task. For a task that repeats, set recurrence_rule (daily, weekdays, weekly, monthly): completing it logs a done copy and rolls the due date forward.',
    inputSchema: { type: 'object', required: ['title'], properties: TASK_PROPS },
    run: async (ctx, a) => ({ created: await insertTask(ctx, a) }),
  },
  {
    name: 'create_tasks', title: 'Create several tasks', annotations: WRITE,
    description: 'Create up to 30 tasks at once (same fields as create_task). Use this when planning a day.',
    inputSchema: { type: 'object', required: ['tasks'], properties: { tasks: { type: 'array', maxItems: 30, items: { type: 'object', required: ['title'], properties: TASK_PROPS } } } },
    run: async (ctx, a) => {
      if (!Array.isArray(a.tasks) || !a.tasks.length) throw new ToolError('tasks must be a non-empty list.')
      if (a.tasks.length > 30) throw new ToolError('At most 30 tasks at once.')
      const created = []
      for (const t of a.tasks) created.push(await insertTask(ctx, t || {}))
      return { created }
    },
  },
  {
    name: 'update_task', title: 'Update task', annotations: WRITE,
    description: 'Change any fields of a task. Set done=false to reopen it. To mark a task done, prefer complete_task (it handles recurring tasks).',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, done: { type: 'boolean' }, ...TASK_PROPS } },
    run: async (ctx, a) => {
      const t = await owned(ctx, 'tasks', a.id, 'task')
      const row = taskFields(a, false)
      await checkHabit(ctx, row)
      const done = bool(a.done, 'done')
      if (done !== undefined) {
        row.done = done
        row.completed_at = done ? (t.completed_at || ctx.today) : null
        row.kanban_status = done ? 'done' : (row.kanban_status && row.kanban_status !== 'done' ? row.kanban_status : (t.kanban_status === 'done' || !t.kanban_status ? 'todo' : t.kanban_status))
      } else if (row.kanban_status) {
        row.done = row.kanban_status === 'done'
        row.completed_at = row.done ? (t.completed_at || ctx.today) : null
      }
      if (!Object.keys(row).length) throw new ToolError('Nothing to change.')
      const r = await q(ctx.sb.from('tasks').update(row).eq('id', t.id).eq('user_id', ctx.userId).select().single())
      return { updated: taskOut(r) }
    },
  },
  {
    name: 'complete_task', title: 'Complete task', annotations: WRITE,
    description: 'Mark a task done. A recurring task logs a done copy and moves to its next due date.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, date: { type: 'string', description: 'Day it was completed, YYYY-MM-DD. Defaults to today.' } } },
    run: async (ctx, a) => {
      const t = await owned(ctx, 'tasks', a.id, 'task')
      const day = date(a.date, 'date') || ctx.today
      if (t.done) return { already_done: taskOut(t) }
      if (t.is_recurring) {
        const next = nextOccurrence(t, ctx.today)
        if (next) {
          await q(ctx.sb.from('tasks').insert({
            id: uid(), user_id: ctx.userId, created_at: day, parent_task_id: t.id, title: t.title, notes: t.notes || '',
            priority: t.priority, due: t.due, project: t.project, type: t.type, dep_ids: [],
            done: true, completed_at: day, kanban_status: 'done', is_recurring: false,
          }))
          const r = await q(ctx.sb.from('tasks').update({ due: next }).eq('id', t.id).eq('user_id', ctx.userId).select().single())
          return { completed: t.title, on: day, next_due: next, task: taskOut(r) }
        }
      }
      const r = await q(ctx.sb.from('tasks').update({ done: true, completed_at: day, kanban_status: 'done' }).eq('id', t.id).eq('user_id', ctx.userId).select().single())
      return { completed: taskOut(r) }
    },
  },
  {
    name: 'delete_task', title: 'Delete task', annotations: DESTRUCTIVE,
    description: 'Permanently delete a task.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    run: async (ctx, a) => {
      const t = await owned(ctx, 'tasks', a.id, 'task')
      await q(ctx.sb.from('tasks').delete().eq('id', t.id).eq('user_id', ctx.userId))
      return { deleted: t.title }
    },
  },

  // ── Habits ──
  {
    name: 'list_habits', title: 'List habits', annotations: RO,
    description: 'All habits with their recent check-ins and streaks. Writing-type habits use the writing log.',
    inputSchema: { type: 'object', properties: { days: { type: 'integer', description: 'How many days of history. Default 14, max 90.' }, include_archived: { type: 'boolean' } } },
    run: async (ctx, a) => {
      const days = int(a.days, 'days', 1, 90) || 14
      const since = addDays(ctx.today, -Math.max(days, 60))
      const [habits, logs, writing] = await Promise.all([
        q(ctx.sb.from('habits').select('*').eq('user_id', ctx.userId)),
        q(ctx.sb.from('habit_logs').select('*').eq('user_id', ctx.userId).gte('date', since)),
        q(ctx.sb.from('writing_logs').select('date,chapters,word_count').eq('user_id', ctx.userId).gte('date', since)),
      ])
      const from = addDays(ctx.today, -(days - 1))
      return {
        today: ctx.today,
        habits: habits.filter(h => a.include_archived || !h.archived).map(h => {
          const entries = h.track_type === 'writing'
            ? writing.filter(w => (w.chapters || 0) > 0 || (w.word_count || 0) > 0)
            : logs.filter(l => l.habit_id === h.id)
          return clean({
            id: h.id, name: h.name, freq: h.freq, track_type: h.track_type, category: h.category || undefined,
            variants: h.variants?.length ? h.variants : undefined, archived: h.archived || undefined,
            streak: streak(entries.map(e => e.date), ctx.today),
            metric: h.metric && h.metric !== 'none' ? h.metric : undefined,
            log: entries.filter(e => e.date >= from).sort((x, y) => x.date.localeCompare(y.date)).map(e => clean({ date: e.date, variant: e.variant || undefined, minutes: e.duration_min || undefined, amount: e.amount != null ? Number(e.amount) : undefined, note: e.note || undefined, chapters: e.chapters, words: e.word_count })),
          })
        }),
      }
    },
  },
  {
    name: 'create_habit', title: 'Create habit', annotations: WRITE,
    description: 'Create a habit. track_type: simple (done or not), variants (pick one of a few options, e.g. Gym: Push/Pull/Legs/Run), writing (uses the daily writing log: chapters and words; only one is needed).',
    inputSchema: { type: 'object', required: ['name'], properties: {
      name: { type: 'string' }, freq: { type: 'string', enum: FREQS }, track_type: { type: 'string', enum: TRACK },
      variants: { type: 'array', items: { type: 'string' } }, category: { type: 'string', enum: CATEGORIES },
      metric: { type: 'string', enum: METRICS, description: 'What to ask for when it is ticked: minutes, reading (minutes+pages), writing (words+chapters), workout (from Fitness), screentime, or none.' },
    } },
    run: async (ctx, a) => {
      const h = {
        id: uid(), user_id: ctx.userId, created_at: ctx.today,
        name: text(a.name, 'name', { max: 200, required: true }),
        freq: pick(a.freq, 'freq', FREQS) || 'daily', track_type: pick(a.track_type, 'track_type', TRACK) || 'simple',
        variants: textList(a.variants, 'variants') || [], category: pick(a.category, 'category', CATEGORIES) || '', archived: false,
        ...(a.metric ? { metric: pick(a.metric, 'metric', METRICS) } : {}),
      }
      if (h.track_type === 'variants' && !h.variants.length) throw new ToolError('A variants habit needs at least one variant.')
      const r = await q(ctx.sb.from('habits').insert(h).select().single())
      return { created: { id: r.id, name: r.name, freq: r.freq, track_type: r.track_type, category: r.category, variants: r.variants } }
    },
  },
  {
    name: 'update_habit', title: 'Update habit', annotations: WRITE,
    description: 'Rename, re-schedule, re-categorise or archive a habit.',
    inputSchema: { type: 'object', required: ['id'], properties: {
      id: { type: 'string' }, name: { type: 'string' }, freq: { type: 'string', enum: FREQS }, track_type: { type: 'string', enum: TRACK },
      variants: { type: 'array', items: { type: 'string' } }, category: { type: 'string', enum: CATEGORIES }, archived: { type: 'boolean' },
      metric: { type: 'string', enum: METRICS },
    } },
    run: async (ctx, a) => {
      const h = await owned(ctx, 'habits', a.id, 'habit')
      const row = clean({
        name: a.name !== undefined ? text(a.name, 'name', { max: 200, required: true }) : undefined,
        freq: pick(a.freq, 'freq', FREQS), track_type: pick(a.track_type, 'track_type', TRACK),
        variants: textList(a.variants, 'variants'), category: pick(a.category, 'category', CATEGORIES), archived: bool(a.archived, 'archived'),
        metric: pick(a.metric, 'metric', METRICS),
      })
      if (!Object.keys(row).length) throw new ToolError('Nothing to change.')
      const r = await q(ctx.sb.from('habits').update(row).eq('id', h.id).eq('user_id', ctx.userId).select().single())
      return { updated: { id: r.id, name: r.name, freq: r.freq, track_type: r.track_type, metric: r.metric, category: r.category, variants: r.variants, archived: r.archived } }
    },
  },
  {
    name: 'delete_habit', title: 'Delete habit', annotations: DESTRUCTIVE,
    description: 'Permanently delete a habit and all its check-ins. Prefer update_habit with archived=true to keep history.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    run: async (ctx, a) => {
      const h = await owned(ctx, 'habits', a.id, 'habit')
      await q(ctx.sb.from('habit_logs').delete().eq('habit_id', h.id).eq('user_id', ctx.userId))
      await q(ctx.sb.from('habits').delete().eq('id', h.id).eq('user_id', ctx.userId))
      return { deleted: h.name }
    },
  },
  {
    name: 'log_habit', title: 'Check in a habit', annotations: WRITE,
    description: 'Mark a habit done (or not done) for a day. For writing habits use log_writing.',
    inputSchema: { type: 'object', required: ['habit_id'], properties: {
      habit_id: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD, default today.' },
      done: { type: 'boolean', description: 'Default true. false removes the check-in.' },
      variant: { type: 'string', description: 'For variants habits.' }, duration_min: { type: 'integer' },
    } },
    run: async (ctx, a) => {
      const h = await owned(ctx, 'habits', a.habit_id, 'habit')
      if (h.track_type === 'writing') throw new ToolError('This is a writing habit. Use log_writing instead.')
      const day = date(a.date, 'date') || ctx.today
      const done = bool(a.done, 'done') ?? true
      if (!done) {
        await q(ctx.sb.from('habit_logs').delete().eq('habit_id', h.id).eq('date', day).eq('user_id', ctx.userId))
        return { habit: h.name, date: day, done: false }
      }
      const variant = text(a.variant, 'variant', { max: 60 }) || null
      if (variant && h.track_type === 'variants' && !(h.variants || []).includes(variant)) throw new ToolError(`variant must be one of: ${h.variants.join(', ')}.`)
      await q(ctx.sb.from('habit_logs').upsert({
        habit_id: h.id, date: day, user_id: ctx.userId, variant, duration_min: int(a.duration_min, 'duration_min', 0, 1440) ?? null,
      }, { onConflict: 'habit_id,date' }))
      return { habit: h.name, date: day, done: true, variant: variant || undefined }
    },
  },
  {
    name: 'log_writing', title: 'Log writing', annotations: WRITE,
    description: 'Set chapters released and words written for a day. Omitted fields keep their current value. Setting both to 0 clears the day.',
    inputSchema: { type: 'object', properties: {
      date: { type: 'string', description: 'YYYY-MM-DD, default today.' }, chapters: { type: 'integer' }, word_count: { type: 'integer' },
    } },
    run: async (ctx, a) => {
      const day = date(a.date, 'date') || ctx.today
      const existing = await q(ctx.sb.from('writing_logs').select('*').eq('user_id', ctx.userId).eq('date', day).maybeSingle())
      const chapters = int(a.chapters, 'chapters', 0, 50) ?? existing?.chapters ?? 0
      const words = int(a.word_count, 'word_count', 0, 200000) ?? existing?.word_count ?? 0
      if (!chapters && !words) {
        if (existing) await q(ctx.sb.from('writing_logs').delete().eq('id', existing.id).eq('user_id', ctx.userId))
        return { date: day, cleared: true }
      }
      await q(ctx.sb.from('writing_logs').upsert({
        id: existing?.id || uid(), user_id: ctx.userId, date: day, chapters, word_count: words,
        created_at: existing?.created_at || day, updated_at: nowIso(),
      }, { onConflict: 'user_id,date' }))
      return { date: day, chapters, word_count: words }
    },
  },

  // ── Goals ──
  {
    name: 'list_goals', title: 'List goals', annotations: RO,
    description: 'Goals with progress and milestones.',
    inputSchema: { type: 'object', properties: { status: { type: 'string', enum: [...GOAL_STATUS, 'all'], description: 'Default: active and paused.' } } },
    run: async (ctx, a) => {
      const status = pick(a.status, 'status', [...GOAL_STATUS, 'all'])
      let qb = ctx.sb.from('goals').select('*').eq('user_id', ctx.userId)
      if (!status) qb = qb.neq('status', 'done')
      else if (status !== 'all') qb = qb.eq('status', status)
      const [goals, ms] = await Promise.all([q(qb.order('due', { ascending: true, nullsFirst: false })), q(ctx.sb.from('goal_milestones').select('*').eq('user_id', ctx.userId).order('sort_order', { ascending: true }))])
      return { goals: goals.map(g => goalOut(g, ms.filter(m => m.goal_id === g.id))) }
    },
  },
  {
    name: 'create_goal', title: 'Create goal', annotations: WRITE,
    description: 'Create a goal with a numeric target (e.g. target 7 for "lose 7 kg", or 100 for a percentage) and optional milestones.',
    inputSchema: { type: 'object', required: ['title'], properties: {
      title: { type: 'string' }, description: { type: 'string' }, horizon: { type: 'string', enum: HORIZONS },
      target: { type: 'integer' }, current: { type: 'integer' }, due: { type: 'string' }, status: { type: 'string', enum: GOAL_STATUS },
      milestones: { type: 'array', maxItems: 20, items: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, due: { type: 'string' } } } },
    } },
    run: async (ctx, a) => {
      const g = {
        id: uid(), user_id: ctx.userId, created_at: nowIso(), updated_at: nowIso(),
        title: text(a.title, 'title', { max: 500, required: true }), description: text(a.description, 'description', { max: 5000 }) || '',
        horizon: pick(a.horizon, 'horizon', HORIZONS) || 'quarterly', status: pick(a.status, 'status', GOAL_STATUS) || 'active',
        target: int(a.target, 'target', 1, 10000000) ?? 100, current: int(a.current, 'current', 0, 10000000) ?? 0, due: date(a.due, 'due') ?? null,
      }
      const ms = Array.isArray(a.milestones) ? a.milestones.slice(0, 20) : []
      const msRows = ms.map((m, i) => ({
        id: uid(), goal_id: g.id, user_id: ctx.userId, title: text(m?.title, 'milestone title', { max: 500, required: true }),
        due: date(m?.due, 'milestone due') ?? null, done: false, sort_order: i, created_at: ctx.today,
      }))
      const r = await q(ctx.sb.from('goals').insert(g).select().single())
      const mr = msRows.length ? await q(ctx.sb.from('goal_milestones').insert(msRows).select()) : []
      return { created: goalOut(r, mr) }
    },
  },
  {
    name: 'update_goal', title: 'Update goal', annotations: WRITE,
    description: 'Change a goal: progress (current), target, status (active, paused, done), due date, title or description.',
    inputSchema: { type: 'object', required: ['id'], properties: {
      id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, horizon: { type: 'string', enum: HORIZONS },
      target: { type: 'integer' }, current: { type: 'integer' }, due: { type: ['string', 'null'] }, status: { type: 'string', enum: GOAL_STATUS },
    } },
    run: async (ctx, a) => {
      const g = await owned(ctx, 'goals', a.id, 'goal')
      const row = clean({
        title: a.title !== undefined ? text(a.title, 'title', { max: 500, required: true }) : undefined,
        description: text(a.description, 'description', { max: 5000 }), horizon: pick(a.horizon, 'horizon', HORIZONS),
        target: int(a.target, 'target', 1, 10000000), current: int(a.current, 'current', 0, 10000000),
        due: date(a.due, 'due'), status: pick(a.status, 'status', GOAL_STATUS),
      })
      if (!Object.keys(row).length) throw new ToolError('Nothing to change.')
      const r = await q(ctx.sb.from('goals').update({ ...row, updated_at: nowIso() }).eq('id', g.id).eq('user_id', ctx.userId).select().single())
      const ms = await q(ctx.sb.from('goal_milestones').select('*').eq('goal_id', g.id).eq('user_id', ctx.userId).order('sort_order', { ascending: true }))
      return { updated: goalOut(r, ms) }
    },
  },
  {
    name: 'delete_goal', title: 'Delete goal', annotations: DESTRUCTIVE,
    description: 'Permanently delete a goal and its milestones.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    run: async (ctx, a) => {
      const g = await owned(ctx, 'goals', a.id, 'goal')
      await q(ctx.sb.from('goal_milestones').delete().eq('goal_id', g.id).eq('user_id', ctx.userId))
      await q(ctx.sb.from('goals').delete().eq('id', g.id).eq('user_id', ctx.userId))
      return { deleted: g.title }
    },
  },
  {
    name: 'add_milestone', title: 'Add milestone', annotations: WRITE,
    description: 'Add a milestone to a goal.',
    inputSchema: { type: 'object', required: ['goal_id', 'title'], properties: { goal_id: { type: 'string' }, title: { type: 'string' }, due: { type: 'string' } } },
    run: async (ctx, a) => {
      const g = await owned(ctx, 'goals', a.goal_id, 'goal')
      const existing = await q(ctx.sb.from('goal_milestones').select('id').eq('goal_id', g.id).eq('user_id', ctx.userId))
      const r = await q(ctx.sb.from('goal_milestones').insert({
        id: uid(), goal_id: g.id, user_id: ctx.userId, title: text(a.title, 'title', { max: 500, required: true }),
        due: date(a.due, 'due') ?? null, done: false, sort_order: existing.length, created_at: ctx.today,
      }).select().single())
      return { goal: g.title, added: { id: r.id, title: r.title, due: r.due } }
    },
  },
  {
    name: 'update_milestone', title: 'Update milestone', annotations: WRITE,
    description: 'Tick off, rename or re-date a milestone.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, title: { type: 'string' }, due: { type: ['string', 'null'] }, done: { type: 'boolean' } } },
    run: async (ctx, a) => {
      const m = await owned(ctx, 'goal_milestones', a.id, 'milestone')
      const row = clean({ title: a.title !== undefined ? text(a.title, 'title', { max: 500, required: true }) : undefined, due: date(a.due, 'due'), done: bool(a.done, 'done') })
      if (!Object.keys(row).length) throw new ToolError('Nothing to change.')
      const r = await q(ctx.sb.from('goal_milestones').update(row).eq('id', m.id).eq('user_id', ctx.userId).select().single())
      return { updated: { id: r.id, title: r.title, due: r.due, done: r.done } }
    },
  },
  {
    name: 'delete_milestone', title: 'Delete milestone', annotations: DESTRUCTIVE,
    description: 'Remove a milestone from its goal.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    run: async (ctx, a) => {
      const m = await owned(ctx, 'goal_milestones', a.id, 'milestone')
      await q(ctx.sb.from('goal_milestones').delete().eq('id', m.id).eq('user_id', ctx.userId))
      return { deleted: m.title }
    },
  },

  // ── Journal ──
  {
    name: 'get_journal', title: 'Read journal', annotations: RO,
    description: 'Journal entries (mood, highlights, what went well or was difficult, tomorrow\'s priority) for a date range. Default: last 7 days.',
    inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } } },
    run: async (ctx, a) => {
      const to = date(a.to, 'to') || ctx.today, from = date(a.from, 'from') || addDays(to, -6)
      const rows = await q(ctx.sb.from('journal_entries').select('*').eq('user_id', ctx.userId).gte('date', from).lte('date', to).order('date', { ascending: true }))
      return { from, to, entries: rows.map(journalOut) }
    },
  },

  // ── Fitness ──
  {
    name: 'get_fitness', title: 'Fitness log', annotations: RO,
    description: 'Workouts (program days with every set, plus free-form workouts with their activity list), daily food totals vs targets with each food entry, body-weight entries and body measurements (body fat, waist, etc.) for a date range (default: last 7 days). Also returns the next workout in the Push A / Pull A / Legs A / Push B / Pull B / Legs B / Rest cycle. Use this to review training and suggest what to push.',
    inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } } },
    run: async (ctx, a) => {
      const to = date(a.to, 'to') || ctx.today, from = date(a.from, 'from') || addDays(to, -6)
      const sb = ctx.sb, u = ctx.userId
      const [sessions, recent, food, weights, settings, measures] = await Promise.all([
        q(sb.from('workout_sessions').select('*').eq('user_id', u).gte('date', from).lte('date', to).order('date', { ascending: true })),
        q(sb.from('workout_sessions').select('date,day_type,finished_at').eq('user_id', u).gte('date', addDays(ctx.today, -60))),
        q(sb.from('food_logs').select('date,meal,name,qty,kcal,protein').eq('user_id', u).gte('date', from).lte('date', to)),
        q(sb.from('body_weights').select('date,kg').eq('user_id', u).gte('date', addDays(from, -30)).lte('date', to).order('date', { ascending: true })),
        q(sb.from('fitness_settings').select('*').eq('user_id', u).maybeSingle()),
        sb.from('body_measurements').select('date,vals,notes').eq('user_id', u).lte('date', to).order('date', { ascending: true })
          .then(r => r.error ? [] : r.data || []),   // empty until the 20261123 migration runs
      ])
      const sets = sessions.length ? await q(sb.from('workout_sets').select('session_id,exercise_id,set_no,weight,reps,done').eq('user_id', u).in('session_id', sessions.map(s => s.id))) : []
      const targets = { kcal_target: settings?.kcal_target ?? 2000, protein_target: settings?.protein_target ?? 140 }
      const byDay = {}
      for (const f of food) {
        const d = (byDay[f.date] ||= { date: f.date, kcal: 0, protein: 0, items: 0, entries: [] })
        d.kcal += f.kcal || 0; d.protein += Number(f.protein) || 0; d.items++
        d.entries.push(clean({ meal: f.meal, name: f.name, qty: f.qty || undefined, kcal: f.kcal, protein: Number(f.protein) }))
      }
      const inRange = measures.filter(m => m.date >= from)
      const before = measures.filter(m => m.date < from).pop()
      const measureOut = m => clean({ date: m.date, notes: m.notes || undefined,
        values: Object.fromEntries(Object.entries(m.vals || {}).map(([k, v]) => [METRIC[k] ? `${k} (${METRIC[k].unit || 'value'})` : k, Number(v)])) })
      return {
        from, to, today: ctx.today, next_workout: DAYS[nextDay(recent)]?.label,
        cycle: CYCLE.map(c => DAYS[c].label),
        workouts: sessions.map(s => s.day_type === CUSTOM ? clean({
          id: s.id, date: s.date, day: sessionLabel(s), kind: 'free-form',
          activities: (s.activities || []).map(a => clean({ name: a.name, detail: a.detail || undefined, group: a.group || undefined })),
          cardio: s.cardio_min ? `${Number(s.cardio_min)} min${s.cardio_km ? `, ${Number(s.cardio_km)} km` : ''} (${s.cardio_kind || 'cardio'})` : undefined,
          notes: s.notes || undefined,
        }) : clean({
          date: s.date, day: DAYS[s.day_type]?.label || s.day_type, finished: !!s.finished_at,
          sets_done: s.stats?.done, sets_planned: s.stats?.planned, volume_kg: s.stats?.volume,
          personal_bests: s.stats?.prs?.length ? s.stats.prs : undefined,
          cardio: s.cardio_min ? `${Number(s.cardio_min)} min${s.cardio_km ? `, ${Number(s.cardio_km)} km` : ''} (${s.cardio_kind || 'cardio'})` : undefined,
          exercises: Object.values(sets.filter(x => x.session_id === s.id && x.done).reduce((m, x) => {
            const ex = EXERCISES[x.exercise_id]
            const e = (m[x.exercise_id] ||= { exercise: ex?.name || x.exercise_id, target: ex ? `${ex.sets} × ${ex.repMin}-${ex.repMax}${ex.type === 'time' ? ' s' : ''}` : undefined, sets: [] })
            e.sets[x.set_no - 1] = ex?.type === 'weight' ? `${Number(x.weight)}kg×${x.reps}` : `${x.reps}${ex?.type === 'time' ? 's' : ''}`
            return m
          }, {})).map(e => ({ ...e, sets: e.sets.filter(Boolean) })),
        })),
        food: { targets, days: Object.values(byDay).sort((x, y) => x.date.localeCompare(y.date)).map(d => ({ ...d, protein: Math.round(d.protein) })) },
        body_weight: weights.map(w => ({ date: w.date, kg: Number(w.kg) })),
        body_measurements: {
          measure_every: settings?.measure_every || 'monthly',
          previous: before ? measureOut(before) : undefined,
          entries: inRange.map(measureOut),
        },
      }
    },
  },
  {
    name: 'log_workout', title: 'Log free-form workout', annotations: WRITE,
    description: 'Log a workout that is not one of the program days (mobility, bodyweight, home workout, a class, a walk). It shows in Fitness → History with its activity list. Pass id to replace an earlier free-form workout. Does not move the Push/Pull/Legs cycle.',
    inputSchema: { type: 'object', required: ['title'], properties: {
      id: { type: 'string', description: 'Id of a free-form workout to replace (from get_fitness).' },
      date: { type: 'string', description: 'YYYY-MM-DD, default today.' },
      title: { type: 'string', description: 'e.g. "Mobility + bodyweight legs & core".' },
      activities: { type: 'array', maxItems: 60, items: { type: 'object', required: ['name'], properties: {
        name: { type: 'string', description: 'Exercise, e.g. "Sumo squats".' },
        detail: { type: 'string', description: 'Sets, reps, time or load, e.g. "2 × 15, bodyweight".' },
        group: { type: 'string', description: 'Optional section, e.g. Warm-up, Mobility, Legs, Core, Cool-down.' },
      } } },
      cardio_min: { type: 'number' }, cardio_km: { type: 'number' },
      cardio_kind: { type: 'string', enum: ['walk', 'run', 'cycle', 'other'] },
      notes: { type: 'string' },
      habit_variant: { type: 'string', description: 'Also tick the gym habit with this variant (e.g. Legs). Omit to leave the habit alone.' },
    } },
    run: async (ctx, a) => {
      const acts = a.activities === undefined || a.activities === null ? [] : a.activities
      if (!Array.isArray(acts) || acts.length > 60) throw new ToolError('activities must be a list of up to 60 items.')
      const activities = acts.map((x, i) => clean({
        name: text(x?.name, `activities[${i}].name`, { max: 80, required: true }),
        detail: text(x?.detail, `activities[${i}].detail`, { max: 80 }) || undefined,
        group: text(x?.group, `activities[${i}].group`, { max: 40 }) || undefined,
      }))
      const num = (v, name, max) => {
        if (v === undefined || v === null) return null
        const n = Number(v)
        if (!(n >= 0 && n <= max)) throw new ToolError(`${name} must be 0–${max}.`)
        return Math.round(n * 100) / 100
      }
      const cardio_min = num(a.cardio_min, 'cardio_min', 600), cardio_km = num(a.cardio_km, 'cardio_km', 200)
      if (!activities.length && !cardio_min) throw new ToolError('Add at least one activity or cardio_min.')
      let existing = null
      if (a.id) {
        existing = await owned(ctx, 'workout_sessions', a.id, 'workout')
        if (existing.day_type !== CUSTOM) throw new ToolError('Only free-form workouts can be replaced with log_workout.')
      }
      const day = date(a.date, 'date') || existing?.date || ctx.today
      const row = {
        id: existing?.id || uid(), user_id: ctx.userId, date: day, day_type: CUSTOM,
        title: text(a.title, 'title', { max: 120, required: true }), activities,
        started_at: existing?.started_at || nowIso(), finished_at: existing?.finished_at || nowIso(),
        cardio_kind: cardio_min ? (pick(a.cardio_kind, 'cardio_kind', ['walk', 'run', 'cycle', 'other']) || 'walk') : null,
        cardio_min, cardio_km, notes: text(a.notes, 'notes', { max: 2000 }) || '', stats: existing?.stats || {},
      }
      await q(ctx.sb.from('workout_sessions').upsert(row))
      let habit
      if (a.habit_variant) {
        const variant = text(a.habit_variant, 'habit_variant', { max: 40 })
        const habits = await q(ctx.sb.from('habits').select('*').eq('user_id', ctx.userId))
        const h = habits.find(x => !x.archived && (x.metric === 'workout' || /gym/i.test(x.name)))
        if (h) {
          const v = h.track_type === 'variants' && (h.variants || []).includes(variant) ? variant : null
          await q(ctx.sb.from('habit_logs').upsert({ habit_id: h.id, date: day, user_id: ctx.userId, variant: v, duration_min: null }, { onConflict: 'habit_id,date' }))
          habit = { name: h.name, variant: v }
        }
      }
      return clean({ saved: { id: row.id, date: row.date, title: row.title, activities: activities.length, cardio_min: cardio_min || undefined }, habit })
    },
  },
  {
    name: 'log_body_measurement', title: 'Log body measurements', annotations: WRITE,
    description: `Record body measurements for a day (body-composition scale and tape). Values merge into that day's entry; pass null to clear one. Weight also goes into the daily weight log. Metric ids: ${BODY_METRICS.map(m => `${m.id} (${m.unit || 'value'})`).join(', ')}.`,
    inputSchema: { type: 'object', required: ['values'], properties: {
      date: { type: 'string', description: 'YYYY-MM-DD the measurements were taken, default today.' },
      values: { type: 'object', description: 'Metric id → number, e.g. {"weight":73.7,"body_fat":27.6,"waist":34}.',
        properties: Object.fromEntries(BODY_METRICS.map(m => [m.id, { type: ['number', 'null'], description: `${m.label}${m.unit ? ` (${m.unit})` : ''}` }])) },
      notes: { type: 'string' },
    } },
    run: async (ctx, a) => {
      const day = date(a.date, 'date') || ctx.today
      if (!a.values || typeof a.values !== 'object' || Array.isArray(a.values)) throw new ToolError('values must be an object of metric id → number.')
      const existing = await q(ctx.sb.from('body_measurements').select('*').eq('user_id', ctx.userId).eq('date', day).maybeSingle())
      const vals = { ...(existing?.vals || {}) }
      for (const [k, v] of Object.entries(a.values)) {
        if (!METRIC[k]) throw new ToolError(`Unknown metric "${k}". Use one of: ${BODY_METRICS.map(m => m.id).join(', ')}.`)
        if (v === null) { delete vals[k]; continue }
        const n = Number(v)
        if (!Number.isFinite(n) || n < 0 || n > 1000) throw new ToolError(`${k} must be a number from 0 to 1000.`)
        vals[k] = Math.round(n * 100) / 100
      }
      const row = { id: existing?.id || uid(), user_id: ctx.userId, date: day, vals,
        notes: a.notes === undefined ? (existing?.notes || '') : (text(a.notes, 'notes', { max: 1000 }) || ''), updated_at: nowIso() }
      await q(ctx.sb.from('body_measurements').upsert(row, { onConflict: 'user_id,date' }))
      if (vals.weight && a.values.weight != null) {
        const w = await q(ctx.sb.from('body_weights').select('id').eq('user_id', ctx.userId).eq('date', day).maybeSingle())
        await q(ctx.sb.from('body_weights').upsert({ id: w?.id || uid(), user_id: ctx.userId, date: day, kg: Math.round(vals.weight * 10) / 10 }, { onConflict: 'user_id,date' }))
      }
      return { date: day, values: vals, metrics_saved: Object.keys(vals).length }
    },
  },
  {
    name: 'log_food', title: 'Log food', annotations: WRITE,
    description: 'Add a food entry to the calorie log. kcal and protein are totals for this entry.',
    inputSchema: { type: 'object', required: ['name', 'kcal'], properties: {
      name: { type: 'string' }, qty: { type: 'string' }, kcal: { type: 'integer' }, protein: { type: 'number' },
      meal: { type: 'string', enum: ['breakfast', 'lunch', 'snack', 'dinner'] }, date: { type: 'string' },
    } },
    run: async (ctx, a) => {
      const protein = a.protein === undefined || a.protein === null ? 0 : Number(a.protein)
      if (!(protein >= 0 && protein <= 1000)) throw new ToolError('protein must be 0–1000 g.')
      const row = {
        id: uid(), user_id: ctx.userId, date: date(a.date, 'date') || ctx.today, meal: pick(a.meal, 'meal', ['breakfast', 'lunch', 'snack', 'dinner']) || 'snack',
        name: text(a.name, 'name', { max: 120, required: true }), qty: text(a.qty, 'qty', { max: 60 }) || '',
        kcal: int(a.kcal, 'kcal', 0, 10000) ?? 0, protein: Math.round(protein * 10) / 10,
      }
      await q(ctx.sb.from('food_logs').insert(row))
      return { logged: { date: row.date, meal: row.meal, name: row.name, kcal: row.kcal, protein: row.protein } }
    },
  },
  {
    name: 'log_body_weight', title: 'Log body weight', annotations: WRITE,
    description: 'Record body weight in kg for a day (replaces that day\'s entry).',
    inputSchema: { type: 'object', required: ['kg'], properties: { kg: { type: 'number' }, date: { type: 'string' } } },
    run: async (ctx, a) => {
      const kg = Number(a.kg)
      if (!(kg >= 20 && kg <= 400)) throw new ToolError('kg must be between 20 and 400.')
      const day = date(a.date, 'date') || ctx.today
      const existing = await q(ctx.sb.from('body_weights').select('id').eq('user_id', ctx.userId).eq('date', day).maybeSingle())
      await q(ctx.sb.from('body_weights').upsert({ id: existing?.id || uid(), user_id: ctx.userId, date: day, kg: Math.round(kg * 10) / 10 }, { onConflict: 'user_id,date' }))
      return { date: day, kg }
    },
  },
  {
    name: 'set_nutrition_targets', title: 'Set calorie & protein targets', annotations: WRITE,
    description: 'Set the daily calorie and protein targets shown in the food log.',
    inputSchema: { type: 'object', properties: { kcal_target: { type: 'integer' }, protein_target: { type: 'integer' } } },
    run: async (ctx, a) => {
      const cur = await q(ctx.sb.from('fitness_settings').select('*').eq('user_id', ctx.userId).maybeSingle())
      const row = { user_id: ctx.userId, kcal_target: int(a.kcal_target, 'kcal_target', 800, 6000) ?? cur?.kcal_target ?? 2000,
        protein_target: int(a.protein_target, 'protein_target', 20, 400) ?? cur?.protein_target ?? 140, updated_at: nowIso() }
      await q(ctx.sb.from('fitness_settings').upsert(row, { onConflict: 'user_id' }))
      return { kcal_target: row.kcal_target, protein_target: row.protein_target }
    },
  },

  // ── Library ──
  {
    name: 'list_books', title: 'List books', annotations: RO,
    description: 'Books in the library with author, status, pages read, plus the daily reading goal and reading done in the last 7 days.',
    inputSchema: { type: 'object', properties: { status: { type: 'string', enum: [...BOOK_STATUS, 'all'], description: 'Default all.' } } },
    run: async (ctx, a) => {
      const status = pick(a.status, 'status', [...BOOK_STATUS, 'all']) || 'all'
      let qb = ctx.sb.from('books').select('id,title,author_id,total_pages,pages_read,status,genres,rating,completed_at,created_at').eq('user_id', ctx.userId)
      if (status !== 'all') qb = qb.eq('status', status)
      const [books, authors, goal, sessions] = await Promise.all([
        q(qb), q(ctx.sb.from('authors').select('id,name').eq('user_id', ctx.userId)),
        q(ctx.sb.from('reading_goals').select('goal_type,target').eq('user_id', ctx.userId).eq('active', true).limit(1)),
        q(ctx.sb.from('reading_sessions').select('book_id,date,start_page,end_page,duration_min').eq('user_id', ctx.userId).gte('date', addDays(ctx.today, -6))),
      ])
      const an = Object.fromEntries(authors.map(x => [x.id, x.name]))
      return {
        daily_goal: goal[0] || null,
        last_7_days: { minutes: sessions.reduce((t, x) => t + (x.duration_min || 0), 0), pages: sessions.reduce((t, x) => t + Math.max(0, x.end_page - x.start_page), 0), days_read: new Set(sessions.map(x => x.date)).size },
        books: books.map(b => clean({ id: b.id, title: b.title, author: an[b.author_id], status: b.status, pages: `${b.pages_read || 0}/${b.total_pages || '?'}`, genres: b.genres?.length ? b.genres : undefined, rating: b.rating || undefined, completed_at: b.completed_at || undefined })),
      }
    },
  },
  {
    name: 'add_book', title: 'Add book', annotations: WRITE,
    description: 'Add a book to the library. Pass isbn (ISBN-10 or ISBN-13) to fetch its cover from Open Library automatically, or cover_image_url for a direct image link. Creates the author if needed.',
    inputSchema: { type: 'object', required: ['title', 'author'], properties: {
      title: { type: 'string' }, author: { type: 'string' }, description: { type: 'string' }, total_pages: { type: 'integer' },
      genres: { type: 'array', items: { type: 'string' } }, status: { type: 'string', enum: BOOK_STATUS },
      isbn: { type: 'string' }, cover_image_url: { type: 'string' },
    } },
    run: async (ctx, a) => {
      const title = text(a.title, 'title', { max: 500, required: true })
      const authorName = text(a.author, 'author', { max: 200, required: true })
      const dupe = await q(ctx.sb.from('books').select('id').eq('user_id', ctx.userId).ilike('title', title.replace(/[%_\\]/g, m => '\\' + m)).limit(1))
      if (dupe.length) throw new ToolError(`“${title}” is already in the library (id ${dupe[0].id}).`)
      const authors = await q(ctx.sb.from('authors').select('id,name').eq('user_id', ctx.userId))
      let author = authors.find(x => x.name.trim().toLowerCase() === authorName.toLowerCase())
      if (!author) {
        author = { id: uid(), user_id: ctx.userId, name: authorName, bio: '', created_at: ctx.today }
        await q(ctx.sb.from('authors').insert(author))
      }
      let cover = null, coverNote
      const isbn = a.isbn ? String(a.isbn).replace(/[^0-9Xx]/g, '') : ''
      if (isbn && !/^(\d{9}[\dXx]|\d{13})$/.test(isbn)) throw new ToolError('isbn must be 10 or 13 digits.')
      let found = null
      try {
        if (isbn) cover = await fetchCover(`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`)
        if (!cover && a.cover_image_url) cover = await fetchCover(text(a.cover_image_url, 'cover_image_url', { max: 1000 }))
        if (!cover) {
          // Fall back to an Open Library search by title + author
          const u = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(authorName)}&fields=cover_i,number_of_pages_median&limit=1`
          const r = await fetch(u, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'MadFocus/1.0 (personal library)' } })
          found = r.ok ? (await r.json()).docs?.[0] : null
          if (found?.cover_i) cover = await fetchCover(`https://covers.openlibrary.org/b/id/${found.cover_i}-L.jpg?default=false`)
        }
      } catch (e) { coverNote = e instanceof ToolError ? e.message : 'Couldn’t reach Open Library for a cover.' }
      if (!cover) coverNote ||= 'No cover found; you can add one in the app.'
      const row = {
        id: uid(), user_id: ctx.userId, title, author_id: author.id, series_id: null, series_order: null, cover_url: cover,
        description: text(a.description, 'description', { max: 5000 }) || '', total_pages: int(a.total_pages, 'total_pages', 0, 20000) ?? (found?.number_of_pages_median || 0),
        genres: textList(a.genres, 'genres', 10) || [], status: pick(a.status, 'status', BOOK_STATUS) || 'unread', pages_read: 0,
        rating: null, review: '', completed_at: null, created_at: ctx.today,
      }
      await q(ctx.sb.from('books').insert(row))
      return clean({ added: { id: row.id, title, author: author.name, status: row.status, total_pages: row.total_pages, has_cover: !!cover }, cover_note: coverNote })
    },
  },
  {
    name: 'update_book', title: 'Update book', annotations: WRITE,
    description: 'Change a book: status (unread, reading, completed, paused), pages read, total pages, rating (1-5), review or description.',
    inputSchema: { type: 'object', required: ['id'], properties: {
      id: { type: 'string' }, status: { type: 'string', enum: BOOK_STATUS }, pages_read: { type: 'integer' }, total_pages: { type: 'integer' },
      rating: { type: 'integer' }, review: { type: 'string' }, description: { type: 'string' },
    } },
    run: async (ctx, a) => {
      const b = await owned(ctx, 'books', a.id, 'book')
      const row = clean({
        status: pick(a.status, 'status', BOOK_STATUS), pages_read: int(a.pages_read, 'pages_read', 0, 20000), total_pages: int(a.total_pages, 'total_pages', 0, 20000),
        rating: int(a.rating, 'rating', 1, 5), review: text(a.review, 'review', { max: 50000 }), description: text(a.description, 'description', { max: 5000 }),
      })
      if (row.status === 'completed' && !b.completed_at) row.completed_at = ctx.today
      if (!Object.keys(row).length) throw new ToolError('Nothing to change.')
      await q(ctx.sb.from('books').update(row).eq('id', b.id).eq('user_id', ctx.userId))
      return { updated: b.title, ...row }
    },
  },
  {
    name: 'set_reading_goal', title: 'Set daily reading goal', annotations: WRITE,
    description: 'Set the daily reading goal shown in the library: a number of pages or minutes per day.',
    inputSchema: { type: 'object', required: ['goal_type', 'target'], properties: { goal_type: { type: 'string', enum: ['pages', 'minutes'] }, target: { type: 'integer' } } },
    run: async (ctx, a) => {
      const goal_type = pick(a.goal_type, 'goal_type', ['pages', 'minutes'])
      const target = int(a.target, 'target', 1, 1000)
      if (!goal_type || !target) throw new ToolError('goal_type and target are required.')
      const cur = await q(ctx.sb.from('reading_goals').select('id,created_at').eq('user_id', ctx.userId).eq('active', true).limit(1))
      await q(ctx.sb.from('reading_goals').upsert({ id: cur[0]?.id || uid(), user_id: ctx.userId, goal_type, target, active: true, created_at: cur[0]?.created_at || ctx.today }, { onConflict: 'id' }))
      return { daily_goal: { goal_type, target } }
    },
  },

  // ── Reset ──
  {
    name: 'reset_account_data', title: 'Wipe all data', annotations: DESTRUCTIVE,
    description: 'Permanently delete ALL of the user\'s data: tasks, habits and check-ins, goals, journal, notes, library, writing and focus logs. Keeps the account, profile and settings. Only call when the user has explicitly asked to wipe everything, with confirm set to "DELETE EVERYTHING".',
    inputSchema: { type: 'object', required: ['confirm'], properties: { confirm: { type: 'string', description: 'Must be exactly "DELETE EVERYTHING".' } } },
    run: async (ctx, a) => {
      if (a.confirm !== 'DELETE EVERYTHING') throw new ToolError('Nothing was deleted. To wipe the account, set confirm to exactly "DELETE EVERYTHING".')
      const deleted = {}
      for (const t of RESET_ORDER) {
        const { count, error } = await ctx.sb.from(t).delete({ count: 'exact' }).eq('user_id', ctx.userId)
        if (error) {
          if (/does not exist|schema cache/i.test(error.message)) continue
          throw new ToolError(`Stopped while clearing ${t}: ${error.message}. Tables before it were cleared: ${JSON.stringify(deleted)}`)
        }
        deleted[t] = count || 0
      }
      return { deleted, kept: 'Your account, profile, settings and Claude connector key.' }
    },
  },
]
