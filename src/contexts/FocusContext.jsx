import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { sb, dbRun } from '../lib/supabase'
import { uid, today, nowIso } from '../lib/utils'
import { emit } from '../lib/bus'

export const MODES = {
  focus:       { label: 'Focus',       minutes: 25 },
  short_break: { label: 'Short break', minutes: 5 },
  long_break:  { label: 'Long break',  minutes: 15 },
}

const KEY = 'mf-focus'
const FocusCtx = createContext(null)
export const useFocus = () => useContext(FocusCtx)

// One timer for the whole app. It stores an absolute end time so it stays
// accurate in background tabs and survives a page refresh.
function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null } catch { return null }
}

let focusDefault = MODES.focus.minutes
const minutesFor = mode => (mode === 'focus' ? focusDefault : MODES[mode].minutes)
const blank = mode => ({
  mode, total: minutesFor(mode) * 60, remaining: minutesFor(mode) * 60,
  endAt: null, running: false, taskId: null, taskTitle: null,
})

export function FocusProvider({ children, defaultMinutes = 25 }) {
  focusDefault = defaultMinutes
  const [state, setState] = useState(() => load() || blank('focus'))

  // A new default length applies right away if the timer hasn't been started
  useEffect(() => {
    setState(s => (s.mode === 'focus' && !s.running && s.remaining === s.total && s.total !== defaultMinutes * 60)
      ? { ...s, total: defaultMinutes * 60, remaining: defaultMinutes * 60 } : s)
  }, [defaultMinutes])
  const [now, setNow] = useState(Date.now())
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [sessions, setSessions] = useState([])
  const completing = useRef(false)

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {} }, [state])

  useEffect(() => {
    sb.from('pomodoro_sessions').select('*').eq('date', today()).order('created_at', { ascending: false })
      .then(({ data }) => setSessions(data || []))
  }, [])

  useEffect(() => {
    if (!state.running) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [state.running])

  const remaining = state.running ? Math.max(0, (state.endAt - now) / 1000) : state.remaining

  const complete = useCallback(async s => {
    if (completing.current) return
    completing.current = true
    const session = {
      id: uid(), task_id: s.taskId || null, duration: Math.round(s.total / 60),
      type: s.mode, completed: true, date: today(), created_at: nowIso(),
    }
    setSessions(p => [session, ...p])
    setState({ ...blank(s.mode === 'focus' ? 'short_break' : 'focus'), taskId: s.taskId, taskTitle: s.taskTitle })
    try { await dbRun('Save focus session', () => sb.from('pomodoro_sessions').insert(session)) } catch {}
    emit('focus', session)
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(s.mode === 'focus' ? 'Focus session done' : 'Break is over', {
          body: s.mode === 'focus' ? 'Take five. You earned it.' : 'Ready for the next block?',
        })
      }
      chime()
    } catch {}
    completing.current = false
  }, [])

  useEffect(() => {
    if (state.running && remaining <= 0) complete(state)
  }, [remaining, state, complete])

  const start = useCallback((opts = {}) => {
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission() } catch {}
    setState(s => {
      const base = opts.mode && opts.mode !== s.mode ? blank(opts.mode) : s
      const total = opts.minutes ? opts.minutes * 60 : base.total
      const rem = opts.minutes ? total : base.remaining
      return {
        ...base, total, remaining: rem, running: true, endAt: Date.now() + rem * 1000,
        taskId: opts.taskId !== undefined ? opts.taskId : s.taskId,
        taskTitle: opts.taskTitle !== undefined ? opts.taskTitle : s.taskTitle,
      }
    })
    setNow(Date.now())
  }, [])

  const pause = useCallback(() => {
    setState(s => s.running ? { ...s, running: false, remaining: Math.max(0, (s.endAt - Date.now()) / 1000), endAt: null } : s)
  }, [])

  const reset = useCallback(() => setState(s => ({ ...blank(s.mode), taskId: s.taskId, taskTitle: s.taskTitle })), [])
  const setMode = useCallback(mode => setState(s => ({ ...blank(mode), taskId: s.taskId, taskTitle: s.taskTitle })), [])
  const setMinutes = useCallback(min => setState(s => s.running ? s : { ...s, total: min * 60, remaining: min * 60 }), [])
  const linkTask = useCallback((taskId, taskTitle) => setState(s => ({ ...s, taskId, taskTitle })), [])
  const skip = useCallback(() => setState(s => ({ ...blank(s.mode === 'focus' ? 'short_break' : 'focus'), taskId: s.taskId, taskTitle: s.taskTitle })), [])

  const focusMinutesToday = sessions.filter(s => s.type === 'focus' && s.completed).reduce((a, s) => a + (s.duration || 0), 0)
  const focusCountToday = sessions.filter(s => s.type === 'focus' && s.completed).length
  const started = state.running || state.remaining < state.total

  return (
    <FocusCtx.Provider value={{
      ...state, remaining, started, sessions, focusMinutesToday, focusCountToday,
      start, pause, reset, setMode, setMinutes, linkTask, skip,
      overlayOpen, openOverlay: () => setOverlayOpen(true), closeOverlay: () => setOverlayOpen(false),
    }}>
      {children}
    </FocusCtx.Provider>
  )
}

function chime() {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return
  const ctx = new Ctx()
  ;[0, 0.18].forEach((delay, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.type = 'sine'; o.frequency.value = i ? 880 : 660
    g.gain.setValueAtTime(0.0001, ctx.currentTime + delay)
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + delay + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.6)
    o.connect(g).connect(ctx.destination)
    o.start(ctx.currentTime + delay); o.stop(ctx.currentTime + delay + 0.65)
  })
  setTimeout(() => ctx.close(), 1200)
}
