import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { sb } from '../lib/supabase'
import { Ring } from '../components/ui'

function today() { return new Date().toISOString().slice(0, 10) }

function getStreak(logs) {
  const s = new Set(logs.map(e => e.date))
  let streak = 0
  const d = new Date(today())
  while (s.has(d.toISOString().slice(0, 10))) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

// ── Book Reading Calendar ──
function BookCalendar({ sessions }) {
  // Build a map of date → total pages read
  const dayMap = {}
  sessions.forEach(s => {
    if (!s.date || !s.pages_read) return
    dayMap[s.date] = (dayMap[s.date] || 0) + s.pages_read
  })

  // Last 12 weeks of activity (84 days)
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

  // Group into weeks
  const weeks = []
  let week = []
  // Pad first week
  const firstDow = days[0].dow === 0 ? 6 : days[0].dow - 1 // Mon=0
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

      {/* Month labels */}
      <div className="flex gap-[3px] mb-1 ml-[18px]">
        {weeks.map((_, wi) => (
          <div key={wi} className="w-[11px] text-[9px] text-faint text-center shrink-0">
            {monthLabels[wi] || ''}
          </div>
        ))}
      </div>

      <div className="flex gap-[3px]">
        {/* Day labels */}
        <div className="flex flex-col gap-[3px] mr-0.5">
          {['M', '', 'W', '', 'F', '', 'S'].map((d, i) => (
            <div key={i} className="w-[14px] h-[11px] text-[9px] text-faint leading-[11px]">{d}</div>
          ))}
        </div>

        {/* Grid */}
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
                      : cell === null ? 'transparent' : '#f0ede8'
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

export default function Home() {
  const navigate = useNavigate()
  const [data, setData] = useState({
    tasks: [], habits: [], habitLogs: {}, goals: [],
    sessions: [], books: [], pomSessions: []
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      sb.from('tasks').select('*'),
      sb.from('habits').select('*'),
      sb.from('habit_logs').select('*'),
      sb.from('goals').select('*').eq('status', 'active'),
      sb.from('reading_sessions').select('*'),
      sb.from('books').select('id,title,cover_url,status,pages_read,total_pages,author'),
      sb.from('pomodoro_sessions').select('*').eq('date', today()),
    ]).then(([{ data: t }, { data: h }, { data: hl }, { data: g }, { data: rs }, { data: b }, { data: ps }]) => {
      const logMap = {}
      ;(hl || []).forEach(l => {
        if (!logMap[l.habit_id]) logMap[l.habit_id] = []
        logMap[l.habit_id].push(l)
      })
      setData({ tasks: t || [], habits: h || [], habitLogs: logMap, goals: g || [], sessions: rs || [], books: b || [], pomSessions: ps || [] })
      setLoading(false)
    })
  }, [])

  const { tasks, habits, habitLogs, goals, sessions, books, pomSessions } = data

  const activeTasks    = tasks.filter(t => !t.done).length
  const dueTodayTasks  = tasks.filter(t => !t.done && t.due === today()).length
  const overdueTasks   = tasks.filter(t => !t.done && t.due && t.due < today()).length
  const todayFocusMins = pomSessions.filter(s => s.type === 'focus' && s.completed).reduce((a, s) => a + s.duration, 0)
  const habitsToday    = habits.filter(h => (habitLogs[h.id] || []).some(l => l.date === today()))
  const bestStreak     = habits.reduce((best, h) => {
    const s = getStreak(habitLogs[h.id] || [])
    return s > best.streak ? { name: h.name, streak: s } : best
  }, { name: '—', streak: 0 })
  const reading        = books.filter(b => b.status === 'reading')
  const avgGoalPct     = goals.length > 0
    ? Math.round(goals.reduce((a, g) => a + (g.target > 0 ? (g.current / g.target) * 100 : 0), 0) / goals.length)
    : 0

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

        {/* Habits today */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-[14px]">Habits today</h3>
            <button onClick={() => navigate('/habits')} className="text-[12px] text-accent hover:underline">Track →</button>
          </div>
          {habits.length === 0
            ? <p className="text-[13px] text-faint py-4 text-center">No habits yet</p>
            : (
              <div className="flex flex-col gap-2">
                {habits.slice(0, 5).map(h => {
                  const done = (habitLogs[h.id] || []).some(l => l.date === today())
                  const streak = getStreak(habitLogs[h.id] || [])
                  return (
                    <div key={h.id} className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-[5px] border flex items-center justify-center flex-shrink-0 transition-all
                        ${done ? 'bg-accent border-accent' : 'border-border'}`}>
                        {done && <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                      </div>
                      <span className={`text-[13px] flex-1 ${done ? 'text-muted line-through' : ''}`}>{h.name}</span>
                      {streak > 0 && <span className="text-[11px] text-accent font-medium">{streak}d 🔥</span>}
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

      {/* Reading calendar — full width */}
      <BookCalendar sessions={sessions} />
    </div>
  )
}
