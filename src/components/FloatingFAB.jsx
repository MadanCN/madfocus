import React, { useState, useEffect, useRef } from 'react'
import { sb, dbRun } from '../lib/supabase'

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function today() { return new Date().toISOString().slice(0, 10) }

const MODES = {
  focus:       { label: 'Focus',       minutes: 25, color: '#2d5a3d', bg: '#eef4f0' },
  short_break: { label: 'Short Break', minutes: 5,  color: '#b8860b', bg: '#fdf8ec' },
  long_break:  { label: 'Long Break',  minutes: 15, color: '#2563eb', bg: '#eff6ff' },
}

export default function FloatingFAB({ notesOpen, setNotesOpen }) {
  const [pomOpen, setPomOpen]     = useState(false)
  const [fabOpen, setFabOpen]     = useState(false)

  // Pomodoro state
  const [mode, setMode]           = useState('focus')
  const [secsLeft, setSecsLeft]   = useState(MODES.focus.minutes * 60)
  const [running, setRunning]     = useState(false)
  const [sessions, setSessions]   = useState([])
  const [tasks, setTasks]         = useState([])
  const [linkedTask, setLinkedTask] = useState('')
  const intervalRef               = useRef(null)
  const totalSecs                 = useRef(MODES.focus.minutes * 60)

  useEffect(() => {
    sb.from('tasks').select('id,title').eq('done', false).then(({ data }) => setTasks(data || []))
    sb.from('pomodoro_sessions').select('*').eq('date', today()).order('created_at', { ascending: false })
      .then(({ data }) => setSessions(data || []))
  }, [])

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSecsLeft(s => {
          if (s <= 1) {
            clearInterval(intervalRef.current)
            setRunning(false)
            handleComplete()
            return 0
          }
          return s - 1
        })
      }, 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [running])

  async function handleComplete() {
    const duration = Math.round(totalSecs.current / 60)
    const session = {
      id: uid(), task_id: linkedTask || null, duration,
      type: mode, completed: true, date: today(),
      created_at: new Date().toISOString()
    }
    setSessions(p => [session, ...p])
    try { await dbRun('Save session', () => sb.from('pomodoro_sessions').insert(session)) } catch {}
    // Notify
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`${MODES[mode].label} complete!`, { body: 'Time to switch.' })
    }
  }

  function setModeAndReset(m) {
    setMode(m)
    setRunning(false)
    clearInterval(intervalRef.current)
    const secs = MODES[m].minutes * 60
    setSecsLeft(secs)
    totalSecs.current = secs
  }

  function toggle() { setRunning(r => !r) }

  function reset() {
    setRunning(false)
    clearInterval(intervalRef.current)
    const secs = MODES[mode].minutes * 60
    setSecsLeft(secs)
    totalSecs.current = secs
  }

  const mins = String(Math.floor(secsLeft / 60)).padStart(2, '0')
  const secs = String(secsLeft % 60).padStart(2, '0')
  const pct  = Math.round(((totalSecs.current - secsLeft) / totalSecs.current) * 100)
  const m    = MODES[mode]

  const todayFocus = sessions.filter(s => s.type === 'focus' && s.completed).reduce((a, s) => a + s.duration, 0)
  const todaySessions = sessions.filter(s => s.type === 'focus' && s.completed).length

  // FAB: toggle between closed / open (shows two sub-buttons)
  function handleNotes() {
    setFabOpen(false)
    if (pomOpen) setPomOpen(false)
    setNotesOpen(prev => !prev)
  }

  function handlePom() {
    setFabOpen(false)
    if (notesOpen) setNotesOpen(false)
    setPomOpen(prev => !prev)
  }

  return (
    <>
      {/* ── Floating Pomodoro Panel ── */}
      {pomOpen && (
        <div
          className="fixed bottom-[80px] right-5 z-[850] w-[280px] bg-surface border border-border
                     rounded-[14px] shadow-md overflow-hidden animate-slide-up"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-light">
            <span className="text-[13px] font-medium">Pomodoro</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted">{todayFocus}m · {todaySessions} sessions</span>
              <button onClick={() => setPomOpen(false)} className="p-1 rounded text-muted hover:text-text">
                <XSmIcon />
              </button>
            </div>
          </div>

          {/* Mode pills */}
          <div className="flex gap-1.5 px-4 pt-3">
            {Object.entries(MODES).map(([k, v]) => (
              <button key={k} onClick={() => setModeAndReset(k)}
                className={`flex-1 py-1 px-1.5 rounded-[6px] text-[10.5px] font-medium transition-all border
                  ${mode === k ? 'border-transparent' : 'border-border text-muted hover:border-faint'}`}
                style={mode === k ? { background: v.bg, color: v.color, borderColor: 'transparent' } : {}}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* Timer ring */}
          <div className="flex flex-col items-center py-5">
            <div className="relative w-[110px] h-[110px]">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 110 110">
                <circle cx="55" cy="55" r="48" fill="none" stroke="#f0ede8" strokeWidth="6"/>
                <circle cx="55" cy="55" r="48" fill="none"
                  stroke={m.color} strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${Math.PI * 96}`}
                  strokeDashoffset={`${Math.PI * 96 * (1 - pct / 100)}`}
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-serif text-[26px] leading-none" style={{ color: m.color }}>{mins}:{secs}</span>
                <span className="text-[10px] text-muted mt-0.5">{m.label}</span>
              </div>
            </div>

            {/* Task link */}
            <select
              value={linkedTask}
              onChange={e => setLinkedTask(e.target.value)}
              className="mt-3 form-select text-[11.5px] py-1 mx-4 w-[calc(100%-2rem)]"
            >
              <option value="">No linked task</option>
              {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>

          {/* Controls */}
          <div className="flex gap-2 px-4 pb-4">
            <button onClick={toggle}
              className="flex-1 py-2 rounded-[8px] text-[13px] font-medium text-white transition-all"
              style={{ background: m.color }}
            >
              {running ? 'Pause' : secsLeft === totalSecs.current ? 'Start' : 'Resume'}
            </button>
            <button onClick={reset}
              className="px-3 py-2 rounded-[8px] text-[13px] border border-border text-muted hover:border-faint hover:text-text transition-all"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* ── FAB group ── */}
      <div className="fixed bottom-5 right-5 z-[860] flex flex-col items-end gap-2">
        {/* Sub buttons when FAB is open */}
        {fabOpen && (
          <>
            <FabSubBtn
              label="Pomodoro"
              active={pomOpen}
              onClick={handlePom}
              icon={<TimerIcon />}
              badge={running ? `${mins}:${secs}` : null}
            />
            <FabSubBtn
              label="Notes"
              active={notesOpen}
              onClick={handleNotes}
              icon={<NoteIcon />}
            />
          </>
        )}

        {/* Main FAB */}
        <button
          onClick={() => setFabOpen(prev => !prev)}
          className="w-12 h-12 rounded-full flex items-center justify-center text-white
                     shadow-md transition-all duration-150 hover:scale-105 active:scale-95"
          style={{ background: fabOpen ? '#8a8680' : '#2d5a3d' }}
          title="Quick actions"
        >
          {fabOpen
            ? <XSmIcon className="w-5 h-5" />
            : <PlusIcon className="w-5 h-5" />}
        </button>

        {/* Running indicator dot */}
        {running && !fabOpen && (
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-warn border-2 border-surface animate-pulse" />
        )}
      </div>

      <style>{`
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up { animation: slide-up 0.18s ease-out; }
      `}</style>
    </>
  )
}

function FabSubBtn({ label, active, onClick, icon, badge }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`text-[11.5px] font-medium px-2.5 py-1 rounded-full shadow-sm
        bg-surface border border-border whitespace-nowrap transition-all
        ${active ? 'text-accent border-accent-mid' : 'text-muted'}`}>
        {badge ? badge : label}
      </span>
      <button
        onClick={onClick}
        className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm
          border transition-all duration-150 hover:scale-105
          ${active ? 'bg-accent text-white border-transparent' : 'bg-surface border-border text-muted hover:text-text hover:border-faint'}`}
      >
        {React.cloneElement(icon, { className: 'w-4 h-4' })}
      </button>
    </div>
  )
}

// Icons
function TimerIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M9 3h6M12 3v2"/></svg> }
function NoteIcon(p)  { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> }
function PlusIcon(p)  { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> }
function XSmIcon(p)   { return <svg {...p} className={p.className || 'w-4 h-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
