import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Timer, Check, ArrowRight, Plus, ChevronDown, Moon, BookOpen, CalendarClock, Clock } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useFocus } from '../contexts/FocusContext'
import { useShell } from '../components/Shell'
import { Check2, useToast, PageLoader, SaveState } from '../components/ui'
import { sb } from '../lib/supabase'
import { useBus } from '../lib/bus'
import { useAutosave } from '../lib/useAutosave'
import { loadTasks, completeTask, createTask, pickNextUp, sortTasks } from '../lib/tasks'
import { loadHabitData, setLog, saveWriting } from '../lib/habits'
import { parseTask } from '../lib/parse'
import {
  today, addDays, greeting, firstName, dueLabel, relDay, fmtMinutes, fmtNum, plural, streakFrom, PRIORITIES,
} from '../lib/utils'

export default function Today() {
  const { user } = useAuth()
  const focus = useFocus()
  const toast = useToast()
  const { openTask, openCapture } = useShell()
  const [tasks, setTasks] = useState(null)
  const [hab, setHab] = useState({ habits: [], logs: {}, writing: [] })
  const [extra, setExtra] = useState({ books: [], goals: [], journalToday: null, journalYesterday: null, readToday: 0 })
  const [skipped, setSkipped] = useState([])

  const reloadTasks = () => loadTasks().then(setTasks).catch(() => setTasks([]))
  const reloadHabits = () => loadHabitData().then(setHab).catch(() => {})

  useEffect(() => {
    reloadTasks(); reloadHabits()
    const d = today()
    Promise.all([
      sb.from('books').select('id,title,cover_url,status,pages_read,total_pages').eq('status', 'reading'),
      sb.from('goals').select('*').eq('status', 'active').order('due', { ascending: true }),
      sb.from('journal_entries').select('*').in('date', [d, addDays(d, -1)]),
      sb.from('reading_sessions').select('duration_min').eq('date', d),
    ]).then(([b, g, j, rs]) => setExtra({
      books: b.data || [], goals: g.data || [],
      journalToday: (j.data || []).find(x => x.date === d) || null,
      journalYesterday: (j.data || []).find(x => x.date === addDays(d, -1)) || null,
      readToday: (rs.data || []).reduce((a, s) => a + (s.duration_min || 0), 0),
    }))
  }, [])

  useBus('tasks', reloadTasks)
  useBus('task:patch', ({ id, patch }) => setTasks(p => p && p.map(t => t.id === id ? { ...t, ...patch } : t)))
  useBus('task:removed', ({ id }) => setTasks(p => p && p.filter(t => t.id !== id)))
  useBus('habits', reloadHabits)
  useBus('writing', reloadHabits)

  const d = today()
  const open = useMemo(() => (tasks || []).filter(t => !t.done), [tasks])
  const todayList = useMemo(() => open.filter(t => (t.due && t.due <= d) || t.status === 'in_progress').sort(sortTasks), [open])
  const doneToday = useMemo(() => (tasks || []).filter(t => t.done && t.completedAt === d), [tasks])
  const upcoming = useMemo(() => open.filter(t => t.due && t.due > d && t.due <= addDays(d, 7)), [open])
  const nextUp = useMemo(() => pickNextUp(open.filter(t => !skipped.includes(t.id))), [open, skipped])

  const activeHabits = hab.habits.filter(h => !h.archived && h.trackType !== 'writing')
  const writingHabit = hab.habits.find(h => !h.archived && h.trackType === 'writing')
  const habitsDone = activeHabits.filter(h => (hab.logs[h.id] || []).some(l => l.date === d)).length

  async function toggleTask(t) {
    setTasks(p => p.map(x => x.id === t.id ? { ...x, done: !x.done, completedAt: !x.done ? d : null } : x))
    try {
      const res = await completeTask(t)
      setTasks(p => p.map(x => x.id === t.id ? res.updated : x))
      const msg = res.rolledTo ? `Done. Next one ${relDay(res.rolledTo).toLowerCase()}` : t.done ? 'Marked not done' : `Done: ${t.title}`
      toast(msg, { action: { label: 'Undo', onClick: async () => { await res.undo(); reloadTasks() } } })
    } catch {
      setTasks(p => p.map(x => x.id === t.id ? t : x))
      toast('Couldn’t update that task.', 'error')
    }
  }

  if (tasks === null) return <PageLoader />

  const name = firstName(user)
  const summary = [
    todayList.length ? plural(todayList.length, 'thing') + ' on today’s list' : 'Today’s list is clear',
    activeHabits.length ? `${habitsDone} of ${activeHabits.length} habits done` : null,
    focus.focusMinutesToday ? `${fmtMinutes(focus.focusMinutesToday)} focused` : null,
  ].filter(Boolean)

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-8 pt-8 md:pt-12">
      <header className="mb-8 md:mb-10 rise-in">
        <h1 className="h-page">{greeting()}{name ? `, ${name}` : ''}</h1>
        <p className="text-[15px] text-muted mt-2">{summary.join(', ')}.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-8 lg:gap-12 items-start">
        <div className="flex flex-col gap-10 min-w-0">
          <NextUp
            task={nextUp}
            yesterdayPriority={extra.journalYesterday?.tomorrow_priority}
            openTitles={open.map(t => t.title.toLowerCase())}
            onDone={() => toggleTask(nextUp)}
            onSkip={() => setSkipped(s => [...s, nextUp.id])}
            onOpen={() => openTask(nextUp.id)}
            onFocus={() => { focus.start({ mode: 'focus', taskId: nextUp.id, taskTitle: nextUp.title }); focus.openOverlay() }}
            onCapture={() => openCapture('task')}
            onMakeTask={async title => {
              try { const t = await createTask({ title, due: d, priority: 'P2' }); reloadTasks(); toast(`Added “${t.title}” for today`) }
              catch { toast('Couldn’t add the task.', 'error') }
            }}
            skippedCount={skipped.length}
            onResetSkip={() => setSkipped([])}
          />

          <TodayList
            list={todayList} doneToday={doneToday} upcoming={upcoming}
            onToggle={toggleTask} onOpen={openTask}
            onAdd={async text => {
              const p = parseTask(text)
              const t = await createTask({ title: p.title || text, due: p.due || d, priority: p.priority || 'P3', project: p.project || '' })
              setTasks(prev => [t, ...prev])
            }}
          />
        </div>

        <aside className="panel flex flex-col divide-y divide-line-soft overflow-hidden">
          <HabitsToday habits={activeHabits} logs={hab.logs} setHab={setHab} />
          {(writingHabit || hab.writing.length > 0) && <WritingToday writing={hab.writing} setHab={setHab} />}
          {extra.books.length > 0 && <ReadingNow books={extra.books} minutesToday={extra.readToday} />}
          {extra.goals.length > 0 && <GoalsPulse goals={extra.goals} />}
          <CloseDay entry={extra.journalToday} />
        </aside>
      </div>
    </div>
  )
}

// ── Next up ────────────────────────────────────────────────────
function NextUp({ task, yesterdayPriority, openTitles, onDone, onSkip, onOpen, onFocus, onCapture, onMakeTask, skippedCount, onResetSkip }) {
  const promised = yesterdayPriority?.trim()
  const promisedIsTask = promised && openTitles.some(t => t.includes(promised.toLowerCase().slice(0, 24)))

  if (!task) {
    return (
      <section aria-label="Next up" className="py-2">
        <p className="text-[13.5px] text-muted mb-2">Next up</p>
        <p className="font-serif text-[30px] md:text-[40px] leading-[1.15] tracking-[-0.015em] text-muted">
          {skippedCount ? 'That’s everything for now.' : 'Nothing is waiting on you.'}
        </p>
        <div className="flex gap-2 mt-5">
          {skippedCount > 0 && <button onClick={onResetSkip} className="btn btn-outline">Show skipped</button>}
          <button onClick={onCapture} className="btn btn-primary"><Plus size={16} /> Capture a task</button>
        </div>
      </section>
    )
  }

  const meta = [
    task.due ? { text: dueLabel(task.due), tone: task.due < today() ? 'danger' : 'muted', icon: CalendarClock } : null,
    task.priority !== 'P3' ? { text: PRIORITIES[task.priority].label, tone: task.priority === 'P1' ? 'danger' : 'muted', dot: PRIORITIES[task.priority].color } : null,
    task.project ? { text: task.project, tone: 'muted' } : null,
    task.status === 'in_progress' ? { text: 'In progress', tone: 'muted' } : null,
  ].filter(Boolean)

  return (
    <section aria-label="Next up" className="rise-in" style={{ animationDelay: '60ms' }}>
      <p className="text-[13.5px] text-muted mb-2">Next up</p>
      <button onClick={onOpen} className="text-left block w-full rounded-[8px]">
        <h2 className="font-serif text-[30px] md:text-[44px] leading-[1.12] tracking-[-0.02em] font-medium" style={{ textWrap: 'balance' }}>
          {task.title}
        </h2>
      </button>
      {meta.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[14px]">
          {meta.map((m, i) => (
            <span key={i} className="inline-flex items-center gap-1.5" style={{ color: m.tone === 'danger' ? 'var(--c-danger)' : 'var(--c-muted)' }}>
              {m.icon && <m.icon size={15} />}{m.dot && <span className="w-2 h-2 rounded-full" style={{ background: m.dot }} />}{m.text}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2 mt-6">
        <button onClick={onFocus} className="btn btn-primary btn-lg"><Timer size={18} /> Start focus</button>
        <button onClick={onDone} className="btn btn-outline btn-lg"><Check size={18} /> Done</button>
        <button onClick={onSkip} className="btn btn-quiet btn-lg">Not now</button>
      </div>
      {promised && !promisedIsTask && (
        <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px] text-muted">
          <span>Last night you wrote that today’s priority was <span className="text-ink font-medium">“{promised}”</span>.</span>
          <button onClick={() => onMakeTask(promised)} className="btn btn-outline btn-sm"><Plus size={14} /> Add it to today</button>
        </div>
      )}
    </section>
  )
}

// ── Today's list ───────────────────────────────────────────────
function TodayList({ list, doneToday, upcoming, onToggle, onOpen, onAdd }) {
  const [text, setText] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function add(e) {
    e.preventDefault()
    if (!text.trim() || busy) return
    setBusy(true)
    try { await onAdd(text.trim()); setText('') }
    catch { toast('Couldn’t add the task.', 'error') }
    finally { setBusy(false) }
  }

  return (
    <section aria-labelledby="today-list">
      <div className="flex items-baseline gap-3 mb-3">
        <h2 id="today-list" className="h-section">Today’s list</h2>
        <span className="text-[13px] text-faint tnum">{list.length}</span>
        <Link to="/tasks" className="ml-auto text-[13px] text-muted hover:text-ink inline-flex items-center gap-1">All tasks <ArrowRight size={14} /></Link>
      </div>
      <div className="panel p-1.5">
        {list.map(t => <TaskLine key={t.id} t={t} onToggle={onToggle} onOpen={onOpen} />)}
        {list.length === 0 && <p className="px-3 py-4 text-[14px] text-muted">Nothing due today. Add something below, or pull from your upcoming tasks.</p>}
        <form onSubmit={add} className="row">
          <span className="w-5 h-5 flex items-center justify-center text-faint"><Plus size={17} /></span>
          <input value={text} onChange={e => setText(e.target.value)} placeholder="Add to today…"
            aria-label="Add a task for today" className="flex-1 bg-transparent outline-none text-[14.5px] placeholder:text-faint" />
          {text && <span className="text-[12px] text-faint hidden sm:inline">Enter to add</span>}
        </form>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3 px-1 text-[13px]">
        {doneToday.length > 0 && (
          <button onClick={() => setShowDone(s => !s)} className="inline-flex items-center gap-1 text-muted hover:text-ink" aria-expanded={showDone}>
            <ChevronDown size={15} style={{ transform: showDone ? 'rotate(180deg)' : 'none', transition: 'transform 200ms var(--ease-out)' }} />
            {plural(doneToday.length, 'task')} done today
          </button>
        )}
        {upcoming.length > 0 && (
          <Link to="/tasks" className="text-muted hover:text-ink">{plural(upcoming.length, 'task')} coming up this week</Link>
        )}
      </div>
      {showDone && (
        <div className="mt-2 p-1.5">
          {doneToday.map(t => <TaskLine key={t.id} t={t} onToggle={onToggle} onOpen={onOpen} />)}
        </div>
      )}
    </section>
  )
}

function TaskLine({ t, onToggle, onOpen }) {
  const overdue = !t.done && t.due && t.due < today()
  return (
    <div className="row row-hover group cursor-pointer" onClick={() => onOpen(t.id)}>
      <Check2 checked={t.done} onChange={() => onToggle(t)} label={t.done ? 'Mark not done' : 'Mark done'} />
      <div className="flex-1 min-w-0">
        <p className={`text-[14.5px] truncate ${t.done ? 'line-through text-muted' : ''}`}>{t.title}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 text-[12.5px]">
        {t.project && <span className="text-faint hidden sm:inline">{t.project}</span>}
        {overdue && <span className="text-danger">{dueLabel(t.due)}</span>}
        {t.priority === 'P1' && !t.done && <span className="w-2 h-2 rounded-full bg-danger" aria-label="Urgent" />}
      </div>
    </div>
  )
}

// ── Habits ─────────────────────────────────────────────────────
function HabitsToday({ habits, logs, setHab }) {
  const d = today()
  const toast = useToast()
  const [openVariant, setOpenVariant] = useState(null)
  const [timeFor, setTimeFor] = useState(null)

  async function apply(h, entry) {
    const prev = (logs[h.id] || []).find(l => l.date === d) || null
    setHab(s => ({ ...s, logs: { ...s.logs, [h.id]: [...(s.logs[h.id] || []).filter(l => l.date !== d), ...(entry ? [{ date: d, ...entry }] : [])] } }))
    try {
      await setLog(h.id, d, entry)
      if (!entry && prev) {
        toast(`${h.name} unmarked`, { action: { label: 'Undo', onClick: () => apply(h, prev) } })
      }
    } catch {
      setHab(s => ({ ...s, logs: { ...s.logs, [h.id]: [...(s.logs[h.id] || []).filter(l => l.date !== d), ...(prev ? [prev] : [])] } }))
      toast('Couldn’t save that habit.', 'error')
    }
  }

  return (
    <section className="p-5" aria-labelledby="habits-h">
      <div className="flex items-baseline gap-3 mb-3">
        <h2 id="habits-h" className="h-section">Habits</h2>
        <Link to="/habits" className="ml-auto text-[13px] text-muted hover:text-ink">Manage</Link>
      </div>
      {habits.length === 0 ? (
        <p className="text-[13.5px] text-muted">No habits yet. <Link to="/habits" className="text-accent font-medium">Add your first one</Link>.</p>
      ) : (
        <ul className="flex flex-col -mx-2">
          {habits.map(h => {
            const entry = (logs[h.id] || []).find(l => l.date === d)
            const done = !!entry
            const streak = streakFrom((logs[h.id] || []).map(l => l.date))
            const isVar = h.trackType === 'variants' && h.variants.length > 0
            return (
              <li key={h.id}>
                <div className="row row-hover cursor-pointer min-h-[42px] py-1.5"
                  onClick={() => isVar ? setOpenVariant(o => o === h.id ? null : h.id) : apply(h, done ? null : { variant: null, duration_min: null })}>
                  <Check2 checked={done} label={done ? `Unmark ${h.name}` : `Mark ${h.name} done`}
                    onChange={() => isVar && !done ? setOpenVariant(h.id) : apply(h, done ? null : { variant: null, duration_min: null })} />
                  <span className={`flex-1 text-[14px] truncate ${done ? 'text-muted' : ''}`}>
                    {h.name}{entry?.variant && <span className="text-good"> · {entry.variant}</span>}
                  </span>
                  {done && (
                    <button onClick={e => { e.stopPropagation(); setTimeFor(t => t === h.id ? null : h.id) }}
                      className="text-[12px] text-faint hover:text-ink inline-flex items-center gap-1 tnum" aria-label={`Log time for ${h.name}`}>
                      <Clock size={13} />{entry.duration_min ? fmtMinutes(entry.duration_min) : 'Time'}
                    </button>
                  )}
                  {streak > 1 && <span className="text-[12px] text-faint tnum w-8 text-right" aria-label={`${streak} day streak`}>{streak}d</span>}
                </div>
                {openVariant === h.id && isVar && (
                  <div className="flex flex-wrap gap-1.5 px-2 pb-2 pl-[42px]">
                    {h.variants.map(v => (
                      <button key={v} className="pick h-[30px] text-[12.5px]" aria-pressed={entry?.variant === v}
                        onClick={() => { apply(h, entry?.variant === v ? null : { variant: v, duration_min: entry?.duration_min || null }); setOpenVariant(null) }}>{v}</button>
                    ))}
                  </div>
                )}
                {timeFor === h.id && done && (
                  <MinutesInput initial={entry.duration_min} onSave={m => { apply(h, { ...entry, duration_min: m }); setTimeFor(null) }} onCancel={() => setTimeFor(null)} />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function MinutesInput({ initial, onSave, onCancel }) {
  const [v, setV] = useState(initial ? String(initial) : '')
  const commit = () => { const m = parseInt(v, 10); if (m > 0 && m !== initial) onSave(m); else onCancel() }
  return (
    <div className="flex items-center gap-2 pl-[42px] pr-2 pb-2">
      <input autoFocus type="number" min="1" inputMode="numeric" value={v} onChange={e => setV(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onCancel() }} onBlur={commit}
        className="input h-8 w-20 text-center" aria-label="Minutes spent" />
      <span className="text-[12.5px] text-muted">minutes</span>
      {[15, 30, 60].map(m => (
        <button key={m} onMouseDown={e => e.preventDefault()} onClick={() => onSave(m)} className="pick h-7 text-[12px] px-2.5">{m}</button>
      ))}
    </div>
  )
}

// ── Writing ────────────────────────────────────────────────────
function WritingToday({ writing, setHab }) {
  const d = today()
  const existing = writing.find(w => w.date === d) || null
  const [ch, setCh] = useState(existing?.chapters ? String(existing.chapters) : '')
  const [wc, setWc] = useState(existing?.word_count ? String(existing.word_count) : '')
  const rowRef = useRef(existing)
  rowRef.current = rowRef.current || existing

  const { queue, status, retry } = useAutosave(async (_k, p) => {
    const saved = await saveWriting(rowRef.current, d, p.chapters, p.words)
    rowRef.current = saved
  }, 800)

  function change(nextCh, nextWc) {
    setCh(nextCh); setWc(nextWc)
    queue(d, { chapters: parseInt(nextCh, 10) || 0, words: parseInt(nextWc, 10) || 0 })
  }

  const streak = streakFrom(writing.map(w => w.date))
  const total = writing.reduce((a, w) => a + (w.word_count || 0), 0)
  const days = Array.from({ length: 14 }, (_, i) => {
    const day = addDays(d, i - 13)
    const w = day === d ? (parseInt(wc, 10) || 0) : (writing.find(x => x.date === day)?.word_count || 0)
    return { day, w }
  })
  const max = Math.max(1, ...days.map(x => x.w))

  return (
    <section className="p-5" aria-labelledby="writing-h">
      <div className="flex items-baseline gap-3 mb-3">
        <h2 id="writing-h" className="h-section">Writing</h2>
        <span className="text-[12.5px] text-faint">{streak > 0 ? `${streak}-day streak` : 'No streak yet'} · {fmtNum(total)} words total</span>
        <SaveState status={status} onRetry={retry} className="ml-auto" />
      </div>
      <div className="flex gap-3">
        <label className="flex-1">
          <span className="block text-[12.5px] text-muted mb-1">Words today</span>
          <input type="number" min="0" inputMode="numeric" value={wc} placeholder="0"
            onChange={e => change(ch, e.target.value)} className="input tnum text-[16px] font-semibold" />
        </label>
        <label className="w-[110px]">
          <span className="block text-[12.5px] text-muted mb-1">Chapters</span>
          <input type="number" min="0" inputMode="numeric" value={ch} placeholder="0"
            onChange={e => change(e.target.value, wc)} className="input tnum text-[16px] font-semibold" />
        </label>
      </div>
      <div className="flex items-end gap-[3px] h-10 mt-4" role="img" aria-label="Words written over the last 14 days">
        {days.map(x => (
          <div key={x.day} title={`${relDay(x.day)}: ${fmtNum(x.w)} words`} className="flex-1 rounded-[2px]"
            style={{ height: `${Math.max(x.w ? 10 : 4, (x.w / max) * 100)}%`, background: x.day === d ? 'var(--m-journal)' : x.w ? 'var(--c-faint)' : 'var(--c-line)' }} />
        ))}
      </div>
    </section>
  )
}

// ── Reading ────────────────────────────────────────────────────
function ReadingNow({ books, minutesToday }) {
  const navigate = useNavigate()
  return (
    <section className="p-5" aria-labelledby="reading-h">
      <div className="flex items-baseline gap-3 mb-3">
        <h2 id="reading-h" className="h-section">Reading</h2>
        {minutesToday > 0 && <span className="text-[12.5px] text-faint">{fmtMinutes(minutesToday)} today</span>}
        <Link to="/library" className="ml-auto text-[13px] text-muted hover:text-ink">Library</Link>
      </div>
      <ul className="flex flex-col gap-3">
        {books.slice(0, 2).map(b => {
          const pct = b.total_pages > 0 ? Math.round(((b.pages_read || 0) / b.total_pages) * 100) : 0
          return (
            <li key={b.id} className="flex items-center gap-3">
              <Link to={`/library/book/${b.id}`} className="w-10 aspect-[2/3] rounded-[4px] overflow-hidden bg-sunken flex-shrink-0 shadow-[0_1px_3px_rgba(0,0,0,.15)]">
                {b.cover_url ? <img src={b.cover_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-faint"><BookOpen size={15} /></div>}
              </Link>
              <div className="flex-1 min-w-0">
                <Link to={`/library/book/${b.id}`} className="text-[14px] font-medium truncate block hover:underline underline-offset-2">{b.title}</Link>
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex-1 h-1 rounded-full bg-line overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--m-library)' }} /></div>
                  <span className="text-[12px] text-faint tnum">{pct}%</span>
                </div>
              </div>
              <button onClick={() => navigate(`/library/book/${b.id}?read=1`)} className="btn btn-outline btn-sm">Read</button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ── Goals ──────────────────────────────────────────────────────
function GoalsPulse({ goals }) {
  return (
    <section className="p-5" aria-labelledby="goals-h">
      <div className="flex items-baseline gap-3 mb-3">
        <h2 id="goals-h" className="h-section">Goals</h2>
        <Link to="/goals" className="ml-auto text-[13px] text-muted hover:text-ink">All goals</Link>
      </div>
      <ul className="flex flex-col gap-3">
        {goals.slice(0, 3).map(g => {
          const pct = g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0
          return (
            <li key={g.id}>
              <Link to={`/goals?id=${g.id}`} className="block group">
                <div className="flex items-baseline gap-2">
                  <span className="text-[14px] flex-1 truncate group-hover:underline underline-offset-2">{g.title}</span>
                  <span className="text-[12.5px] text-faint tnum">{pct}%</span>
                </div>
                <div className="h-1 rounded-full bg-line overflow-hidden mt-1.5"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--m-goals)' }} /></div>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ── Close the day ──────────────────────────────────────────────
function CloseDay({ entry }) {
  const evening = new Date().getHours() >= 18
  const started = entry && (entry.went_well || entry.important_events || entry.content || (entry.emotions || []).length)
  return (
    <section className="p-5">
      <Link to="/journal" className="flex items-center gap-3 group">
        <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'color-mix(in srgb, var(--m-journal) 14%, transparent)', color: 'var(--m-journal)' }}>
          <Moon size={17} />
        </span>
        <span className="flex-1">
          <span className="block text-[14px] font-medium">{started ? 'Continue today’s journal' : evening ? 'Close the day' : 'Journal'}</span>
          <span className="block text-[12.5px] text-muted">{started ? 'Pick up where you left off' : 'Five minutes to reflect and set tomorrow’s priority'}</span>
        </span>
        <ArrowRight size={16} className="text-faint group-hover:text-ink transition-colors" />
      </Link>
    </section>
  )
}
