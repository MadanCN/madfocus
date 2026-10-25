import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Play, Pause, RotateCcw, SkipForward, Link2, Check } from 'lucide-react'
import { useFocus, MODES } from '../contexts/FocusContext'
import { usePresence, useLayer, useFocusReturn, useConfirm } from './ui'
import { sb } from '../lib/supabase'
import { fmtClock, fmtMinutes, plural } from '../lib/utils'

const PRESETS = [15, 25, 50, 90]

export default function FocusOverlay() {
  const f = useFocus()
  const open = f.overlayOpen
  const [mounted, shown] = usePresence(open, 240)
  const ref = useRef(null)
  const confirm = useConfirm()
  const [tasks, setTasks] = useState([])
  const [picking, setPicking] = useState(false)
  const [q, setQ] = useState('')
  useLayer(open, () => (picking ? setPicking(false) : f.closeOverlay()))
  useFocusReturn(open, ref)

  useEffect(() => {
    if (!open) return
    sb.from('tasks').select('id,title,priority,due').eq('done', false).limit(200).then(({ data }) => setTasks(data || []))
  }, [open])

  useEffect(() => {
    if (!open) return
    const h = e => {
      if (['INPUT', 'BUTTON', 'TEXTAREA'].includes(e.target.tagName)) return
      if (e.code === 'Space') { e.preventDefault(); f.running ? f.pause() : f.start() }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, f.running])

  async function reset() {
    const elapsed = f.total - f.remaining
    if (elapsed > 60) {
      const ok = await confirm({ title: 'Discard this session?', body: `You’re ${fmtMinutes(Math.round(elapsed / 60))} in. Resetting throws that time away, and it won’t count toward today.`, confirmLabel: 'Discard session' })
      if (!ok) return
    }
    f.reset()
  }

  if (!mounted) return null
  const pct = f.total ? ((f.total - f.remaining) / f.total) * 100 : 0
  const size = 300, stroke = 6, r = (size - stroke) / 2, circ = 2 * Math.PI * r
  const filtered = tasks.filter(t => !q || t.title.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
  const isFocus = f.mode === 'focus'

  return createPortal(
    <div ref={ref} role="dialog" aria-modal="true" aria-label="Focus timer"
      className="fixed inset-0 z-[1080] bg-paper flex flex-col transition-opacity duration-200"
      style={{ opacity: shown ? 1 : 0 }}>
      <header className="flex items-center gap-3 px-5 md:px-8 pt-5" style={{ paddingTop: 'max(20px, env(safe-area-inset-top))' }}>
        <div className="seg" role="group" aria-label="Timer mode">
          {Object.entries(MODES).map(([k, v]) => (
            <button key={k} aria-pressed={f.mode === k} disabled={f.running} onClick={() => f.setMode(k)}>{v.label}</button>
          ))}
        </div>
        <button onClick={f.closeOverlay} className="ml-auto btn btn-outline btn-sm" aria-label="Close timer">
          <X size={16} /> <span className="hidden sm:inline">Close</span>
        </button>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8 -mt-6">
        {/* Task link */}
        <div className="relative text-center max-w-[560px] w-full">
          {f.taskTitle ? (
            <button onClick={() => setPicking(p => !p)} className="group inline-flex flex-col items-center">
              <span className="text-[13px] text-muted">Working on</span>
              <span className="font-serif text-[22px] md:text-[26px] leading-tight mt-1 group-hover:underline underline-offset-4 decoration-line">{f.taskTitle}</span>
            </button>
          ) : (
            <button onClick={() => setPicking(p => !p)} className="btn btn-quiet"><Link2 size={16} /> Link a task</button>
          )}
          {picking && (
            <div className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+10px)] z-10 w-[min(420px,90vw)] bg-surface rounded-[14px] shadow-pop p-2 text-left">
              <input autoFocus className="input mb-1" placeholder="Search open tasks…" value={q} onChange={e => setQ(e.target.value)} />
              <div className="max-h-[260px] overflow-y-auto">
                {f.taskId && (
                  <button className="w-full text-left px-3 h-10 rounded-[8px] text-[13.5px] text-muted hover:bg-sunken"
                    onClick={() => { f.linkTask(null, null); setPicking(false) }}>No task</button>
                )}
                {filtered.map(t => (
                  <button key={t.id} className="w-full flex items-center gap-2 text-left px-3 h-10 rounded-[8px] text-[13.5px] hover:bg-sunken"
                    onClick={() => { f.linkTask(t.id, t.title); setPicking(false); setQ('') }}>
                    <span className="flex-1 truncate">{t.title}</span>
                    {f.taskId === t.id && <Check size={15} className="text-accent" />}
                  </button>
                ))}
                {filtered.length === 0 && <p className="text-[13px] text-muted px-3 py-4">No open tasks match.</p>}
              </div>
            </div>
          )}
        </div>

        {/* Dial */}
        <div className="relative" style={{ width: size, height: size, maxWidth: '78vw', maxHeight: '78vw' }}>
          <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90" aria-hidden>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--c-line)" strokeWidth={stroke} />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={isFocus ? 'var(--c-accent)' : 'var(--c-good)'} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={circ - (pct / 100) * circ}
              style={{ transition: 'stroke-dashoffset 300ms linear' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-serif tnum text-[64px] md:text-[76px] leading-none tracking-[-0.02em]" role="timer" aria-live="off">
              {fmtClock(f.remaining)}
            </span>
            <span className="text-[14px] text-muted mt-3">
              {f.running ? (isFocus ? 'Stay with it' : 'Step away from the screen') : f.started ? 'Paused' : MODES[f.mode].label}
            </span>
          </div>
        </div>

        {/* Presets */}
        {!f.started && (
          <div className="flex gap-1.5" role="group" aria-label="Duration">
            {PRESETS.map(m => (
              <button key={m} className="pick" aria-pressed={Math.round(f.total / 60) === m} onClick={() => f.setMinutes(m)}>{m} min</button>
            ))}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-3">
          <button onClick={reset} disabled={!f.started} className="btn btn-outline btn-icon btn-lg w-11" aria-label="Reset"><RotateCcw size={18} /></button>
          <button data-autofocus onClick={() => (f.running ? f.pause() : f.start())} className="btn btn-primary btn-lg min-w-[160px]">
            {f.running ? <><Pause size={18} /> Pause</> : <><Play size={18} /> {f.started ? 'Resume' : 'Start'}</>}
          </button>
          <button onClick={f.skip} className="btn btn-outline btn-icon btn-lg w-11" aria-label={isFocus ? 'Skip to break' : 'Skip break'}><SkipForward size={18} /></button>
        </div>
        <p className="text-[12.5px] text-faint hidden md:block"><span className="kbd">Space</span> start or pause · <span className="kbd">Esc</span> close and keep running</p>
      </div>

      <footer className="px-6 pb-8 text-center text-[13.5px] text-muted" style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}>
        {f.focusCountToday > 0
          ? <>Today: {plural(f.focusCountToday, 'session')} · {fmtMinutes(f.focusMinutesToday)} focused</>
          : 'Your first session today starts the count.'}
      </footer>
    </div>,
    document.body
  )
}
