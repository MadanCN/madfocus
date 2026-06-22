import React, { useState, useEffect } from 'react'
import { sb, dbRun } from '../lib/supabase'
import { Modal, Confirm, Empty, useToast, PlusIcon, EditIcon, TrashIcon } from '../components/ui'

const PRIORITY_META = {
  P1: { label: 'Critical', cls: 'tag-p1' },
  P2: { label: 'High',     cls: 'tag-p2' },
  P3: { label: 'Normal',   cls: 'tag-p3' },
  P4: { label: 'Low',      cls: 'tag-p4'  },
}
const RECURRENCE_LABELS = {
  daily:    'Daily',
  weekdays: 'Weekdays',
  weekly:   'Weekly',
  monthly:  'Monthly',
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function today() { return new Date().toISOString().slice(0, 10) }
function dateLabel(d) {
  if (!d) return ''
  const diff = Math.round((new Date(d) - new Date(today())) / 86400000)
  if (diff < 0)   return `${Math.abs(diff)}d overdue`
  if (diff === 0) return 'Due today'
  if (diff === 1) return 'Due tomorrow'
  return `Due ${new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
}
function taskToRow(t) {
  return {
    id: t.id, title: t.title, notes: t.notes || '', priority: t.priority,
    due: t.due || null, project: t.project || null, type: t.type || null,
    done: t.done, completed_at: t.completedAt || null, dep_ids: t.depIds || [],
    created_at: t.createdAt, kanban_status: t.kanbanStatus || 'todo',
    is_recurring: t.isRecurring || false,
    recurrence_rule: t.recurrenceRule || null,
    recurrence_end: t.recurrenceEnd || null,
  }
}
function rowToTask(r) {
  return {
    id: r.id, title: r.title, notes: r.notes || '', priority: r.priority,
    due: r.due, project: r.project, type: r.type, done: r.done,
    completedAt: r.completed_at, depIds: r.dep_ids || [], createdAt: r.created_at,
    kanbanStatus: r.kanban_status || 'todo',
    isRecurring: r.is_recurring || false,
    recurrenceRule: r.recurrence_rule || null,
    recurrenceEnd: r.recurrence_end || null,
  }
}
const BLANK = { title: '', notes: '', priority: 'P3', due: '', project: '', type: '', depIds: [], isRecurring: false, recurrenceRule: 'daily', recurrenceEnd: '' }

export default function Tasks() {
  const toast = useToast()
  const [tasks, setTasks]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ status: 'active', priority: '', project: '', recurring: '' })
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(BLANK)
  const [editId, setEditId] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [depQ, setDepQ]     = useState('')
  const [tab, setTab]       = useState('tasks') // 'tasks' | 'recurring'

  useEffect(() => {
    sb.from('tasks').select('*').then(({ data, error }) => {
      if (error) toast('Failed to load tasks', 'error')
      else setTasks((data || []).map(rowToTask))
      setLoading(false)
    })
  }, [])

  async function saveTask() {
    if (!form.title.trim()) return
    setSaving(true)
    const existing = editId ? tasks.find(t => t.id === editId) : null
    const task = {
      id: editId || uid(),
      ...form,
      done: existing?.done ?? false,
      completedAt: existing?.completedAt ?? null,
      createdAt: existing?.createdAt ?? today(),
      kanbanStatus: existing?.kanbanStatus ?? 'todo',
    }
    try {
      await dbRun('Save task', () => sb.from('tasks').upsert(taskToRow(task)))
      setTasks(p => editId ? p.map(t => t.id === editId ? task : t) : [task, ...p])
      toast(editId ? 'Task updated ✓' : 'Task added ✓')
      closeModal()
    } catch { toast('Save failed', 'error') }
    finally { setSaving(false) }
  }

  async function toggleDone(id) {
    const t = tasks.find(t => t.id === id); if (!t) return
    const updated = { ...t, done: !t.done, completedAt: !t.done ? today() : null }
    setTasks(p => p.map(x => x.id === id ? updated : x))
    try { await dbRun('Toggle', () => sb.from('tasks').upsert(taskToRow(updated))) }
    catch { setTasks(p => p.map(x => x.id === id ? t : x)); toast('Update failed', 'error') }
  }

  async function pauseRecurring(id) {
    const t = tasks.find(t => t.id === id); if (!t) return
    const updated = { ...t, isRecurring: false }
    setTasks(p => p.map(x => x.id === id ? updated : x))
    try { await dbRun('Pause', () => sb.from('tasks').upsert(taskToRow(updated))); toast('Recurring task paused') }
    catch { toast('Update failed', 'error') }
  }

  async function doDelete() {
    const id = confirm.id
    setTasks(p => p.filter(t => t.id !== id).map(t => ({ ...t, depIds: (t.depIds || []).filter(d => d !== id) })))
    setConfirm(null)
    try { await dbRun('Delete', () => sb.from('tasks').delete().eq('id', id)); toast('Task deleted ✓') }
    catch { toast('Delete failed', 'error') }
  }

  function openEdit(t) {
    setForm({
      title: t.title, notes: t.notes || '', priority: t.priority,
      due: t.due || '', project: t.project || '', type: t.type || '', depIds: t.depIds || [],
      isRecurring: t.isRecurring || false,
      recurrenceRule: t.recurrenceRule || 'daily',
      recurrenceEnd: t.recurrenceEnd || '',
    })
    setEditId(t.id); setModal(true)
  }
  function closeModal() { setModal(false); setForm(BLANK); setEditId(null); setDepQ('') }
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const projects = [...new Set(tasks.map(t => t.project).filter(Boolean))]

  const recurringTasks = tasks.filter(t => t.isRecurring)

  const filtered = tasks
    .filter(t => {
      if (tab === 'recurring') return t.isRecurring
      if (t.isRecurring && filter.status !== 'done') return false // show recurring separately
      if (filter.status === 'active' && t.done) return false
      if (filter.status === 'done' && !t.done) return false
      if (filter.priority && t.priority !== filter.priority) return false
      if (filter.project  && t.project  !== filter.project)  return false
      return true
    })
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1
      const po = { P1: 0, P2: 1, P3: 2, P4: 3 }
      if (po[a.priority] !== po[b.priority]) return po[a.priority] - po[b.priority]
      if (a.due && b.due) return new Date(a.due) - new Date(b.due)
      return a.due ? -1 : b.due ? 1 : 0
    })

  const depResults = depQ.length > 1
    ? tasks.filter(t => t.id !== editId && !(form.depIds || []).includes(t.id)
        && t.title.toLowerCase().includes(depQ.toLowerCase())).slice(0, 6)
    : []

  if (loading) return <Loader />

  return (
    <div className="p-9 max-w-[900px]">
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-sub">
            {tasks.filter(t => !t.done && !t.isRecurring).length} active ·{' '}
            {tasks.filter(t => t.done).length} done ·{' '}
            {recurringTasks.length} recurring
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal(true)}>
          <PlusIcon className="w-3.5 h-3.5" /> Add task
        </button>
      </div>

      {/* Tab toggle */}
      <div className="flex gap-1 mb-5">
        {[['tasks', 'All Tasks'], ['recurring', 'Recurring']].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className="px-3 py-1.5 rounded-full border text-[12px] transition-all"
            style={{
              background: tab === t ? 'var(--c-text)' : 'transparent',
              color: tab === t ? 'var(--c-bg)' : 'var(--c-muted)',
              borderColor: tab === t ? 'var(--c-text)' : 'var(--c-border)',
            }}>
            {label}{t === 'recurring' && recurringTasks.length > 0 ? ` (${recurringTasks.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'tasks' && (
        <div className="flex gap-2 flex-wrap items-center mb-5">
          {['all', 'active', 'done'].map(s => (
            <button key={s} onClick={() => setFilter(p => ({ ...p, status: s }))}
              className="px-3 py-1.5 rounded-full border text-[12px] transition-all"
              style={{
                background: filter.status === s ? 'var(--c-text)' : 'transparent',
                color: filter.status === s ? 'var(--c-bg)' : 'var(--c-muted)',
                borderColor: filter.status === s ? 'var(--c-text)' : 'var(--c-border)',
              }}>
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
          <select className="form-select text-[12px] py-1.5 w-auto"
            value={filter.priority} onChange={e => setFilter(p => ({ ...p, priority: e.target.value }))}>
            <option value="">All priorities</option>
            {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{k} – {v.label}</option>)}
          </select>
          <select className="form-select text-[12px] py-1.5 w-auto"
            value={filter.project} onChange={e => setFilter(p => ({ ...p, project: e.target.value }))}>
            <option value="">All projects</option>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      )}

      {/* Recurring tab view */}
      {tab === 'recurring' && (
        <div>
          {recurringTasks.length === 0
            ? <Empty icon={<RecurIcon className="w-9 h-9 mx-auto" />} title="No recurring tasks" sub="Create a task and enable recurring to see it here" action={<button className="btn btn-primary" onClick={() => setModal(true)}><PlusIcon className="w-3.5 h-3.5" /> Add recurring task</button>} />
            : <div className="flex flex-col gap-2">
                {recurringTasks.map(t => (
                  <div key={t.id} className="rounded-card px-4 py-3.5 flex items-start gap-3 group" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                    <div className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'var(--c-accent-light)' }}>
                      <RecurIcon className="w-4 h-4" style={{ color: 'var(--c-accent)' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium mb-1" style={{ color: 'var(--c-text)' }}>{t.title}</p>
                      <div className="flex gap-1.5 flex-wrap items-center">
                        <span className={`tag ${PRIORITY_META[t.priority]?.cls}`}>{t.priority}</span>
                        <span className="tag" style={{ background: 'var(--c-accent-light)', color: 'var(--c-accent)' }}>
                          ↻ {RECURRENCE_LABELS[t.recurrenceRule] || t.recurrenceRule}
                        </span>
                        {t.recurrenceEnd && <span className="tag" style={{ background: 'var(--c-border-light)', color: 'var(--c-muted)' }}>Until {t.recurrenceEnd}</span>}
                        {t.project && <span className="tag" style={{ background: 'var(--c-border-light)', color: 'var(--c-muted)' }}>{t.project}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={() => openEdit(t)} className="btn btn-ghost btn-sm btn-icon" title="Edit"><EditIcon className="w-3.5 h-3.5" /></button>
                      <button onClick={() => pauseRecurring(t.id)} className="btn btn-ghost btn-sm px-2 py-1 text-[11px]" title="Pause recurring">Pause</button>
                      <button onClick={() => setConfirm({ id: t.id, title: t.title })} className="btn btn-ghost btn-sm btn-icon"><TrashIcon className="w-3 h-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {/* Task list */}
      {tab === 'tasks' && (
        filtered.length === 0
          ? <Empty icon={<TaskEmptyIcon />} title="No tasks here" sub={filter.status === 'active' ? "Add a task to get started" : "Nothing here yet"} />
          : <div className="flex flex-col gap-1.5">
              {filtered.map(t => {
                const overdue = !t.done && t.due && new Date(t.due) < new Date(today())
                const deps = (t.depIds || []).map(did => tasks.find(x => x.id === did)?.title).filter(Boolean)
                return (
                  <div key={t.id}
                    className="rounded-card px-4 py-3.5 flex items-start gap-3 group transition-all"
                    style={{
                      background: 'var(--c-surface)',
                      border: '1px solid var(--c-border)',
                      opacity: t.done ? 0.55 : 1,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--c-faint)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-border)' }}
                  >
                    <button onClick={() => toggleDone(t.id)}
                      className="w-[18px] h-[18px] rounded-[5px] border flex-shrink-0 mt-0.5 flex items-center justify-center transition-all"
                      style={{
                        background: t.done ? 'var(--c-accent)' : 'transparent',
                        borderColor: t.done ? 'var(--c-accent)' : 'var(--c-border)',
                      }}
                    >
                      {t.done && <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium mb-1" style={{ color: t.done ? 'var(--c-muted)' : 'var(--c-text)', textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</p>
                      <div className="flex gap-1.5 flex-wrap items-center">
                        <span className={`tag ${PRIORITY_META[t.priority]?.cls}`}>{t.priority}</span>
                        {t.project && <span className="tag" style={{ background: 'var(--c-border-light)', color: 'var(--c-muted)' }}>{t.project}</span>}
                        {t.type    && <span className="tag" style={{ background: 'var(--c-border-light)', color: 'var(--c-muted)' }}>{t.type}</span>}
                        {t.due && <span className="tag" style={{ background: overdue ? 'var(--c-danger-light)' : 'var(--c-border-light)', color: overdue ? 'var(--c-danger)' : 'var(--c-muted)' }}>{dateLabel(t.due)}</span>}
                        {deps.map(d => <span key={d} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border" style={{ background: 'var(--c-border-light)', color: 'var(--c-muted)', borderColor: 'var(--c-border)' }}>↳ {d}</span>)}
                      </div>
                      {t.notes && <p className="text-[12px] mt-1.5" style={{ color: 'var(--c-muted)' }}>{t.notes}</p>}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={() => openEdit(t)} className="btn btn-ghost btn-sm btn-icon"><EditIcon className="w-3.5 h-3.5"/></button>
                      <button onClick={() => setConfirm({ id: t.id, title: t.title })} className="btn btn-ghost btn-sm btn-icon"><TrashIcon className="w-3.5 h-3.5"/></button>
                    </div>
                  </div>
                )
              })}
            </div>
      )}

      {/* Add/Edit modal */}
      <Modal open={modal} onClose={closeModal} title={editId ? 'Edit task' : 'New task'}>
        <div className="space-y-4">
          <div>
            <label className="form-label">Title *</label>
            <input className="form-input" placeholder="What needs to be done?"
              value={form.title} onChange={e => f('title', e.target.value)} autoFocus
              onKeyDown={e => e.key === 'Enter' && !form.isRecurring && saveTask()} />
          </div>
          <div>
            <label className="form-label">Notes</label>
            <textarea className="form-textarea" rows={2} placeholder="Any context…"
              value={form.notes} onChange={e => f('notes', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Priority</label>
              <select className="form-select" value={form.priority} onChange={e => f('priority', e.target.value)}>
                {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{k} – {v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Due date</label>
              <input className="form-input" type="date" value={form.due} onChange={e => f('due', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Project</label>
              <input className="form-input" placeholder="e.g. Work, Personal" list="proj-list"
                value={form.project} onChange={e => f('project', e.target.value)} />
              <datalist id="proj-list">{projects.map(p => <option key={p} value={p}/>)}</datalist>
            </div>
            <div>
              <label className="form-label">Type</label>
              <input className="form-input" placeholder="e.g. Bug, Meeting"
                value={form.type} onChange={e => f('type', e.target.value)} />
            </div>
          </div>

          {/* Recurring toggle */}
          <div className="rounded-[10px] p-4" style={{ background: 'var(--c-border-light)', border: '1px solid var(--c-border)' }}>
            <label className="flex items-center gap-3 cursor-pointer mb-3">
              <div
                className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
                style={{ background: form.isRecurring ? 'var(--c-accent)' : 'var(--c-border)' }}
                onClick={() => f('isRecurring', !form.isRecurring)}
              >
                <div
                  className="absolute top-0.5 rounded-full w-4 h-4 bg-white transition-transform shadow-sm"
                  style={{ left: form.isRecurring ? 18 : 2 }}
                />
              </div>
              <span className="text-[13px] font-medium" style={{ color: 'var(--c-text)' }}>Recurring task</span>
            </label>
            {form.isRecurring && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Repeat</label>
                  <select className="form-select" value={form.recurrenceRule} onChange={e => f('recurrenceRule', e.target.value)}>
                    {Object.entries(RECURRENCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">End date (optional)</label>
                  <input className="form-input" type="date" value={form.recurrenceEnd} onChange={e => f('recurrenceEnd', e.target.value)} />
                </div>
              </div>
            )}
          </div>

          {/* Dependencies */}
          <div>
            <label className="form-label">Depends on</label>
            <input className="form-input" placeholder="Search tasks to link…"
              value={depQ} onChange={e => setDepQ(e.target.value)} />
            {depResults.length > 0 && (
              <div className="border border-border rounded-[8px] mt-1 overflow-hidden shadow-md" style={{ background: 'var(--c-surface)' }}>
                {depResults.map(t => (
                  <button key={t.id} onClick={() => { f('depIds', [...(form.depIds || []), t.id]); setDepQ('') }}
                    className="w-full text-left px-3 py-2 text-[13px] transition-colors"
                    style={{ borderBottom: '1px solid var(--c-border-light)', color: 'var(--c-text)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-accent-light)'; e.currentTarget.style.color = 'var(--c-accent)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--c-text)' }}
                  >
                    {t.title} <span className="text-[11px]" style={{ color: 'var(--c-muted)' }}>{t.priority}</span>
                  </button>
                ))}
              </div>
            )}
            {(form.depIds || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.depIds.map(did => {
                  const dt = tasks.find(t => t.id === did)
                  return (
                    <span key={did} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border" style={{ background: 'var(--c-border-light)', color: 'var(--c-muted)', borderColor: 'var(--c-border)' }}>
                      ↳ {dt?.title || did}
                      <button onClick={() => f('depIds', form.depIds.filter(d => d !== did))} style={{ color: 'var(--c-faint)' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--c-danger)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--c-faint)'}>×</button>
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
            <button className="btn btn-primary" onClick={saveTask} disabled={saving || !form.title.trim()}>
              {saving ? 'Saving…' : editId ? 'Update task' : 'Add task'}
            </button>
          </div>
        </div>
      </Modal>

      <Confirm open={!!confirm} title="Delete task?"
        body={`"${confirm?.title}" will be permanently removed.`}
        onOk={doDelete} onCancel={() => setConfirm(null)} />
    </div>
  )
}

function Loader() { return <div className="flex items-center justify-center h-64 text-[13px]" style={{ color: 'var(--c-muted)' }}>Loading…</div> }
function TaskEmptyIcon() { return <svg className="w-9 h-9 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg> }
function RecurIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg> }
