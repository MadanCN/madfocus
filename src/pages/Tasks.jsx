import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, List, Columns3, Repeat, Link2, CalendarClock, Trash2, ArrowRight, Sun, ChevronDown, CalendarDays, Flag, Hash, ListChecks } from 'lucide-react'
import { useShell } from '../components/Shell'
import { Check2, Menu, Seg, Empty, PageLoader, useToast, useConfirm } from '../components/ui'
import { useBus } from '../lib/bus'
import { loadTasks, completeTask, createTask, deleteTask, updateTask, sortTasks, STATUSES } from '../lib/tasks'
import { parseTask } from '../lib/parse'
import { today, addDays, dueLabel, relDay, plural, PRIORITIES } from '../lib/utils'

export default function Tasks() {
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'board' ? 'board' : 'list'
  const [tasks, setTasks] = useState(null)
  const [project, setProject] = useState('')
  const { openTask } = useShell()
  const toast = useToast()
  const confirm = useConfirm()

  const reload = () => loadTasks().then(setTasks).catch(() => { setTasks([]); toast('Couldn’t load tasks.', 'error') })
  useEffect(() => { reload() }, [])
  useBus('tasks', reload)
  useBus('task:patch', ({ id, patch }) => setTasks(p => p && p.map(t => t.id === id ? { ...t, ...patch } : t)))
  useBus('task:removed', ({ id }) => setTasks(p => p && p.filter(t => t.id !== id)))

  const projects = useMemo(() => [...new Set((tasks || []).filter(t => !t.done).map(t => t.project).filter(Boolean))].sort(), [tasks])
  const visible = useMemo(() => (tasks || []).filter(t => !project || t.project === project), [tasks, project])

  async function toggle(t) {
    setTasks(p => p.map(x => x.id === t.id ? { ...x, done: !x.done } : x))
    try {
      const res = await completeTask(t)
      setTasks(p => p.map(x => x.id === t.id ? res.updated : x))
      toast(res.rolledTo ? `Done. Next one ${relDay(res.rolledTo).toLowerCase()}` : t.done ? 'Marked not done' : 'Task completed',
        { action: { label: 'Undo', onClick: async () => { await res.undo(); reload() } } })
    } catch { setTasks(p => p.map(x => x.id === t.id ? t : x)); toast('Couldn’t update that task.', 'error') }
  }

  async function patch(t, p, msg) {
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, ...p } : x))
    try { await updateTask(t.id, p); if (msg) toast(msg) }
    catch { setTasks(prev => prev.map(x => x.id === t.id ? t : x)); toast('Couldn’t update that task.', 'error') }
  }

  async function remove(t) {
    const ok = await confirm({ title: 'Delete this task?', body: `“${t.title}” will be removed for good. This can’t be undone.`, confirmLabel: 'Delete task' })
    if (!ok) return
    setTasks(p => p.filter(x => x.id !== t.id))
    try { await deleteTask(t.id); toast('Task deleted') }
    catch { reload(); toast('Couldn’t delete the task.', 'error') }
  }

  const actions = { toggle, patch, remove, open: openTask }

  if (tasks === null) return <PageLoader />
  const openCount = tasks.filter(t => !t.done).length

  return (
    <div className={`mx-auto px-4 md:px-8 pt-8 md:pt-12 ${view === 'board' ? 'max-w-[1400px]' : 'max-w-[920px]'}`}>
      <header className="flex flex-wrap items-end gap-4 mb-6">
        <div className="mr-auto">
          <h1 className="h-page">Tasks</h1>
          <p className="text-[14px] text-muted mt-1">{openCount ? `${plural(openCount, 'open task')}` : 'All clear'}</p>
        </div>
        <Seg label="View" value={view} onChange={v => setParams(v === 'board' ? { view: 'board' } : {})}
          options={[{ value: 'list', label: 'List', icon: <List size={15} /> }, { value: 'board', label: 'Board', icon: <Columns3 size={15} /> }]} />
      </header>

      <QuickAdd project={project} onAdded={t => setTasks(p => [t, ...p])} />

      {projects.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-6 -mx-1 px-1" role="group" aria-label="Filter by project">
          <button className="pick" aria-pressed={!project} onClick={() => setProject('')}>All</button>
          {projects.map(p => <button key={p} className="pick" aria-pressed={project === p} onClick={() => setProject(project === p ? '' : p)}>{p}</button>)}
        </div>
      )}

      {view === 'list'
        ? <ListView tasks={visible} {...actions} />
        : <BoardView tasks={visible} setTasks={setTasks} {...actions} />}
    </div>
  )
}

// ── Quick add with live parsing ────────────────────────────────
function QuickAdd({ project, onAdded }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const p = parseTask(text)

  async function submit(e) {
    e.preventDefault()
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      const t = await createTask({ title: p.title || text.trim(), due: p.due, priority: p.priority || 'P3', project: p.project || project || '' })
      onAdded(t); setText('')
    } catch { toast('Couldn’t add the task.', 'error') }
    finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="panel flex items-center gap-3 pl-4 pr-2 min-h-[52px] mb-4 focus-within:shadow-[inset_0_0_0_1.5px_var(--c-accent)]">
      <Plus size={18} className="text-faint flex-shrink-0" />
      <input value={text} onChange={e => setText(e.target.value)} aria-label="Add a task"
        placeholder={project ? `Add to ${project}…` : 'Add a task, e.g. “Draft chapter 12 fri p2 #novel”'}
        className="flex-1 min-w-0 bg-transparent outline-none text-[15px] placeholder:text-faint" />
      <div className="hidden sm:flex items-center gap-1.5">
        {p.due && <span className="chip" style={{ background: 'var(--c-accent-soft)', color: 'var(--c-accent)' }}><CalendarDays size={12} />{relDay(p.due)}</span>}
        {p.priority && <span className="chip" style={{ color: PRIORITIES[p.priority].color }}><Flag size={12} />{PRIORITIES[p.priority].label}</span>}
        {p.project && <span className="chip"><Hash size={12} />{p.project}</span>}
      </div>
      <button type="submit" disabled={!text.trim() || busy} className="btn btn-primary btn-sm">Add</button>
    </form>
  )
}

// ── List view ──────────────────────────────────────────────────
function ListView({ tasks, toggle, patch, remove, open }) {
  const [showDone, setShowDone] = useState(false)
  const d = today()
  const openT = tasks.filter(t => !t.done).sort(sortTasks)
  const done = tasks.filter(t => t.done).sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))

  const groups = [
    { key: 'overdue', label: 'Overdue', tone: 'danger', items: openT.filter(t => t.due && t.due < d) },
    { key: 'today', label: 'Today', items: openT.filter(t => t.due === d) },
    { key: 'tomorrow', label: 'Tomorrow', items: openT.filter(t => t.due === addDays(d, 1)) },
    { key: 'week', label: 'Next 7 days', items: openT.filter(t => t.due > addDays(d, 1) && t.due <= addDays(d, 7)) },
    { key: 'later', label: 'Later', items: openT.filter(t => t.due > addDays(d, 7)) },
    { key: 'someday', label: 'No date', items: openT.filter(t => !t.due) },
  ].filter(g => g.items.length)

  if (openT.length === 0 && done.length === 0) {
    return <Empty icon={ListChecks} title="No tasks yet" body="Type one above. Add “tomorrow” or “p1” and it’s dated and prioritised for you." />
  }

  return (
    <div className="flex flex-col gap-8">
      {openT.length === 0 && <p className="text-[15px] text-muted px-1">Every open task is done. Nice work.</p>}
      {groups.map(g => (
        <section key={g.key} aria-labelledby={`g-${g.key}`}>
          <h2 id={`g-${g.key}`} className="flex items-baseline gap-2 px-1 mb-2">
            <span className="h-section" style={{ color: g.tone === 'danger' ? 'var(--c-danger)' : undefined }}>{g.label}</span>
            <span className="text-[13px] text-faint tnum">{g.items.length}</span>
          </h2>
          <div className="panel p-1.5">
            {g.items.map(t => <TaskRow key={t.id} t={t} groupKey={g.key} toggle={toggle} patch={patch} remove={remove} open={open} />)}
          </div>
        </section>
      ))}
      {done.length > 0 && (
        <section>
          <button onClick={() => setShowDone(s => !s)} className="flex items-center gap-1.5 px-1 text-[14px] text-muted hover:text-ink" aria-expanded={showDone}>
            <ChevronDown size={16} style={{ transform: showDone ? 'rotate(180deg)' : 'none', transition: 'transform 200ms var(--ease-out)' }} />
            Completed <span className="text-faint tnum">{done.length}</span>
          </button>
          {showDone && (
            <div className="p-1.5 mt-2">
              {done.slice(0, 50).map(t => <TaskRow key={t.id} t={t} toggle={toggle} patch={patch} remove={remove} open={open} />)}
              {done.length > 50 && <p className="text-[12.5px] text-faint px-3 pt-2">Showing the 50 most recent.</p>}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function TaskRow({ t, groupKey, toggle, patch, remove, open }) {
  const d = today()
  const showDue = t.due && !['today', 'tomorrow'].includes(groupKey) && !t.done
  return (
    <div className="row row-hover group cursor-pointer" onClick={() => open(t.id)}>
      <Check2 checked={t.done} onChange={() => toggle(t)} label={t.done ? 'Mark not done' : 'Mark done'} />
      <div className="flex-1 min-w-0">
        <p className={`text-[14.5px] truncate ${t.done ? 'line-through text-muted' : ''}`}>{t.title}</p>
        {(t.notes || t.project || showDue || t.isRecurring || t.depIds.length > 0) && (
          <div className="flex items-center gap-3 mt-0.5 text-[12.5px] text-faint min-w-0">
            {showDue && <span className="inline-flex items-center gap-1" style={{ color: t.due < d ? 'var(--c-danger)' : undefined }}><CalendarClock size={12} />{dueLabel(t.due)}</span>}
            {t.project && <span className="truncate">{t.project}</span>}
            {t.isRecurring && <span className="inline-flex items-center gap-1"><Repeat size={12} />Repeats</span>}
            {t.depIds.length > 0 && <span className="inline-flex items-center gap-1"><Link2 size={12} />Waiting on {t.depIds.length}</span>}
            {t.notes && !t.project && !showDue && <span className="truncate">{t.notes}</span>}
          </div>
        )}
      </div>
      {t.priority !== 'P3' && !t.done && (
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PRIORITIES[t.priority].color }} aria-label={PRIORITIES[t.priority].label} title={PRIORITIES[t.priority].label} />
      )}
      <div className="opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
        <Menu items={[
          !t.done && t.due !== d && { label: 'Do today', icon: <Sun size={15} />, onClick: () => patch(t, { due: d }, 'Moved to today') },
          !t.done && { label: 'Do tomorrow', icon: <ArrowRight size={15} />, onClick: () => patch(t, { due: addDays(d, 1) }, 'Moved to tomorrow') },
          !t.done && t.due && { label: 'Remove date', icon: <CalendarDays size={15} />, onClick: () => patch(t, { due: null }) },
          { divider: true },
          { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: () => remove(t) },
        ]} />
      </div>
    </div>
  )
}

// ── Board view ─────────────────────────────────────────────────
function BoardView({ tasks, setTasks, patch, remove, open }) {
  const [drag, setDrag] = useState(null)
  const [over, setOver] = useState(null)
  const [adding, setAdding] = useState(null)
  const [text, setText] = useState('')
  const toast = useToast()
  const cutoff = addDays(today(), -14)

  function move(t, status) {
    if (t.status === status) return
    patch(t, { status, done: status === 'done', completedAt: status === 'done' ? today() : null })
  }

  async function add(status) {
    if (!text.trim()) { setAdding(null); return }
    const p = parseTask(text)
    try {
      const t = await createTask({ title: p.title || text.trim(), due: p.due, priority: p.priority || 'P3', project: p.project || '', status })
      setTasks(prev => [t, ...prev]); setText('')
    } catch { toast('Couldn’t add the task.', 'error') }
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory md:snap-none">
      {STATUSES.map(col => {
        const items = tasks
          .filter(t => t.status === col.id && (col.id !== 'done' || (t.completedAt || '') >= cutoff))
          .sort(sortTasks)
        return (
          <section key={col.id} aria-label={col.label}
            className="snap-start flex-shrink-0 w-[82vw] sm:w-[300px] md:flex-1 md:min-w-[250px] rounded-[16px] p-2 transition-colors duration-150"
            style={{ background: over === col.id ? 'var(--c-accent-soft)' : 'color-mix(in srgb, var(--c-line) 35%, transparent)' }}
            onDragOver={e => { e.preventDefault(); setOver(col.id) }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null) }}
            onDrop={e => { e.preventDefault(); const t = tasks.find(x => x.id === drag); if (t) move(t, col.id); setDrag(null); setOver(null) }}>
            <h2 className="flex items-baseline gap-2 px-2 pt-1.5 pb-2.5">
              <span className="text-[14px] font-semibold">{col.label}</span>
              <span className="text-[12.5px] text-faint tnum">{items.length}</span>
              {col.id === 'done' && <span className="text-[12px] text-faint ml-auto">last 14 days</span>}
            </h2>
            <div className="flex flex-col gap-2 min-h-[60px]">
              {items.map(t => (
                <article key={t.id} draggable
                  onDragStart={e => { setDrag(t.id); e.dataTransfer.effectAllowed = 'move' }}
                  onDragEnd={() => { setDrag(null); setOver(null) }}
                  onClick={() => open(t.id)}
                  className="group bg-surface rounded-[12px] p-3 cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,.06),inset_0_0_0_1px_var(--c-line-soft)] transition-opacity"
                  style={{ opacity: drag === t.id ? 0.4 : 1 }}>
                  <div className="flex items-start gap-2">
                    {t.priority !== 'P3' && <span className="w-2 h-2 rounded-full mt-[7px] flex-shrink-0" style={{ background: PRIORITIES[t.priority].color }} />}
                    <p className={`flex-1 text-[14px] leading-snug ${t.done ? 'line-through text-muted' : ''}`}>{t.title}</p>
                    <div className="-mr-1 -mt-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                      <Menu items={[
                        { heading: 'Move to' },
                        ...STATUSES.filter(s => s.id !== t.status).map(s => ({ label: s.label, onClick: () => move(t, s.id) })),
                        { divider: true },
                        { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: () => remove(t) },
                      ]} />
                    </div>
                  </div>
                  {(t.project || t.due) && (
                    <div className="flex items-center gap-2 mt-2 text-[12px] text-faint">
                      {t.project && <span className="truncate">{t.project}</span>}
                      {t.due && <span className="ml-auto" style={{ color: !t.done && t.due < today() ? 'var(--c-danger)' : undefined }}>{relDay(t.due)}</span>}
                    </div>
                  )}
                </article>
              ))}
              {adding === col.id ? (
                <form onSubmit={e => { e.preventDefault(); add(col.id) }} className="bg-surface rounded-[12px] p-2 shadow-[inset_0_0_0_1.5px_var(--c-accent)]">
                  <input autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="Task name"
                    onKeyDown={e => { if (e.key === 'Escape') { setAdding(null); setText('') } }}
                    onBlur={() => { if (!text.trim()) setAdding(null) }}
                    className="w-full bg-transparent outline-none text-[14px] px-1 py-1" aria-label={`Add to ${col.label}`} />
                </form>
              ) : (
                <button onClick={() => { setAdding(col.id); setText('') }} className="flex items-center gap-1.5 h-9 px-2 rounded-[10px] text-[13px] text-muted hover:text-ink hover:bg-surface">
                  <Plus size={15} /> Add
                </button>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
