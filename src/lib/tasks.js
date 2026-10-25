import { sb, dbRun } from './supabase'
import { uid, today, addDays, parseYmd, ymd, PRIORITY_ORDER } from './utils'
import { emit } from './bus'

export const RECURRENCE = {
  daily:    'Every day',
  weekdays: 'Weekdays',
  weekly:   'Every week',
  monthly:  'Every month',
}

export const STATUSES = [
  { id: 'todo',        label: 'To do' },
  { id: 'in_progress', label: 'Doing' },
  { id: 'in_review',   label: 'Waiting' },
  { id: 'done',        label: 'Done' },
]

export function rowToTask(r) {
  return {
    id: r.id, title: r.title || '', notes: r.notes || '', priority: r.priority || 'P3',
    due: r.due || null, project: r.project || '', type: r.type || '',
    done: !!r.done, completedAt: r.completed_at || null, depIds: r.dep_ids || [],
    createdAt: r.created_at, status: r.kanban_status || (r.done ? 'done' : 'todo'),
    isRecurring: !!r.is_recurring, recurrenceRule: r.recurrence_rule || 'daily',
    recurrenceEnd: r.recurrence_end || null, parentId: r.parent_task_id || null,
  }
}

// Map a partial camelCase patch to DB columns
export function patchToRow(p) {
  const map = {
    title: 'title', notes: 'notes', priority: 'priority', due: 'due', project: 'project',
    type: 'type', done: 'done', completedAt: 'completed_at', depIds: 'dep_ids',
    status: 'kanban_status', isRecurring: 'is_recurring', recurrenceRule: 'recurrence_rule',
    recurrenceEnd: 'recurrence_end',
  }
  const row = {}
  for (const [k, v] of Object.entries(p)) {
    if (!(k in map)) continue
    row[map[k]] = (v === '' && ['due', 'project', 'type', 'recurrenceEnd'].includes(k)) ? null : v
  }
  return row
}

export async function loadTasks() {
  const { data, error } = await sb.from('tasks').select('*')
  if (error) throw error
  return (data || []).map(rowToTask)
}

export async function createTask(fields) {
  const t = {
    id: uid(), title: fields.title.trim(), notes: fields.notes || '', priority: fields.priority || 'P3',
    due: fields.due || null, project: fields.project || '', type: fields.type || '',
    done: false, completedAt: null, depIds: [], createdAt: today(), status: fields.status || 'todo',
    isRecurring: false, recurrenceRule: 'daily', recurrenceEnd: null, parentId: null,
  }
  if (t.status === 'done') { t.done = true; t.completedAt = today() }
  await dbRun('Create task', () => sb.from('tasks').insert({ id: t.id, created_at: t.createdAt, ...patchToRow(t) }))
  emit('tasks')
  return t
}

export async function updateTask(id, patch) {
  await dbRun('Update task', () => sb.from('tasks').update(patchToRow(patch)).eq('id', id))
}

export async function deleteTask(id) {
  await dbRun('Delete task', () => sb.from('tasks').delete().eq('id', id))
  emit('tasks')
}

export function nextOccurrence(task) {
  const base = task.due && task.due > today() ? task.due : today()
  const d = parseYmd(base)
  switch (task.recurrenceRule) {
    case 'weekdays': do { d.setDate(d.getDate() + 1) } while (d.getDay() === 0 || d.getDay() === 6); break
    case 'weekly':   d.setDate(d.getDate() + 7); break
    case 'monthly':  d.setMonth(d.getMonth() + 1); break
    default:         d.setDate(d.getDate() + 1)
  }
  const next = ymd(d)
  if (task.recurrenceEnd && next > task.recurrenceEnd) return null
  return next
}

// Completes a task. Recurring tasks log a done copy and roll forward.
// Returns { updated, undo } so callers can update state and offer Undo.
export async function completeTask(task) {
  if (task.isRecurring && !task.done) {
    const next = nextOccurrence(task)
    if (next) {
      const copyId = uid()
      await dbRun('Log recurring', () => sb.from('tasks').insert({
        id: copyId, created_at: today(), parent_task_id: task.id,
        ...patchToRow({ ...task, isRecurring: false, done: true, completedAt: today(), status: 'done' }),
      }))
      await updateTask(task.id, { due: next })
      emit('tasks')
      return {
        updated: { ...task, due: next },
        rolledTo: next,
        undo: async () => {
          await dbRun('Undo', () => sb.from('tasks').delete().eq('id', copyId))
          await updateTask(task.id, { due: task.due })
          emit('tasks')
        },
      }
    }
  }
  const done = !task.done
  const patch = { done, completedAt: done ? today() : null, status: done ? 'done' : (task.status === 'done' ? 'todo' : task.status) }
  await updateTask(task.id, patch)
  emit('tasks')
  return {
    updated: { ...task, ...patch },
    undo: async () => {
      await updateTask(task.id, { done: task.done, completedAt: task.completedAt, status: task.status })
      emit('tasks')
    },
  }
}

export function sortTasks(a, b) {
  if (a.done !== b.done) return a.done ? 1 : -1
  const pa = PRIORITY_ORDER[a.priority] ?? 2, pb = PRIORITY_ORDER[b.priority] ?? 2
  if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1
  if (pa !== pb) return pa - pb
  if (a.due && !b.due) return -1
  if (!a.due && b.due) return 1
  return (b.createdAt || '').localeCompare(a.createdAt || '')
}

// The single most useful thing to do next.
export function pickNextUp(tasks) {
  const t = today()
  const open = tasks.filter(x => !x.done)
  const score = x => {
    let s = 0
    if (x.due && x.due < t) s += 300
    else if (x.due === t) s += 200
    else if (x.due && x.due <= addDays(t, 2)) s += 60
    s += (3 - (PRIORITY_ORDER[x.priority] ?? 2)) * 70
    if (x.status === 'in_progress') s += 90
    return s
  }
  return open.sort((a, b) => score(b) - score(a))[0] || null
}
