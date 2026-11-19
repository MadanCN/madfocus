// Tools exposed to Claude through the MCP endpoint (api/mcp.js).
// Every query runs with the service role, so every query MUST be scoped to ctx.userId.
import crypto from 'node:crypto'

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
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Children before parents. Keeps the account, profile and Claude keys.
const RESET_ORDER = ['habit_logs', 'goal_milestones', 'reading_sessions', 'notes', 'note_folders', 'books', 'authors', 'series',
  'reading_goals', 'tasks', 'habits', 'goals', 'journal_entries', 'pomodoro_sessions', 'writing_logs', 'custom_data']

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
  })
  if (row.project === '') row.project = null
  if (row.type === '') row.type = null
  if (creating && row.recurrence_rule && row.is_recurring === undefined) row.is_recurring = true
  return row
}

async function insertTask(ctx, a) {
  const row = taskFields(a, true)
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
        q(sb.from('habit_logs').select('habit_id,date,variant,duration_min').eq('user_id', u).gte('date', since).lte('date', day)),
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
            done_on_date: !!todays, variant_on_date: todays?.variant || undefined, minutes_on_date: todays?.duration_min || undefined,
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
        q(ctx.sb.from('habit_logs').select('habit_id,date,variant,duration_min').eq('user_id', ctx.userId).gte('date', since)),
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
            log: entries.filter(e => e.date >= from).sort((x, y) => x.date.localeCompare(y.date)),
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
    } },
    run: async (ctx, a) => {
      const h = {
        id: uid(), user_id: ctx.userId, created_at: ctx.today,
        name: text(a.name, 'name', { max: 200, required: true }),
        freq: pick(a.freq, 'freq', FREQS) || 'daily', track_type: pick(a.track_type, 'track_type', TRACK) || 'simple',
        variants: textList(a.variants, 'variants') || [], category: pick(a.category, 'category', CATEGORIES) || '', archived: false,
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
    } },
    run: async (ctx, a) => {
      const h = await owned(ctx, 'habits', a.id, 'habit')
      const row = clean({
        name: a.name !== undefined ? text(a.name, 'name', { max: 200, required: true }) : undefined,
        freq: pick(a.freq, 'freq', FREQS), track_type: pick(a.track_type, 'track_type', TRACK),
        variants: textList(a.variants, 'variants'), category: pick(a.category, 'category', CATEGORIES), archived: bool(a.archived, 'archived'),
      })
      if (!Object.keys(row).length) throw new ToolError('Nothing to change.')
      const r = await q(ctx.sb.from('habits').update(row).eq('id', h.id).eq('user_id', ctx.userId).select().single())
      return { updated: { id: r.id, name: r.name, freq: r.freq, track_type: r.track_type, category: r.category, variants: r.variants, archived: r.archived } }
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
