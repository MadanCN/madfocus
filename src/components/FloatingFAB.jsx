import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { sb, dbRun } from '../lib/supabase'

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function today() { return new Date().toISOString().slice(0, 10) }

const MODES = {
  focus:       { label: 'Focus',       minutes: 25 },
  short_break: { label: 'Short Break', minutes: 5  },
  long_break:  { label: 'Long Break',  minutes: 15 },
}
const MODE_COLORS = {
  focus:       { color: 'var(--c-accent)',    bg: 'var(--c-accent-light)' },
  short_break: { color: 'var(--c-warn)',      bg: 'var(--c-warn-light)'   },
  long_break:  { color: '#2563eb',            bg: '#eff6ff'               },
}

export default function FloatingFAB({ notesOpen, setNotesOpen }) {
  const navigate                    = useNavigate()
  const [fabOpen, setFabOpen]       = useState(false)
  const [pomOpen, setPomOpen]       = useState(false)
  const [aiOpen,  setAiOpen]        = useState(false)

  // Pomodoro state
  const [mode, setMode]             = useState('focus')
  const [secsLeft, setSecsLeft]     = useState(MODES.focus.minutes * 60)
  const [running, setRunning]       = useState(false)
  const [sessions, setSessions]     = useState([])
  const [tasks, setTasks]           = useState([])
  const [linkedTask, setLinkedTask] = useState('')
  const intervalRef                 = useRef(null)
  const totalSecs                   = useRef(MODES.focus.minutes * 60)

  // AI chat state
  const [messages, setMessages]     = useState([
    { role: 'assistant', text: "Hey! I'm your productivity coach. Ask me anything — your tasks, habits, goals, or just what to focus on today." }
  ])
  const [aiInput, setAiInput]       = useState('')
  const [aiLoading, setAiLoading]   = useState(false)
  const chatEndRef                  = useRef(null)

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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, aiLoading])

  async function handleComplete() {
    const duration = Math.round(totalSecs.current / 60)
    const session = {
      id: uid(), task_id: linkedTask || null, duration,
      type: mode, completed: true, date: today(),
      created_at: new Date().toISOString()
    }
    setSessions(p => [session, ...p])
    try { await dbRun('Save session', () => sb.from('pomodoro_sessions').insert(session)) } catch {}
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

  function reset() {
    setRunning(false)
    clearInterval(intervalRef.current)
    const secs = MODES[mode].minutes * 60
    setSecsLeft(secs)
    totalSecs.current = secs
  }

  async function buildContext() {
    const d = today()
    const [tasksRes, habitsRes, goalsRes, logsRes, writingRes] = await Promise.all([
      sb.from('tasks').select('title,priority,done,due').eq('done', false).limit(20),
      sb.from('habits').select('id,name,track_type').eq('archived', false),
      sb.from('goals').select('title,status,progress').limit(10),
      sb.from('habit_logs').select('habit_id,date,value,duration_min').gte('date', new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)),
      sb.from('writing_logs').select('date,chapters,word_count').order('date', { ascending: false }).limit(30),
    ])

    const habits = habitsRes.data || []
    const logs   = logsRes.data   || []

    const habitStats = habits.map(h => {
      const hLogs = logs.filter(l => l.habit_id === h.id)
      const totalMin = hLogs.reduce((a, l) => a + (l.duration_min || 0), 0)
      const doneToday = hLogs.some(l => l.date === d && l.value)
      const streak = (() => {
        let s = 0, cur = new Date()
        while (true) {
          const ds = cur.toISOString().slice(0, 10)
          if (hLogs.find(l => l.date === ds && l.value)) { s++; cur.setDate(cur.getDate() - 1) }
          else break
        }
        return s
      })()
      return { name: h.name, type: h.track_type, doneToday, streak, totalMinutes: totalMin }
    })

    return {
      date: d,
      pendingTasks: (tasksRes.data || []).map(t => ({ title: t.title, priority: t.priority, due: t.due })),
      habits: habitStats,
      goals: (goalsRes.data || []).map(g => ({ title: g.title, status: g.status, progress: g.progress })),
      writing: writingRes.data || [],
    }
  }

  async function sendAiMessage() {
    const q = aiInput.trim()
    if (!q || aiLoading) return
    setAiInput('')
    setMessages(p => [...p, { role: 'user', text: q }])
    setAiLoading(true)
    try {
      const context = await buildContext()
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, context }),
      })
      const data = await res.json()
      setMessages(p => [...p, { role: 'assistant', text: data.reply || 'Sorry, I had trouble responding.' }])
    } catch {
      setMessages(p => [...p, { role: 'assistant', text: 'Could not reach the assistant. Check your connection.' }])
    } finally {
      setAiLoading(false)
    }
  }

  const mins = String(Math.floor(secsLeft / 60)).padStart(2, '0')
  const secs = String(secsLeft % 60).padStart(2, '0')
  const pct  = Math.round(((totalSecs.current - secsLeft) / totalSecs.current) * 100)
  const mc   = MODE_COLORS[mode]
  const todayFocus    = sessions.filter(s => s.type === 'focus' && s.completed).reduce((a, s) => a + s.duration, 0)
  const todaySessions = sessions.filter(s => s.type === 'focus' && s.completed).length

  function handleNotes() {
    setFabOpen(false); setPomOpen(false); setAiOpen(false)
    navigate('/notes')
  }
  function handlePom() {
    setFabOpen(false)
    if (notesOpen) setNotesOpen(false)
    setAiOpen(false)
    setPomOpen(prev => !prev)
  }
  function handleAi() {
    setFabOpen(false)
    if (notesOpen) setNotesOpen(false)
    setPomOpen(false)
    setAiOpen(prev => !prev)
  }

  const panelStyle = {
    position: 'fixed',
    bottom: '80px',
    right: '20px',
    zIndex: 850,
    background: 'var(--c-surface)',
    border: '1px solid var(--c-border)',
    borderRadius: '16px',
    boxShadow: '0 8px 40px rgba(0,0,0,0.16)',
    overflow: 'hidden',
  }

  return (
    <>
      {/* ── Pomodoro Panel ── */}
      {pomOpen && (
        <div style={{ ...panelStyle, width: '288px' }} className="animate-slide-up">
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--c-border-light)' }}
          >
            <span className="text-[13px] font-semibold" style={{ color: 'var(--c-text)' }}>Pomodoro</span>
            <div className="flex items-center gap-2">
              <span className="text-[11px]" style={{ color: 'var(--c-muted)' }}>
                {todayFocus}m · {todaySessions} sessions
              </span>
              <button
                onClick={() => setPomOpen(false)}
                className="p-1 rounded-[5px] transition-colors"
                style={{ color: 'var(--c-faint)' }}
              >
                <XSmIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Mode pills */}
          <div className="flex gap-1.5 px-4 pt-3">
            {Object.entries(MODES).map(([k, v]) => {
              const mc2 = MODE_COLORS[k]
              return (
                <button
                  key={k}
                  onClick={() => setModeAndReset(k)}
                  className="flex-1 py-1 px-1.5 rounded-[6px] text-[10.5px] font-medium transition-all"
                  style={
                    mode === k
                      ? { background: mc2.bg, color: mc2.color, border: '1px solid transparent' }
                      : { background: 'transparent', color: 'var(--c-muted)', border: '1px solid var(--c-border)' }
                  }
                >
                  {v.label}
                </button>
              )
            })}
          </div>

          {/* Timer ring */}
          <div className="flex flex-col items-center py-5">
            <div className="relative w-[108px] h-[108px]">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 110 110">
                <circle cx="55" cy="55" r="48" fill="none" stroke="var(--c-border)" strokeWidth="5"/>
                <circle cx="55" cy="55" r="48" fill="none"
                  stroke={mc.color} strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={`${Math.PI * 96}`}
                  strokeDashoffset={`${Math.PI * 96 * (1 - pct / 100)}`}
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-serif text-[26px] leading-none" style={{ color: mc.color }}>
                  {mins}:{secs}
                </span>
                <span className="text-[10px] mt-0.5" style={{ color: 'var(--c-muted)' }}>
                  {MODES[mode].label}
                </span>
              </div>
            </div>

            <select
              value={linkedTask}
              onChange={e => setLinkedTask(e.target.value)}
              className="mt-3 form-select text-[11.5px] py-1 mx-4"
              style={{ width: 'calc(100% - 2rem)' }}
            >
              <option value="">No linked task</option>
              {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>

          <div className="flex gap-2 px-4 pb-4">
            <button
              onClick={() => setRunning(r => !r)}
              className="flex-1 py-2 rounded-[8px] text-[13px] font-medium text-white transition-all"
              style={{ background: mc.color }}
            >
              {running ? 'Pause' : secsLeft === totalSecs.current ? 'Start' : 'Resume'}
            </button>
            <button
              onClick={reset}
              className="px-3 py-2 rounded-[8px] text-[13px] transition-all"
              style={{ border: '1.5px solid var(--c-border)', color: 'var(--c-muted)', background: 'transparent' }}
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* ── AI Chat Panel ── */}
      {aiOpen && (
        <div style={{ ...panelStyle, width: '320px', display: 'flex', flexDirection: 'column', maxHeight: '480px' }} className="animate-slide-up">
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--c-border-light)' }}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{ background: 'var(--c-accent-light)', color: 'var(--c-accent)' }}
              >
                AI
              </span>
              <span className="text-[13px] font-semibold" style={{ color: 'var(--c-text)' }}>Coach</span>
            </div>
            <button
              onClick={() => setAiOpen(false)}
              className="p-1 rounded-[5px] transition-colors"
              style={{ color: 'var(--c-faint)' }}
            >
              <XSmIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ minHeight: 0 }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="max-w-[85%] px-3 py-2 rounded-[10px] text-[12.5px] leading-relaxed"
                  style={
                    msg.role === 'user'
                      ? { background: 'var(--c-accent)', color: '#fff', borderBottomRightRadius: '3px' }
                      : { background: 'var(--c-border-light)', color: 'var(--c-text)', borderBottomLeftRadius: '3px' }
                  }
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {aiLoading && (
              <div className="flex justify-start">
                <div
                  className="px-3 py-2.5 rounded-[10px]"
                  style={{ background: 'var(--c-border-light)', borderBottomLeftRadius: '3px' }}
                >
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full dot-bounce"
                        style={{ background: 'var(--c-muted)', animationDelay: `${i * 0.2}s` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div
            className="flex gap-2 px-3 pb-3 flex-shrink-0"
            style={{ borderTop: '1px solid var(--c-border-light)', paddingTop: '10px' }}
          >
            <input
              type="text"
              value={aiInput}
              onChange={e => setAiInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendAiMessage()}
              placeholder="Ask anything…"
              className="flex-1 px-3 py-2 rounded-[8px] text-[12.5px] outline-none"
              style={{
                background: 'var(--c-bg)',
                border: '1.5px solid var(--c-border)',
                color: 'var(--c-text)',
              }}
              disabled={aiLoading}
            />
            <button
              onClick={sendAiMessage}
              disabled={!aiInput.trim() || aiLoading}
              className="px-3 py-2 rounded-[8px] text-white text-[12px] font-medium transition-all"
              style={{
                background: aiInput.trim() && !aiLoading ? 'var(--c-accent)' : 'var(--c-faint)',
                cursor: aiInput.trim() && !aiLoading ? 'pointer' : 'not-allowed',
              }}
            >
              <SendIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── FAB group ── */}
      <div className="fixed bottom-5 right-5 z-[860] flex flex-col items-end gap-2">
        {fabOpen && (
          <>
            <FabSubBtn
              label="AI Coach"
              active={aiOpen}
              onClick={handleAi}
              icon={<SparkleIcon />}
            />
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
        <div className="relative">
          <button
            onClick={() => {
              setFabOpen(prev => !prev)
              if (fabOpen) { setPomOpen(false); setAiOpen(false) }
            }}
            className="w-12 h-12 rounded-full flex items-center justify-center text-white transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              background: fabOpen ? 'var(--c-muted)' : 'var(--c-accent)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
            }}
            title="Quick actions"
          >
            {fabOpen
              ? <XSmIcon className="w-5 h-5" />
              : <PlusIcon className="w-5 h-5" />}
          </button>
          {running && !fabOpen && (
            <span
              className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 pulse-ring"
              style={{ background: 'var(--c-warn)', borderColor: 'var(--c-surface)' }}
            />
          )}
        </div>
      </div>
    </>
  )
}

function FabSubBtn({ label, active, onClick, icon, badge }) {
  return (
    <div className="flex items-center gap-2.5 fab-sub-enter">
      <span
        className="text-[11.5px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap"
        style={{
          background: 'var(--c-surface)',
          border: active ? '1px solid var(--c-accent-mid)' : '1px solid var(--c-border)',
          color: active ? 'var(--c-accent)' : 'var(--c-muted)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}
      >
        {badge || label}
      </span>
      <button
        onClick={onClick}
        className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-150 hover:scale-105"
        style={{
          background: active ? 'var(--c-accent)' : 'var(--c-surface)',
          border: active ? '1px solid transparent' : '1px solid var(--c-border)',
          color: active ? '#fff' : 'var(--c-muted)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
        }}
      >
        {React.cloneElement(icon, { className: 'w-4 h-4' })}
      </button>
    </div>
  )
}

// Icons
function TimerIcon(p)   { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M9 3h6M12 3v2"/></svg> }
function NoteIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> }
function PlusIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> }
function XSmIcon(p)     { return <svg {...p} className={p.className || 'w-4 h-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
function SparkleIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg> }
function SendIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> }
