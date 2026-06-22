import React, { useState, useEffect, useRef } from 'react'
import { sb, dbRun } from '../lib/supabase'
import { useToast } from '../components/ui'

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function today() { return new Date().toISOString().slice(0, 10) }

const DAILY_PROMPT = "What are you planning to do today? Tell me and I'll help turn it into an organized task list with priorities and time estimates."

const QUICK_REPLIES = [
  'What should I focus on first?',
  'Help me plan my week',
  'Review my habits progress',
  'What goals need attention?',
  'Suggest a daily routine',
  'Help me beat procrastination',
]

async function buildContext() {
  const d = today()
  const [tasksRes, habitsRes, goalsRes, logsRes, journalRes] = await Promise.all([
    sb.from('tasks').select('title,priority,done,due').eq('done', false).limit(20),
    sb.from('habits').select('id,name,track_type').eq('archived', false),
    sb.from('goals').select('title,status,current,target').eq('status', 'active').limit(10),
    sb.from('habit_logs').select('habit_id,date,duration_min').gte('date', new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)),
    sb.from('journal_entries').select('date,mood,emotions').order('date', { ascending: false }).limit(7),
  ])

  const habits  = habitsRes.data  || []
  const logs    = logsRes.data    || []

  const habitStats = habits.map(h => {
    const hLogs = logs.filter(l => l.habit_id === h.id)
    const doneToday = hLogs.some(l => l.date === d)
    let streak = 0
    const cur = new Date()
    const dateset = new Set(hLogs.map(l => l.date))
    let dd = new Date(cur)
    while (dateset.has(dd.toISOString().slice(0, 10))) { streak++; dd.setDate(dd.getDate() - 1) }
    return { name: h.name, doneToday, streak }
  })

  const goals = (goalsRes.data || []).map(g => ({
    title: g.title,
    progress: g.target > 0 ? Math.round((g.current / g.target) * 100) : 0,
  }))

  return {
    date: d,
    pendingTasks: (tasksRes.data || []).slice(0, 15).map(t => ({ title: t.title, priority: t.priority, due: t.due })),
    habits: habitStats,
    goals,
    recentMoods: (journalRes.data || []).map(j => ({ date: j.date, mood: j.mood, emotions: j.emotions })),
  }
}

async function parseAndCreateTasks(reply, toast) {
  const lines = reply.split('\n').filter(l => l.match(/^[-•*\d]+[\.\)]\s+.+/) || l.match(/^\d+\.\s+.+/))
  if (lines.length === 0) return 0

  const tasks = lines.slice(0, 10).map(line => {
    const title = line.replace(/^[-•*\d]+[\.\)]\s+/, '').trim()
    let priority = 'P3'
    if (/urgent|critical|asap|p1/i.test(title)) priority = 'P1'
    else if (/important|high|p2/i.test(title)) priority = 'P2'
    else if (/low|minor|p4/i.test(title)) priority = 'P4'
    return { id: uid(), title, priority, due: today(), done: false, notes: '', project: '', type: '', dep_ids: [], kanban_status: 'todo', created_at: today() }
  })

  try {
    await sb.from('tasks').insert(tasks)
    toast(`${tasks.length} task${tasks.length !== 1 ? 's' : ''} created ✓`)
    return tasks.length
  } catch {
    toast('Could not create tasks', 'error')
    return 0
  }
}

export default function AICoach() {
  const toast = useToast()
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [context, setContext]   = useState(null)
  const chatEndRef              = useRef(null)
  const inputRef                = useRef(null)

  // Load context and send daily prompt on first load
  useEffect(() => {
    buildContext().then(ctx => {
      setContext(ctx)
      const incompleteHabits = ctx.habits.filter(h => !h.doneToday).length
      const pendingCount = ctx.pendingTasks.length
      const greeting = `Hey! I'm your AI productivity coach. You have **${pendingCount} pending tasks** and **${incompleteHabits} habits** left today.\n\n${DAILY_PROMPT}`
      setMessages([{ role: 'assistant', text: greeting, id: uid() }])
    })
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text) {
    const q = (text || input).trim()
    if (!q || loading) return
    setInput('')
    const userMsg = { role: 'user', text: q, id: uid() }
    setMessages(p => [...p, userMsg])
    setLoading(true)

    try {
      const ctx = context || await buildContext()
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, context: ctx }),
      })
      const data = await res.json()
      const reply = data.reply || 'Sorry, I had trouble responding.'
      setMessages(p => [...p, { role: 'assistant', text: reply, id: uid() }])

      // Auto-detect if reply contains a task list and offer to create them
      const hasTaskList = reply.split('\n').some(l => l.match(/^[-•*\d]+[\.\)]\s+.{3,}/))
      if (hasTaskList) {
        setMessages(p => [...p, {
          role: 'action',
          text: reply,
          id: uid(),
          action: 'create_tasks',
        }])
      }
    } catch {
      setMessages(p => [...p, { role: 'assistant', text: "Couldn't reach the AI assistant. Check your connection.", id: uid() }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  async function handleCreateTasks(reply, msgId) {
    const count = await parseAndCreateTasks(reply, toast)
    if (count > 0) {
      setMessages(p => p.map(m => m.id === msgId ? { ...m, tasksCreated: count } : m))
    }
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--c-bg)' }}>
      {/* Header */}
      <div
        className="flex-shrink-0 px-6 py-4 flex items-center gap-4"
        style={{ background: 'var(--c-surface)', borderBottom: '1px solid var(--c-border)' }}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--c-accent-light)', border: '1px solid var(--c-accent-mid)' }}
        >
          <SparkleIcon className="w-4 h-4" style={{ color: 'var(--c-accent)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-medium text-[15px]" style={{ color: 'var(--c-text)' }}>AI Coach</h1>
          <p className="text-[11px]" style={{ color: 'var(--c-muted)' }}>Powered by Claude · Your personal productivity partner</p>
        </div>
        {context && (
          <div className="flex gap-3 text-[11px]" style={{ color: 'var(--c-faint)' }}>
            <span>{context.pendingTasks.length} tasks</span>
            <span>{context.habits.filter(h => !h.doneToday).length} habits left</span>
            <span>{context.goals.length} goals</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6" style={{ maxWidth: 760, width: '100%', margin: '0 auto' }}>
        <div className="flex flex-col gap-4">
          {messages.map(msg => {
            if (msg.role === 'action') {
              if (msg.tasksCreated) {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <span className="text-[12px] px-3 py-1.5 rounded-full" style={{ background: 'var(--c-accent-light)', color: 'var(--c-accent)' }}>
                      ✓ {msg.tasksCreated} tasks created
                    </span>
                  </div>
                )
              }
              return (
                <div key={msg.id} className="flex justify-center">
                  <button
                    onClick={() => handleCreateTasks(msg.text, msg.id)}
                    className="flex items-center gap-2 text-[12px] px-4 py-2 rounded-[8px] font-medium transition-all"
                    style={{ background: 'var(--c-accent-light)', color: 'var(--c-accent)', border: '1px solid var(--c-accent-mid)' }}
                  >
                    <TaskIcon className="w-3.5 h-3.5" />
                    Add these tasks to my list
                  </button>
                </div>
              )
            }

            const isUser = msg.role === 'user'
            return (
              <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} items-end gap-2`}>
                {!isUser && (
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mb-1"
                    style={{ background: 'var(--c-accent-light)' }}
                  >
                    <SparkleIcon className="w-3.5 h-3.5" style={{ color: 'var(--c-accent)' }} />
                  </div>
                )}
                <div
                  className="max-w-[78%] rounded-[14px] px-4 py-3 text-[13.5px] leading-relaxed"
                  style={isUser
                    ? { background: 'var(--c-accent)', color: '#fff', borderBottomRightRadius: 4 }
                    : { background: 'var(--c-surface)', color: 'var(--c-text)', border: '1px solid var(--c-border)', borderBottomLeftRadius: 4 }
                  }
                >
                  <MessageContent text={msg.text} />
                </div>
              </div>
            )
          })}

          {loading && (
            <div className="flex items-end gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--c-accent-light)' }}>
                <SparkleIcon className="w-3.5 h-3.5" style={{ color: 'var(--c-accent)' }} />
              </div>
              <div className="px-4 py-3 rounded-[14px]" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <span key={i} className="w-2 h-2 rounded-full dot-bounce" style={{ background: 'var(--c-accent)', animationDelay: `${i * 0.2}s` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Quick replies */}
      {messages.length <= 1 && !loading && (
        <div className="px-4 pb-3 flex flex-wrap gap-2 justify-center" style={{ maxWidth: 760, width: '100%', margin: '0 auto' }}>
          {QUICK_REPLIES.map(r => (
            <button
              key={r}
              onClick={() => send(r)}
              className="text-[12px] px-3 py-1.5 rounded-full transition-all"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--c-accent)'; e.currentTarget.style.color = 'var(--c-accent)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.color = 'var(--c-muted)' }}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div
        className="flex-shrink-0 px-4 pb-5 pt-3"
        style={{ background: 'var(--c-surface)', borderTop: '1px solid var(--c-border)', maxWidth: 760, width: '100%', margin: '0 auto' }}
      >
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            className="flex-1 px-4 py-3 rounded-[12px] text-[13.5px] resize-none outline-none"
            style={{
              background: 'var(--c-bg)',
              border: '1.5px solid var(--c-border)',
              color: 'var(--c-text)',
              minHeight: 48,
              maxHeight: 160,
            }}
            placeholder="Ask anything, or tell me your plan for today…"
            value={input}
            rows={1}
            onChange={e => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            }}
            disabled={loading}
            onFocus={e => { e.target.style.borderColor = 'var(--c-accent)' }}
            onBlur={e => { e.target.style.borderColor = 'var(--c-border)' }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className="w-11 h-11 rounded-[10px] flex items-center justify-center flex-shrink-0 transition-all"
            style={{
              background: input.trim() && !loading ? 'var(--c-accent)' : 'var(--c-border)',
              color: '#fff',
              cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
            }}
          >
            <SendIcon className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10.5px] mt-2 text-center" style={{ color: 'var(--c-faint)' }}>
          Press Enter to send · Shift+Enter for newline · AI can create tasks from your response
        </p>
      </div>
    </div>
  )
}

// Render markdown-lite: **bold**, numbered/bullet lists, line breaks
function MessageContent({ text }) {
  const lines = text.split('\n')
  return (
    <div>
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: 8 }} />
        // Bold
        const parts = line.split(/(\*\*[^*]+\*\*)/)
        return (
          <div key={i} className={i > 0 ? 'mt-1' : ''}>
            {parts.map((p, j) =>
              p.startsWith('**') && p.endsWith('**')
                ? <strong key={j}>{p.slice(2, -2)}</strong>
                : <span key={j}>{p}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SparkleIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg> }
function SendIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> }
function TaskIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg> }
