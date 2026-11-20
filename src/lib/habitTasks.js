// Habit-linked tasks: ticking the task asks for the habit's numbers and checks the habit in;
// checking the habit in anywhere else ticks today's task.
import { sb } from './supabase'
import { emit } from './bus'
import { rowToTask, completeTask } from './tasks'
import { today } from './utils'

export const METRICS = {
  none:       'Just mark it done',
  minutes:    'Minutes spent',
  reading:    'Reading: minutes + pages',
  writing:    'Writing: words + chapters',
  workout:    'Gym workout (from Fitness)',
  screentime: 'Screen time (minutes)',
}

// Completes the open task linked to this habit that is due on or before `date`
export async function syncHabitTask(habitId, date = today()) {
  if (!habitId) return
  try {
    const { data, error } = await sb.from('tasks').select('*').eq('habit_id', habitId).eq('done', false).lte('due', date).order('due', { ascending: true }).limit(1)
    if (error || !data?.[0]) return
    await completeTask(rowToTask(data[0]))
  } catch (e) { console.warn('[habit-task]', e.message) }
}

export async function habitByMetric(metric) {
  const { data } = await sb.from('habits').select('*').eq('metric', metric).eq('archived', false).limit(1)
  return data?.[0] || null
}

// Opens the global "log this habit" dialog; resolves true once the habit is logged
export function askHabitLog(task) {
  return new Promise(resolve => emit('habit-log:open', { task, resolve }))
}

// Ticking a habit that has numbers (minutes, pages, screen time) asks for them first.
// Resolves true once logged; the dialog then ticks the habit's task.
export const ASKS_FOR_NUMBERS = ['minutes', 'reading', 'screentime']
export function askHabitNumbers(habitId, date) {
  return new Promise(resolve => emit('habit-log:open', { task: { habitId }, date, resolve, syncTask: true }))
}

// Use instead of completeTask in the UI. Returns null if the person cancelled.
export async function completeWithHabit(task) {
  if (!task.done && task.habitId) {
    const ok = await askHabitLog(task)
    if (!ok) return null
  }
  return completeTask(task)
}
