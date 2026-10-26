import { sb, dbRun } from './supabase'
import { uid, today } from './utils'
import { emit } from './bus'

export const CATEGORIES = ['Health', 'Mind', 'Creativity', 'Learning', 'Relationships', 'Finance', 'Spirituality', 'Work', 'Other']

export function rowToHabit(r) {
  return {
    id: r.id, name: r.name || '', freq: r.freq || 'daily', trackType: r.track_type || 'simple',
    variants: r.variants || [], category: r.category || '', archived: !!r.archived, createdAt: r.created_at,
  }
}
export function habitPatchToRow(p) {
  const map = { name: 'name', freq: 'freq', trackType: 'track_type', variants: 'variants', category: 'category', archived: 'archived' }
  const row = {}
  for (const [k, v] of Object.entries(p)) if (k in map) row[map[k]] = v
  return row
}

export async function loadHabitData() {
  const [h, l, w] = await Promise.all([
    sb.from('habits').select('*'),
    sb.from('habit_logs').select('*'),
    sb.from('writing_logs').select('*').order('date', { ascending: false }),
  ])
  const logs = {}
  ;(l.data || []).forEach(x => { (logs[x.habit_id] ||= []).push({ date: x.date, variant: x.variant, duration_min: x.duration_min }) })
  return { habits: (h.data || []).map(rowToHabit), logs, writing: w.data || [] }
}

export async function createHabit(fields) {
  const h = { id: uid(), name: fields.name.trim(), freq: fields.freq || 'daily', trackType: fields.trackType || 'simple',
    variants: fields.variants || [], category: fields.category || '', archived: false, createdAt: today() }
  await dbRun('Create habit', () => sb.from('habits').insert({ id: h.id, created_at: h.createdAt, ...habitPatchToRow(h) }))
  emit('habits')
  return h
}

export async function updateHabit(id, patch) {
  await dbRun('Update habit', () => sb.from('habits').update(habitPatchToRow(patch)).eq('id', id))
}

export async function deleteHabit(id) {
  await dbRun('Delete habit', () => sb.from('habits').delete().eq('id', id))
  emit('habits')
}

// Set the log for a day. entry = null removes it.
export async function setLog(habitId, date, entry) {
  if (!entry) {
    await dbRun('Clear habit day', () => sb.from('habit_logs').delete().eq('habit_id', habitId).eq('date', date))
  } else {
    await dbRun('Log habit', () => sb.from('habit_logs').upsert({
      habit_id: habitId, date, variant: entry.variant || null, duration_min: entry.duration_min || null,
    }))
  }
  emit('habits:log', { habitId, date, entry })
}

export async function saveWriting(existing, date, chapters, words) {
  const row = {
    id: existing?.id || uid(), date, chapters: chapters || 0, word_count: words || 0,
    created_at: existing?.created_at || date, updated_at: new Date().toISOString(),
  }
  if (!row.chapters && !row.word_count && existing) {
    await dbRun('Clear writing', () => sb.from('writing_logs').delete().eq('id', existing.id))
    emit('writing')
    return null
  }
  await dbRun('Save writing', () => sb.from('writing_logs').upsert(row, { onConflict: 'user_id,date' }))
  emit('writing')
  return row
}
