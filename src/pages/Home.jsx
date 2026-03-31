import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { sb } from '../lib/supabase'
import { Ring } from '../components/ui'

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function today() { return new Date().toISOString().slice(0, 10) }

function calcHabitStreak(logs) {
  const s = new Set(logs.map(e => e.date))
  let streak = 0
  const d = new Date(today())
  while (s.has(d.toISOString().slice(0, 10))) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

function calcWritingStreak(logs) {
  const s = new Set(logs.map(l => l.date))
  let streak = 0
  const d = new Date(today())
  if (!s.has(today())) d.setDate(d.getDate() - 1)
  while (s.has(d.toISOString().slice(0, 10))) { streak++; d.setDate(d.getDate() - 1) }
  return streak
}

function getWritingMessage(streak, totalWords) {
  if (streak === 0 && totalWords === 0) return 'Start your writing journey today. Every chapter begins with a single word.'
  if (streak === 0) return "You've written before — pick it back up. Your readers are waiting."
  if (streak === 1) return 'Day 1 done! Show up tomorrow and the habit forms.'
  if (streak < 7) return `${streak} days in a row. You're building something real.`
  if (streak < 14) return `A full week of writing! Keep the momentum — don't break the chain.`
  if (streak < 30) return `${streak} days strong. You're in the zone now. Ship those chapters!`
  if (streak < 60) return `A month of consistent writing! Readers can feel your dedication.`
  return `${streak} days straight. Unstoppable. This is what serious writers are made of.`
}

// ── Word Count Bar Chart ──────────────────────────────────────
function WordChart({ logs, filter }) {
  const data = useMemo(() => {
    if (filter === 'daily') {
      const map = {}
      logs.forEach(l => { map[l.date] = l.word_count })
      return Array.from({ length: 30 }, (_, i) => {
        const d = new Date(); d.setHours(12, 0, 0, 0)
        d.setDate(d.getDate() - (29 - i))
        const ds = d.toISOString().slice(0, 10)
        return {
          label: (i === 0 || i === 14 || i === 29)
            ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
            : '',
          fullLabel: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
          value: map[ds] || 0,
          isToday: ds === today(),
        }
      })
    } else if (filter === 'weekly') {
      const weekMap = {}
      logs.forEach(l => {
        const d = new Date(l.date + 'T12:00:00')
        const mon = new Date(d)
        mon.setDate(d.getDate() - ((d.getDay() + 6) % 7))
        const key = mon.toISOString().slice(0, 10)
        weekMap[key] = (weekMap[key] || 0) + l.word_count
      })
      return Array.from({ length: 12 }, (_, i) => {
        const d = new Date(); d.setHours(12, 0, 0, 0)
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - (11 - i) * 7)
        const key = d.toISOString().slice(0, 10)
        const end = new Date(d); end.setDate(end.getDate() + 6)
        return {
          label: (i === 0 || i === 5 || i === 11)
            ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
            : '',
          fullLabel: `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
          value: weekMap[key] || 0,
          isToday: i === 11,
        }
      })
    } else {
      const monthMap = {}
      logs.forEach(l => {
        const key = l.date.slice(0, 7)
        monthMap[key] = (monthMap[key] || 0) + l.word_count
      })
      return Array.from({ length: 6 }, (_, i) => {
        const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(1)
        d.setMonth(d.getMonth() - (5 - i))
        const key = d.toISOString().slice(0, 7)
        return {
          label: d.toLocaleDateString('en-GB', { month: 'short' }),
          fullLabel: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
          value: monthMap[key] || 0,
          isToday: i === 5,
        }
      })
    }
  }, [logs, filter])

  const max = Math.max(...data.map(d => d.value), 1)

  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height: '100px' }}>
        {data.map((d, i) => (
          <div key={i} className="relative flex flex-col justify-end flex-1 h-full group">
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-text text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 transition-opacity">
              {d.fullLabel}: {d.value.toLocaleString()} words
            </div>
            <div
              className="w-full rounded-t-[2px] transition-all duration-300"
              style={{
                height: `${Math.max(d.value > 0 ? 4 : 1, Math.round((d.value / max) * 100))}%`,
                background: d.isToday ? '#b8860b' : d.value > 0 ? '#2d5a3d' : '#f0ede8',
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-[3px] mt-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-[8px] text-faint text-center truncate leading-tight">
            {d.label}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Book Reading Calendar ─────────────────────────────────────
function BookCalendar({ sessions }) {
  const dayMap = {}
  sessions.forEach(s => {
    if (!s.date || !s.pages_read) return
    dayMap[s.date] = (dayMap[s.date] || 0) + s.pages_read
  })

  const days = []
  const end = new Date(today())
  for (let i = 83; i >= 0; i--) {
    const d = new Date(end)
    d.setDate(d.getDate() - i)
    const ds = d.toISOString().slice(0, 10)
    days.push({ date: ds, pages: dayMap[ds] || 0, dow: d.getDay() })
  }

  const maxPages = Math.max(...days.map(d => d.pages), 1)

  function opacity(pages) {
    if (!pages) return 0
    return Math.max(0.15, Math.min(1, pages / maxPages))
  }

  const weeks = []
  let week = []
  const firstDow = days[0].dow === 0 ? 6 : days[0].dow - 1
  for (let i = 0; i < firstDow; i++) week.push(null)
  days.forEach(d => {
    week.push(d)
    const dow = d.dow === 0 ? 6 : d.dow - 1
    if (dow === 6) { weeks.push(week); week = [] }
  })
  if (week.length) weeks.push(week)

  const monthLabels = []
  weeks.forEach((w, wi) => {
    const firstReal = w.find(Boolean)
    if (firstReal) {
      const d = new Date(firstReal.date + 'T00:00:00')
      if (d.getDate() <= 7) {
        monthLabels[wi] = d.toLocaleDateString('en-GB', { month: 'short' })
      }
    }
  })

  const totalPages = Object.values(dayMap).reduce((a, b) => a + b, 0)
  const activeDays = Object.keys(dayMap).length

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-[14px]">Reading activity</h3>
        <div className="flex gap-3 text-[11px] text-muted">
          <span>{totalPages} pages this period</span>
          <span>{activeDays} days active</span>
        </div>
      </div>

      <div className="flex gap-[3px] mb-1 ml-[18px]">
        {weeks.map((_, wi) => (
          <div key={wi} className="w-[11px] text-[9px] text-faint text-center shrink-0">
            {monthLabels[wi] || ''}
          </div>
        ))}
      </div>

      <div className="flex gap-[3px]">
        <div className="flex flex-col gap-[3px] mr-0.5">
          {['M', '', 'W', '', 'F', '', 'S'].map((d, i) => (
            <div key={i} className="w-[14px] h-[11px] text-[9px] text-faint leading-[11px]">{d}</div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {Array.from({ length: 7 }).map((_, di) => {
              const cell = week[di]
              return (
                <div
                  key={di}
                  title={cell ? `${cell.date}: ${cell.pages} pages` : ''}
                  className="w-[11px] h-[11px] rounded-[2px] transition-all"
                  style={{
                    background: cell?.pages
                      ? `rgba(45,90,61,${opacity(cell.pages)})`
                      : cell === null ? 'transparent' : '#f0ede8',
                  }}
                />
              )
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.5 mt-2 justify-end">
        <span className="text-[9.5px] text-faint">Less</span>
        {[0.1, 0.3, 0.55, 0.8, 1].map(o => (
          <div key={o} className="w-[10px] h-[10px] rounded-[2px]"
            style={{ background: `rgba(45,90,61,${o})` }} />
        ))}
        <span className="text-[9.5px] text-faint">More</span>
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────
export default function Home() {
  const navigate = useNavigate()
  const [data, setData] = useState({
    tasks: [], habits: [], habitLogs: {}, goals: [],
    sessions: [], books: [], pomSessions: [],
  })
  const [writingLogs, setWritingLogs] = useState([])
  const [loading, setLoading] = useState(true)

  // Writing section state
  const [chartFilter, setChartFilter] = useState('daily')
  const [writingForm, setWritingForm] = useState({ chapters: '', wordCount: '' })
  const [savingWriting, setSavingWriting] = useState(false)

  // Interactive habits: variant picker open for which habit
  const [dashHabitPicker, setDashHabitPicker] = useState(null) // hid or null

  useEffect(() => {
    Promise.all([
      sb.from('tasks').select('*'),
      sb.from('habits').select('*'),
      sb.from('habit_logs').select('*'),
      sb.from('goals').select('*').eq('status', 'active'),
      sb.from('reading_sessions').select('*'),
      sb.from('books').select('id,title,cover_url,status,pages_read,total_pages,author'),
      sb.from('pomodoro_sessions').select('*').eq('date', today()),
      sb.from('writing_logs').select('*').order('date', { ascending: false }),
    ]).then(([
      { data: t }, { data: h }, { data: hl }, { data: g },
      { data: rs }, { data: b }, { data: ps }, { data: wl },
    ]) => {
      const logMap = {}
      ;(hl || []).forEach(l => {
        if (!logMap[l.habit_id]) logMap[l.habit_id] = []
        logMap[l.habit_id].push(l)
      })
      setData({
        tasks: t || [], habits: h || [], habitLogs: logMap,
        goals: g || [], sessions: rs || [], books: b || [], pomSessions: ps || [],
      })
      setWritingLogs(wl || [])
      setLoading(false)
    })
  }, [])

  // ── Mark a habit from Dashboard ──────────────────────────────
  async function markHabit(hid, variant) {
    const date = today()
    const entries = data.habitLogs[hid] || []
    const idx = entries.findIndex(e => e.date === date)
    let newEntries

    if (idx >= 0) {
      if (variant && entries[idx].variant === variant) {
        newEntries = entries.filter((_, i) => i !== idx)
        await sb.from('habit_logs').delete().eq('habit_id', hid).eq('date', date)
      } else if (variant) {
        newEntries = entries.map((e, i) => i === idx ? { ...e, variant } : e)
        await sb.from('habit_logs').upsert({ habit_id: hid, date, variant })
      } else {
        newEntries = entries.filter((_, i) => i !== idx)
        await sb.from('habit_logs').delete().eq('habit_id', hid).eq('date', date)
      }
    } else {
      newEntries = [...entries, { date, variant: variant || null }]
      await sb.from('habit_logs').upsert({ habit_id: hid, date, variant: variant || null })
    }

    setData(prev => ({ ...prev, habitLogs: { ...prev.habitLogs, [hid]: newEntries } }))
    setDashHabitPicker(null)
  }

  // ── Save today's writing log ─────────────────────────────────
  async function saveWriting() {
    const ch = parseInt(writingForm.chapters) || 0
    const wc = parseInt(writingForm.wordCount) || 0
    if (!ch && !wc) return
    setSavingWriting(true)
    const date = today()
    const existing = writingLogs.find(l => l.date === date)
    const entry = {
      id: existing?.id || uid(),
      date,
      chapters: ch,
      word_count: wc,
      created_at: existing?.created_at || date,
      updated_at: date,
    }
    await sb.from('writing_logs').upsert(entry)
    setWritingLogs(prev => [entry, ...prev.filter(l => l.date !== date)])
    setWritingForm({ chapters: '', wordCount: '' })
    setSavingWriting(false)
  }

  const { tasks, habits, habitLogs, goals, sessions, books, pomSessions } = data

  // ── Computed values ──────────────────────────────────────────
  const activeTasks    = tasks.filter(t => !t.done).length
  const dueTodayTasks  = tasks.filter(t => !t.done && t.due === today()).length
  const overdueTasks   = tasks.filter(t => !t.done && t.due && t.due < today()).length
  const todayFocusMins = pomSessions.filter(s => s.type === 'focus' && s.completed).reduce((a, s) => a + s.duration, 0)
  const habitsToday    = habits.filter(h => (habitLogs[h.id] || []).some(l => l.date === today()))
  const bestStreak     = habits.reduce((best, h) => {
    const s = calcHabitStreak(habitLogs[h.id] || [])
    return s > best.streak ? { name: h.name, streak: s } : best
  }, { name: '—', streak: 0 })
  const reading        = books.filter(b => b.status === 'reading')
  const avgGoalPct     = goals.length > 0
    ? Math.round(goals.reduce((a, g) => a + (g.target > 0 ? (g.current / g.target) * 100 : 0), 0) / goals.length)
    : 0

  // Writing stats
  const totalWords    = writingLogs.reduce((a, l) => a + (l.word_count || 0), 0)
  const totalChapters = writingLogs.reduce((a, l) => a + (l.chapters || 0), 0)
  const writingStreak = calcWritingStreak(writingLogs)
  const writingDays   = writingLogs.length
  const writingToday  = writingLogs.find(l => l.date === today())

  const CARDS = [
    { label: 'Active tasks',    value: activeTasks,          sub: `${dueTodayTasks} due today${overdueTasks > 0 ? ` · ${overdueTasks} overdue` : ''}`, link: '/tasks',   color: '#2d5a3d' },
    { label: 'Focus time today', value: `${todayFocusMins}m`, sub: `${pomSessions.filter(s => s.type === 'focus' && s.completed).length} sessions`,        link: '/',        color: '#b8860b' },
    { label: 'Habits today',    value: `${habitsToday.length}/${habits.length}`, sub: `Best streak: ${bestStreak.streak}d`,              link: '/habits',  color: '#2563eb' },
    { label: 'Goals progress',  value: `${avgGoalPct}%`,     sub: `${goals.length} active goals`,                                                          link: '/goals',   color: '#c0392b' },
  ]

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <h2 className="font-serif text-[28px] mb-2">mad<span className="text-accent">.</span>focus</h2>
        <p className="text-muted text-[13px]">Loading your workspace…</p>
      </div>
    </div>
  )

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="p-6 lg:p-9 max-w-[1200px] pb-24">
      {/* Greeting */}
      <div className="mb-7">
        <h1 className="font-serif text-[28px] lg:text-[32px] leading-tight">
          {greeting} <span>👋</span>
        </h1>
        <p className="text-muted mt-1 text-[13px]">Here's where things stand today.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
        {CARDS.map(c => (
          <button key={c.label} onClick={() => navigate(c.link)}
            className="card text-left hover:shadow-md hover:border-faint transition-all group">
            <p className="text-[10px] font-medium uppercase tracking-[.06em] text-muted mb-1">{c.label}</p>
            <p className="font-serif text-[26px] lg:text-[28px] leading-none mb-1" style={{ color: c.color }}>{c.value}</p>
            <p className="text-[11px] text-faint">{c.sub}</p>
          </button>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Today's tasks */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-[14px]">Due today</h3>
            <button onClick={() => navigate('/tasks')} className="text-[12px] text-accent hover:underline">See all →</button>
          </div>
          {tasks.filter(t => !t.done && t.due === today()).length === 0
            ? <p className="text-[13px] text-faint py-4 text-center">Nothing due today 🎉</p>
            : (
              <div className="flex flex-col gap-1.5">
                {tasks.filter(t => !t.done && t.due === today()).slice(0, 5).map(t => (
                  <div key={t.id} className="flex items-center gap-2 py-1.5">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: { P1: '#c0392b', P2: '#b8860b', P3: '#2d5a3d', P4: '#c4c0ba' }[t.priority] }} />
                    <span className="text-[13px] flex-1 truncate">{t.title}</span>
                    <span className="text-[10px] text-faint capitalize">{t.priority}</span>
                  </div>
                ))}
                {tasks.filter(t => !t.done && t.due === today()).length > 5 && (
                  <p className="text-[11px] text-muted text-center pt-1">
                    +{tasks.filter(t => !t.done && t.due === today()).length - 5} more
                  </p>
                )}
              </div>
            )
          }
        </div>

        {/* Habits today — now interactive */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-medium text-[14px]">Habits today</h3>
              <p className="text-[11px] text-faint mt-0.5">Tap to mark done · click arrow to track all</p>
            </div>
            <button onClick={() => navigate('/habits')} className="text-[12px] text-accent hover:underline flex-shrink-0">Track →</button>
          </div>
          {habits.length === 0
            ? <p className="text-[13px] text-faint py-4 text-center">No habits yet</p>
            : (
              <div className="flex flex-col gap-1" onClick={() => setDashHabitPicker(null)}>
                {habits.map(h => {
                  const done      = (habitLogs[h.id] || []).some(l => l.date === today())
                  const streak    = calcHabitStreak(habitLogs[h.id] || [])
                  const isVariant = h.track_type === 'variants'
                  const variant   = (habitLogs[h.id] || []).find(l => l.date === today())?.variant || null
                  const pickerOpen = dashHabitPicker === h.id

                  return (
                    <div key={h.id} className="rounded-[8px] transition-colors">
                      <div
                        className={`flex items-center gap-3 py-2 px-2 rounded-[8px] cursor-pointer select-none
                          ${done ? 'hover:bg-accent-light' : 'hover:bg-border-light'}`}
                        onClick={e => {
                          e.stopPropagation()
                          if (isVariant) {
                            setDashHabitPicker(pickerOpen ? null : h.id)
                          } else {
                            markHabit(h.id)
                          }
                        }}
                      >
                        <div className={`w-5 h-5 rounded-[5px] border flex items-center justify-center flex-shrink-0 transition-all
                          ${done ? 'bg-accent border-accent' : 'border-border hover:border-accent'}`}>
                          {done && <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                        </div>
                        <span className={`text-[13px] flex-1 ${done ? 'text-muted line-through' : ''}`}>
                          {h.name}
                          {isVariant && variant && <span className="ml-1.5 text-[11px] text-accent font-medium">· {variant}</span>}
                        </span>
                        {streak > 0 && <span className="text-[11px] text-accent font-medium flex-shrink-0">{streak}d 🔥</span>}
                      </div>

                      {/* Variant pills (inline) */}
                      {pickerOpen && isVariant && (
                        <div className="flex flex-wrap gap-1.5 px-2 pb-2 pt-1" onClick={e => e.stopPropagation()}>
                          {h.variants.map(v => (
                            <button key={v}
                              onClick={() => markHabit(h.id, v)}
                              className={`px-2.5 py-1 rounded-full border text-[11px] transition-all
                                ${variant === v
                                  ? 'bg-accent border-accent text-white font-medium'
                                  : 'border-border text-muted hover:border-accent hover:text-accent hover:bg-accent-light'}`}>
                              {v}
                            </button>
                          ))}
                          {done && (
                            <button onClick={() => markHabit(h.id)}
                              className="px-2.5 py-1 rounded-full border border-danger text-danger text-[11px] hover:bg-danger-light transition-all">
                              Clear
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          }
        </div>

        {/* Currently reading */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-[14px]">Currently reading</h3>
            <button onClick={() => navigate('/library')} className="text-[12px] text-accent hover:underline">Library →</button>
          </div>
          {reading.length === 0
            ? <p className="text-[13px] text-faint py-4 text-center">No books in progress</p>
            : (
              <div className="flex flex-col gap-3">
                {reading.slice(0, 3).map(b => {
                  const pct = b.total_pages > 0 ? Math.round(((b.pages_read || 0) / b.total_pages) * 100) : 0
                  return (
                    <div key={b.id} className="flex items-center gap-3">
                      <div className="w-9 flex-shrink-0 aspect-[2/3] rounded-[4px] overflow-hidden bg-border-light shadow-sm">
                        {b.cover_url
                          ? <img src={b.cover_url} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full bg-accent-light flex items-center justify-center">
                              <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
                            </div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate">{b.title}</p>
                        {b.author && <p className="text-[11px] text-muted truncate">{b.author}</p>}
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex-1 h-1.5 bg-border-light rounded-full overflow-hidden">
                            <div className="h-full bg-warn rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] text-muted flex-shrink-0">{pct}%</span>
                        </div>
                        {b.total_pages > 0 && (
                          <p className="text-[10px] text-faint mt-0.5">{b.pages_read || 0} / {b.total_pages} pages</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }
        </div>

        {/* Active goals */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-[14px]">Active goals</h3>
            <button onClick={() => navigate('/goals')} className="text-[12px] text-accent hover:underline">All goals →</button>
          </div>
          {goals.length === 0
            ? <p className="text-[13px] text-faint py-4 text-center">No active goals</p>
            : (
              <div className="flex flex-col gap-3">
                {goals.slice(0, 4).map(g => {
                  const pct = g.target > 0 ? Math.round((g.current / g.target) * 100) : 0
                  return (
                    <div key={g.id} className="flex items-center gap-3">
                      <Ring pct={pct} size={34} stroke={3} color="#2d5a3d">
                        <span className="text-[8px] font-bold text-accent">{pct}%</span>
                      </Ring>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate">{g.title}</p>
                        <p className="text-[11px] text-muted">{g.current}/{g.target} · {g.horizon}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }
        </div>
      </div>

      {/* ── Writing Dashboard ──────────────────────────────────── */}
      <div className="card mb-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-medium text-[14px] flex items-center gap-2">
              <span>✍️</span> Writing Dashboard
            </h3>
            <p className="text-[12px] text-muted mt-0.5 italic">{getWritingMessage(writingStreak, totalWords)}</p>
          </div>
          <button onClick={() => navigate('/habits')} className="text-[12px] text-accent hover:underline flex-shrink-0">
            Habits →
          </button>
        </div>

        {/* Stat pills */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Words written', value: totalWords >= 1000 ? `${(totalWords / 1000).toFixed(1)}k` : totalWords.toLocaleString(), color: '#2d5a3d' },
            { label: 'Chapters released', value: totalChapters, color: '#2563eb' },
            { label: 'Writing streak', value: writingStreak > 0 ? `🔥 ${writingStreak}d` : '—', color: '#b8860b' },
            { label: 'Days written', value: writingDays, color: '#c0392b' },
          ].map(s => (
            <div key={s.label} className="bg-border-light rounded-[8px] px-4 py-3 text-center">
              <p className="font-serif text-[22px] leading-none mb-1" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[10px] text-muted uppercase tracking-[.05em]">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12px] font-medium text-muted">Daily word count</p>
            <div className="flex gap-1">
              {['daily', 'weekly', 'monthly'].map(f => (
                <button key={f}
                  onClick={() => setChartFilter(f)}
                  className={`px-2.5 py-1 rounded-[5px] text-[11px] capitalize transition-all
                    ${chartFilter === f
                      ? 'bg-accent text-white font-medium'
                      : 'text-muted hover:bg-border-light'}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          {writingLogs.length === 0
            ? (
              <div className="h-[120px] flex items-center justify-center bg-border-light rounded-[8px]">
                <p className="text-[12px] text-faint">No writing data yet — log your first session below</p>
              </div>
            )
            : <WordChart logs={writingLogs} filter={chartFilter} />
          }
        </div>

        {/* Today's log */}
        <div className="border-t border-border-light pt-4">
          {writingToday ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <span className="text-[13px] text-muted">
                  Logged today —&nbsp;
                  <span className="text-text font-medium">{writingToday.chapters} chapter{writingToday.chapters !== 1 ? 's' : ''}</span>
                  &nbsp;·&nbsp;
                  <span className="text-text font-medium">{(writingToday.word_count || 0).toLocaleString()} words</span>
                </span>
              </div>
              <button
                onClick={() => setWritingForm({ chapters: String(writingToday.chapters), wordCount: String(writingToday.word_count) })}
                className="text-[11px] text-accent hover:underline">
                Edit
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2 items-end">
              <div>
                <label className="text-[10px] text-muted uppercase tracking-[.05em] block mb-1">Chapters released</label>
                <input
                  type="number" min="0" placeholder="0"
                  className="form-input w-[110px] text-center"
                  value={writingForm.chapters}
                  onChange={e => setWritingForm(p => ({ ...p, chapters: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-[10px] text-muted uppercase tracking-[.05em] block mb-1">Words written</label>
                <input
                  type="number" min="0" placeholder="0"
                  className="form-input w-[140px] text-center"
                  value={writingForm.wordCount}
                  onChange={e => setWritingForm(p => ({ ...p, wordCount: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && saveWriting()}
                />
              </div>
              <button
                onClick={saveWriting}
                disabled={savingWriting || (!writingForm.chapters && !writingForm.wordCount)}
                className="btn btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
                {savingWriting ? 'Saving…' : 'Log today'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Reading calendar — full width */}
      <BookCalendar sessions={sessions} />
    </div>
  )
}
