import React, { useState, useEffect, useRef } from 'react'
import { sb, dbRun } from '../lib/supabase'
import { useToast, Ring } from '../components/ui'

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6) }
function today() { return new Date().toISOString().slice(0,10) }

const MODES = {
  focus:       { label: 'Focus',       minutes: 25, color: '#2d5a3d' },
  short_break: { label: 'Short Break', minutes: 5,  color: '#b8860b' },
  long_break:  { label: 'Long Break',  minutes: 15, color: '#2563eb' },
}

export default function Pomodoro() {
  const toast = useToast()
  const [mode, setMode]         = useState('focus')
  const [secsLeft, setSecsLeft] = useState(MODES.focus.minutes * 60)
  const [running, setRunning]   = useState(false)
  const [sessions, setSessions] = useState([])
  const [tasks, setTasks]       = useState([])
  const [linkedTask, setLinkedTask] = useState('')
  const [customMins, setCustomMins] = useState('')
  const intervalRef = useRef(null)
  const startedAt   = useRef(null)
  const totalSecs   = useRef(MODES.focus.minutes * 60)

  useEffect(() => {
    sb.from('tasks').select('id,title').eq('done', false).then(({data}) => setTasks(data||[]))
    sb.from('pomodoro_sessions').select('*').eq('date', today()).order('created_at',{ascending:false})
      .then(({data}) => setSessions(data||[]))
  }, [])

  useEffect(() => {
    if (running) {
      startedAt.current = Date.now()
      intervalRef.current = setInterval(() => {
        setSecsLeft(s => {
          if (s <= 1) { clearInterval(intervalRef.current); setRunning(false); handleComplete(); return 0 }
          return s - 1
        })
      }, 1000)
    } else { clearInterval(intervalRef.current) }
    return () => clearInterval(intervalRef.current)
  }, [running, mode])

  async function handleComplete() {
    const duration = Math.round(totalSecs.current / 60)
    const session = { id:uid(), task_id:linkedTask||null, duration, type:mode, completed:true, date:today(), created_at:new Date().toISOString() }
    setSessions(p => [session, ...p])
    try { await dbRun('Save session', ()=>sb.from('pomodoro_sessions').insert(session)) } catch {}
    if (mode==='focus') toast(`🎯 Focus session complete! ${duration} min`, 'success')
    else toast(`☕ Break done — ready to focus?`)
  }

  function switchMode(m, customMin) {
    setMode(m)
    const mins = customMin || MODES[m].minutes
    const secs = mins * 60
    totalSecs.current = secs
    setSecsLeft(secs)
    setRunning(false)
  }

  function reset() { switchMode(mode, customMins ? parseInt(customMins) : null) }

  const pct = 100 - (secsLeft / totalSecs.current) * 100
  const mins = String(Math.floor(secsLeft / 60)).padStart(2,'0')
  const secs = String(secsLeft % 60).padStart(2,'0')
  const todayFocus = sessions.filter(s=>s.type==='focus'&&s.completed).reduce((a,s)=>a+s.duration,0)

  return (
    <div className="p-9 max-w-[700px]">
      <div className="mb-7">
        <h1 className="page-title">Pomodoro</h1>
        <p className="page-sub">{todayFocus} min focused today · {sessions.filter(s=>s.type==='focus'&&s.completed).length} sessions</p>
      </div>

      {/* Mode switcher */}
      <div className="flex gap-2 mb-8">
        {Object.entries(MODES).map(([k,v]) => (
          <button key={k} onClick={()=>switchMode(k)}
            className={`px-4 py-2 rounded-[7px] text-[13px] font-medium transition-all
              ${mode===k ? 'bg-accent text-white' : 'bg-surface border border-border text-muted hover:border-muted hover:text-text'}`}>
            {v.label}
          </button>
        ))}
      </div>

      {/* Timer ring */}
      <div className="flex flex-col items-center mb-8">
        <Ring pct={pct} size={200} stroke={8} color={MODES[mode].color}>
          <div className="text-center">
            <div className="font-serif text-[48px] leading-none tracking-tight">{mins}:{secs}</div>
            <div className="text-[12px] text-muted mt-1">{MODES[mode].label}</div>
          </div>
        </Ring>

        <div className="flex gap-3 mt-6">
          <button onClick={reset} className="btn btn-ghost">Reset</button>
          <button onClick={()=>setRunning(r=>!r)}
            className="btn btn-primary px-8 text-[15px]">
            {running ? 'Pause' : secsLeft===totalSecs.current ? 'Start' : 'Resume'}
          </button>
        </div>
      </div>

      {/* Options */}
      <div className="bg-surface border border-border rounded-card p-4 mb-6 grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">Link to task</label>
          <select className="form-select" value={linkedTask} onChange={e=>setLinkedTask(e.target.value)}>
            <option value="">No task linked</option>
            {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Custom duration (min)</label>
          <input className="form-input" type="number" min="1" max="120" placeholder={MODES[mode].minutes}
            value={customMins} onChange={e=>{setCustomMins(e.target.value);if(e.target.value)switchMode(mode,parseInt(e.target.value))}}/>
        </div>
      </div>

      {/* Today's sessions */}
      {sessions.length > 0 && (
        <div>
          <h3 className="text-[13px] font-medium text-muted mb-3 uppercase tracking-wide">Today's sessions</h3>
          <div className="flex flex-col gap-1.5">
            {sessions.map(s => {
              const task = tasks.find(t=>t.id===s.task_id)
              const m = MODES[s.type]
              return (
                <div key={s.id} className="flex items-center gap-3 bg-surface border border-border rounded-[8px] px-3 py-2.5">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:m?.color||'#2d5a3d'}}/>
                  <span className="text-[13px] font-medium">{s.duration} min</span>
                  <span className="text-[12px] text-muted">{m?.label}</span>
                  {task && <span className="text-[12px] text-muted ml-auto truncate">↳ {task.title}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
