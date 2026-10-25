import React, { useEffect, useRef, useState } from 'react'
import { Trash2, Timer, Repeat, CalendarDays, Flag, Hash, Tag, Link2, X } from 'lucide-react'
import { Sheet, SaveState, Check2, useConfirm, useToast, Spinner } from './ui'
import { sb } from '../lib/supabase'
import { rowToTask, updateTask, deleteTask, completeTask, RECURRENCE, STATUSES } from '../lib/tasks'
import { useAutosave } from '../lib/useAutosave'
import { emit } from '../lib/bus'
import { today, addDays, relDay, fmtDay, PRIORITIES } from '../lib/utils'
import { useFocus } from '../contexts/FocusContext'

export default function TaskSheet({ id, onClose }) {
  const [task, setTask] = useState(null)
  const [all, setAll] = useState([])
  const [depQ, setDepQ] = useState('')
  const confirm = useConfirm()
  const toast = useToast()
  const focus = useFocus()
  const notesRef = useRef(null)
  const { queue, flush, status, retry } = useAutosave((key, patch) => updateTask(key, patch).then(() => emit('tasks')), 600)

  useEffect(() => {
    if (!id) return
    setTask(null); setDepQ('')
    Promise.all([
      sb.from('tasks').select('*').eq('id', id).single(),
      sb.from('tasks').select('id,title,project,done'),
    ]).then(([{ data }, { data: rows }]) => {
      if (data) setTask(rowToTask(data))
      else { toast('That task no longer exists.', 'error'); onClose() }
      setAll(rows || [])
    })
  }, [id])

  useEffect(() => { autoGrow(notesRef.current) }, [task?.notes, task?.id])

  function set(patch) {
    setTask(t => ({ ...t, ...patch }))
    queue(task.id, patch)
    emit('task:patch', { id: task.id, patch })
  }

  async function close() { await flush(); onClose() }

  async function toggleDone() {
    await flush()
    try {
      const res = await completeTask(task)
      setTask(res.updated)
      emit('task:patch', { id: task.id, patch: res.updated })
      if (res.rolledTo) toast(`Logged. Next one ${relDay(res.rolledTo).toLowerCase()}`, { action: { label: 'Undo', onClick: async () => { await res.undo(); setTask(task) } } })
    } catch { toast('Couldn’t update the task.', 'error') }
  }

  async function remove() {
    const ok = await confirm({
      title: 'Delete this task?',
      body: `“${task.title || 'Untitled'}” will be removed for good. This can’t be undone.`,
      confirmLabel: 'Delete task',
    })
    if (!ok) return
    try {
      await deleteTask(task.id)
      emit('task:removed', { id: task.id })
      toast('Task deleted')
      onClose()
    } catch { toast('Couldn’t delete the task.', 'error') }
  }

  function startFocus() {
    focus.start({ mode: 'focus', taskId: task.id, taskTitle: task.title })
    focus.openOverlay()
    close()
  }

  const projects = [...new Set(all.map(t => t.project).filter(Boolean))].sort()
  const depResults = depQ.trim().length > 0 && task
    ? all.filter(t => t.id !== task.id && !task.depIds.includes(t.id) && t.title.toLowerCase().includes(depQ.toLowerCase())).slice(0, 6)
    : []

  return (
    <Sheet open={!!id} onClose={close} label="Task details"
      title={task ? <span className="inline-flex items-center gap-2"><SaveState status={status} onRetry={retry} /></span> : null}
      headerExtra={task && (
        <button onClick={remove} className="btn btn-quiet btn-sm btn-icon" aria-label="Delete task" data-tip="Delete">
          <Trash2 size={16} />
        </button>
      )}
      footer={task && (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-faint mr-auto">Added {fmtDay(task.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          {!task.done && <button onClick={startFocus} className="btn btn-outline btn-sm"><Timer size={15} /> Focus on this</button>}
          <button onClick={toggleDone} className={`btn btn-sm ${task.done ? 'btn-outline' : 'btn-primary'}`}>
            {task.done ? 'Mark not done' : task.isRecurring ? 'Done for now' : 'Mark done'}
          </button>
        </div>
      )}>
      {!task ? <div className="py-20 flex justify-center"><Spinner /></div> : (
        <div className="flex flex-col gap-6">
          {/* Title */}
          <div className="flex items-start gap-3 pt-1">
            <div className="pt-[7px]"><Check2 checked={task.done} onChange={toggleDone} label="Done" /></div>
            <textarea value={task.title} rows={1} aria-label="Title"
              onChange={e => { set({ title: e.target.value }); autoGrow(e.target) }}
              ref={el => autoGrow(el)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); notesRef.current?.focus() } }}
              placeholder="Task name"
              className="flex-1 bg-transparent outline-none resize-none text-[21px] leading-[30px] font-semibold tracking-[-0.01em] placeholder:text-faint"
              style={{ textDecoration: task.done ? 'line-through' : 'none', color: task.done ? 'var(--c-muted)' : undefined }} />
          </div>

          {/* Status */}
          <div className="seg w-full" role="group" aria-label="Status">
            {STATUSES.map(s => (
              <button key={s.id} className="flex-1" aria-pressed={task.status === s.id}
                onClick={() => set({ status: s.id, done: s.id === 'done', completedAt: s.id === 'done' ? today() : null })}>
                {s.label}
              </button>
            ))}
          </div>

          {/* Properties */}
          <dl className="grid grid-cols-[112px_1fr] gap-x-3 gap-y-4 items-start">
            <Prop icon={CalendarDays} label="Due">
              <div className="flex flex-wrap items-center gap-1.5">
                <input type="date" className="input h-[34px] w-[160px]" value={task.due || ''} onChange={e => set({ due: e.target.value || null })} aria-label="Due date" />
                {[['Today', today()], ['Tomorrow', addDays(today(), 1)], ['Next week', addDays(today(), 7)]].map(([l, v]) => (
                  <button key={l} className="pick h-[30px] text-[12.5px]" aria-pressed={task.due === v} onClick={() => set({ due: v })}>{l}</button>
                ))}
                {task.due && <button className="btn btn-quiet btn-sm" onClick={() => set({ due: null })}>Clear</button>}
              </div>
            </Prop>

            <Prop icon={Flag} label="Priority">
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(PRIORITIES).map(([k, v]) => (
                  <button key={k} className="pick h-[30px] text-[12.5px]" aria-pressed={task.priority === k} onClick={() => set({ priority: k })}>
                    <span className="w-2 h-2 rounded-full" style={{ background: v.color }} /> {v.label}
                  </button>
                ))}
              </div>
            </Prop>

            <Prop icon={Hash} label="Project">
              <input className="input h-[34px]" list="mf-projects" placeholder="None" value={task.project}
                onChange={e => set({ project: e.target.value })} aria-label="Project" />
              <datalist id="mf-projects">{projects.map(p => <option key={p} value={p} />)}</datalist>
            </Prop>

            <Prop icon={Tag} label="Type">
              <input className="input h-[34px]" placeholder="Call, writing, admin…" value={task.type}
                onChange={e => set({ type: e.target.value })} aria-label="Type" />
            </Prop>

            <Prop icon={Repeat} label="Repeat">
              <div className="flex flex-wrap items-center gap-2">
                <select className="input h-[34px] w-auto" aria-label="Repeat"
                  value={task.isRecurring ? task.recurrenceRule : 'none'}
                  onChange={e => e.target.value === 'none'
                    ? set({ isRecurring: false })
                    : set({ isRecurring: true, recurrenceRule: e.target.value, due: task.due || today() })}>
                  <option value="none">Doesn’t repeat</option>
                  {Object.entries(RECURRENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                {task.isRecurring && (
                  <label className="flex items-center gap-2 text-[13px] text-muted">
                    until
                    <input type="date" className="input h-[34px] w-[150px]" value={task.recurrenceEnd || ''}
                      onChange={e => set({ recurrenceEnd: e.target.value || null })} aria-label="Repeat until" />
                  </label>
                )}
              </div>
            </Prop>

            <Prop icon={Link2} label="Waiting on">
              <div>
                {task.depIds.length > 0 && (
                  <div className="flex flex-col gap-1 mb-2">
                    {task.depIds.map(did => {
                      const d = all.find(x => x.id === did)
                      return (
                        <div key={did} className="flex items-center gap-2 text-[13.5px] min-h-[32px] px-2.5 rounded-[8px] bg-sunken">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: d?.done ? 'var(--c-good)' : 'var(--c-warn)' }} />
                          <span className={`flex-1 truncate ${d?.done ? 'line-through text-muted' : ''}`}>{d?.title || 'Deleted task'}</span>
                          <button aria-label="Remove link" className="text-faint hover:text-ink p-1"
                            onClick={() => set({ depIds: task.depIds.filter(x => x !== did) })}><X size={14} /></button>
                        </div>
                      )
                    })}
                  </div>
                )}
                <div className="relative">
                  <input className="input h-[34px]" placeholder="Link a task this depends on…" value={depQ}
                    onChange={e => setDepQ(e.target.value)} aria-label="Search tasks to link" />
                  {depResults.length > 0 && (
                    <div className="absolute z-10 left-0 right-0 top-[calc(100%+4px)] bg-surface rounded-[10px] shadow-pop py-1">
                      {depResults.map(r => (
                        <button key={r.id} className="w-full text-left px-3 h-9 text-[13.5px] hover:bg-sunken truncate"
                          onClick={() => { set({ depIds: [...task.depIds, r.id] }); setDepQ('') }}>{r.title}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Prop>
          </dl>

          {/* Notes */}
          <div>
            <label className="label" htmlFor="task-notes">Notes</label>
            <textarea id="task-notes" ref={notesRef} value={task.notes} placeholder="Context, links, next steps…"
              onChange={e => { set({ notes: e.target.value }); autoGrow(e.target) }}
              className="input min-h-[120px] leading-relaxed" />
          </div>
        </div>
      )}
    </Sheet>
  )
}

function Prop({ icon: Icon, label, children }) {
  return (
    <>
      <dt className="flex items-center gap-2 text-[13px] text-muted h-[34px]"><Icon size={15} className="text-faint" /> {label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  )
}

function autoGrow(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}
