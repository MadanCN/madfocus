import React, { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useToast } from './ui'

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function today() { return new Date().toISOString().slice(0, 10) }

const QUICK_CHIPS = [
  'What should I focus on?',
  'Plan my week',
  'Review my progress',
  'Beat procrastination',
]

async function buildContext() {
  const d = today()
  const [tasksRes, habitsRes, goalsRes, logsRes] = await Promise.all([
    sb.from('tasks').select('title,priority,done,due').eq('done', false).limit(15),
    sb.from('habits').select('id,name').limit(20),
    sb.from('goals').select('title,current,target').eq('status', 'active').limit(8),
    sb.from('habit_logs').select('habit_id,date').gte('date', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)),
  ])
  const habits = (habitsRes.data || []).map(h => ({
    name: h.name,
    doneToday: (logsRes.data || []).some(l => l.habit_id === h.id && l.date === d),
  }))
  return {
    date: d,
    pendingTasks: (tasksRes.data || []).map(t => ({ title: t.title, priority: t.priority, due: t.due })),
    habits,
    goals: (goalsRes.data || []).map(g => ({ title: g.title, pct: g.target > 0 ? Math.round((g.current / g.target) * 100) : 0 })),
  }
}

async function parseAndCreateTasks(reply, toast) {
  const lines = reply.split('\n').filter(l => l.match(/^[-•*\d][\.\):\s].{3,}/))
  if (!lines.length) return 0
  const tasks = lines.slice(0, 8).map(line => {
    const title = line.replace(/^[-•*\d][\.\):\s]+/, '').trim()
    let priority = 'P3'
    if (/urgent|critical|asap/i.test(title)) priority = 'P1'
    else if (/important|high/i.test(title)) priority = 'P2'
    return { id: uid(), title, priority, due: today(), done: false, notes: '', project: '', type: '', dep_ids: [], kanban_status: 'todo', created_at: today() }
  })
  try {
    await sb.from('tasks').insert(tasks)
    toast(`${tasks.length} task${tasks.length !== 1 ? 's' : ''} added ✓`)
    return tasks.length
  } catch { toast('Could not create tasks', 'error'); return 0 }
}

function MsgContent({ text }) {
  return (
    <div className="space-y-0.5">
      {text.split('\n').map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: 5 }} />
        const parts = line.split(/(\*\*[^*]+\*\*)/)
        return (
          <div key={i} className="leading-relaxed">
            {parts.map((p, j) =>
              p.startsWith('**') && p.endsWith('**')
                ? <strong key={j} className="font-semibold">{p.slice(2, -2)}</strong>
                : <span key={j}>{p}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function AIPanel({ onClose }) {
  const toast = useToast()
  const [msgs, setMsgs]     = useState([])
  const [input, setInput]   = useState('')
  const [busy, setBusy]     = useState(false)
  const [ctx, setCtx]       = useState(null)
  const bottomRef           = useRef(null)
  const inputRef            = useRef(null)

  useEffect(() => {
    buildContext().then(c => {
      setCtx(c)
      const inc = c.habits.filter(h => !h.doneToday).length
      const greeting = `Hi! You have **${c.pendingTasks.length} pending tasks** and **${inc} habit${inc !== 1 ? 's' : ''}** left today. What are you planning to focus on?`
      setMsgs([{ role: 'assistant', text: greeting, id: uid() }])
    })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, busy])

  async function send(text) {
    const q = (text || input).trim()
    if (!q || busy) return
    setInput('')
    const userMsg = { role: 'user', text: q, id: uid() }
    setMsgs(p => [...p, userMsg])
    setBusy(true)
    try {
      const context = ctx || await buildContext()
      const res  = await fetch('/api/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, context }),
      })
      const data  = await res.json()
      const reply = data.reply || 'Sorry, something went wrong.'
      setMsgs(p => [...p, { role: 'assistant', text: reply, id: uid() }])
      const hasList = reply.split('\n').some(l => l.match(/^[-•*\d][\.\):\s].{3,}/))
      if (hasList) {
        setMsgs(p => [...p, { role: 'action', text: reply, id: uid() }])
      }
    } catch {
      setMsgs(p => [...p, { role: 'assistant', text: "Can't reach AI right now.", id: uid() }])
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  async function doCreateTasks(reply, msgId) {
    const n = await parseAndCreateTasks(reply, toast)
    if (n > 0) setMsgs(p => p.map(m => m.id === msgId ? { ...m, done: n } : m))
  }

  // Live stats strip
  const tasksLeft  = ctx?.pendingTasks?.length ?? '—'
  const habitsLeft = ctx?.habits?.filter(h => !h.doneToday).length ?? '—'

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--c-surface)' }}>

      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: '1px solid var(--c-border)' }}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--c-accent-light)', border: '1px solid var(--c-accent-mid)' }}>
          <SparkleIcon className="w-3.5 h-3.5" style={{ color: 'var(--c-accent)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold leading-none" style={{ color: 'var(--c-text)' }}>AI Coach</p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--c-faint)' }}>Claude · Always here</p>
        </div>
        {/* Stats */}
        <div className="flex items-center gap-2">
          <Stat label="tasks" value={tasksLeft} />
          <Stat label="habits" value={habitsLeft} />
        </div>
        <button onClick={onClose} className="p-1 rounded-[5px] transition-colors flex-shrink-0" style={{ color: 'var(--c-faint)' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--c-text)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--c-faint)'}>
          <ChevronRightIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3 min-h-0">
        {msgs.map(msg => {
          if (msg.role === 'action') {
            if (msg.done) return (
              <div key={msg.id} className="flex justify-center">
                <span className="text-[11px] px-3 py-1 rounded-full" style={{ background: 'var(--c-accent-light)', color: 'var(--c-accent)' }}>
                  ✓ {msg.done} tasks created
                </span>
              </div>
            )
            return (
              <div key={msg.id} className="flex justify-center">
                <button onClick={() => doCreateTasks(msg.text, msg.id)}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-[7px] font-medium transition-all"
                  style={{ background: 'var(--c-accent-light)', color: 'var(--c-accent)', border: '1px solid var(--c-accent-mid)' }}>
                  <TaskIcon className="w-3 h-3" /> Add tasks to list
                </button>
              </div>
            )
          }
          const isUser = msg.role === 'user'
          return (
            <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} items-end gap-1.5`}>
              {!isUser && (
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5" style={{ background: 'var(--c-accent-light)' }}>
                  <SparkleIcon className="w-2.5 h-2.5" style={{ color: 'var(--c-accent)' }} />
                </div>
              )}
              <div
                className="max-w-[84%] rounded-[12px] px-3 py-2 text-[12.5px]"
                style={isUser
                  ? { background: 'var(--c-accent)', color: 'var(--c-accent-fg)', borderBottomRightRadius: 3 }
                  : { background: 'var(--c-surface-2)', color: 'var(--c-text)', border: '1px solid var(--c-border)', borderBottomLeftRadius: 3 }
                }
              >
                <MsgContent text={msg.text} />
              </div>
            </div>
          )
        })}

        {busy && (
          <div className="flex items-end gap-1.5">
            <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--c-accent-light)' }}>
              <SparkleIcon className="w-2.5 h-2.5" style={{ color: 'var(--c-accent)' }} />
            </div>
            <div className="px-3 py-2 rounded-[12px]" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
              <div className="flex gap-1">
                {[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full dot-bounce" style={{ background: 'var(--c-accent)', animationDelay: `${i*0.2}s` }} />)}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick chips */}
      {msgs.length <= 1 && !busy && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5">
          {QUICK_CHIPS.map(c => (
            <button key={c} onClick={() => send(c)}
              className="text-[11px] px-2.5 py-1 rounded-full transition-all"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--c-accent)'; e.currentTarget.style.color = 'var(--c-accent)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.color = 'var(--c-muted)' }}>
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 px-3 pb-4 pt-2" style={{ borderTop: '1px solid var(--c-border)' }}>
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            rows={1}
            className="flex-1 px-3 py-2.5 rounded-[10px] text-[12.5px] resize-none outline-none"
            style={{ background: 'var(--c-bg)', border: '1.5px solid var(--c-border)', color: 'var(--c-text)', minHeight: 40, maxHeight: 120 }}
            placeholder="Ask me anything…"
            value={input}
            onChange={e => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            onFocus={e => { e.target.style.borderColor = 'var(--c-accent)' }}
            onBlur={e => { e.target.style.borderColor = 'var(--c-border)' }}
            disabled={busy}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || busy}
            className="w-9 h-9 rounded-[8px] flex items-center justify-center flex-shrink-0 transition-all"
            style={{ background: input.trim() && !busy ? 'var(--c-accent)' : 'var(--c-border)', color: input.trim() && !busy ? 'var(--c-accent-fg)' : 'var(--c-faint)' }}>
            <SendIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="text-center">
      <p className="text-[13px] font-semibold leading-none" style={{ color: 'var(--c-text)' }}>{value}</p>
      <p className="text-[9px] uppercase tracking-wide mt-0.5" style={{ color: 'var(--c-faint)' }}>{label}</p>
    </div>
  )
}

function SparkleIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg> }
function SendIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> }
function TaskIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg> }
function ChevronRightIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg> }
