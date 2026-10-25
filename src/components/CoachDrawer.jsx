import React, { useEffect, useRef, useState } from 'react'
import { ArrowUp, Sparkles, ListPlus, Check } from 'lucide-react'
import { Sheet, useToast } from './ui'
import { sb, dbRun } from '../lib/supabase'
import { uid, today, addDays, streakFrom } from '../lib/utils'
import { patchToRow } from '../lib/tasks'
import { emit } from '../lib/bus'

const STARTERS = [
  'What should I do first today?',
  'Plan my week around my goals',
  'Which habits am I slipping on?',
  'I’m procrastinating. Help me start.',
]

async function buildContext() {
  const d = today()
  const since = addDays(d, -30)
  const [tasks, habits, goals, logs, journal, writing] = await Promise.all([
    sb.from('tasks').select('title,priority,due,project').eq('done', false).limit(25),
    sb.from('habits').select('id,name,track_type,archived'),
    sb.from('goals').select('title,current,target,due,status').eq('status', 'active').limit(10),
    sb.from('habit_logs').select('habit_id,date,duration_min').gte('date', since),
    sb.from('journal_entries').select('date,mood,emotions,tomorrow_priority').order('date', { ascending: false }).limit(7),
    sb.from('writing_logs').select('date,chapters,word_count').order('date', { ascending: false }).limit(30),
  ])
  const L = logs.data || []
  return {
    date: d,
    pendingTasks: (tasks.data || []).map(t => ({ title: t.title, priority: t.priority, due: t.due, project: t.project })),
    habits: (habits.data || []).filter(h => !h.archived).map(h => {
      const hl = L.filter(l => l.habit_id === h.id)
      return { name: h.name, doneToday: hl.some(l => l.date === d), streak: streakFrom(hl.map(l => l.date)), minutesLast30: hl.reduce((a, l) => a + (l.duration_min || 0), 0) }
    }),
    goals: (goals.data || []).map(g => ({ title: g.title, progressPct: g.target > 0 ? Math.round((g.current / g.target) * 100) : 0, due: g.due })),
    recentJournal: journal.data || [],
    writing: writing.data || [],
  }
}

const LIST_LINE = /^\s*(?:[-•*]|\d+[.)])\s+(.{3,})$/

function extractTasks(reply) {
  return reply.split('\n').map(l => l.match(LIST_LINE)?.[1]).filter(Boolean)
    .map(s => s.replace(/\*\*/g, '').replace(/\s*[—–-]\s*\d+\s*(?:min|mins|minutes|h|hrs?)\b.*$/i, '').trim())
    .filter(s => s.length > 2).slice(0, 8)
}

function Rich({ text }) {
  return (
    <div className="flex flex-col gap-1">
      {text.split('\n').map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1.5" />
        const parts = line.split(/(\*\*[^*]+\*\*)/)
        return (
          <p key={i} className="leading-relaxed">
            {parts.map((p, j) => p.startsWith('**') && p.endsWith('**') ? <strong key={j} className="font-semibold">{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>)}
          </p>
        )
      })}
    </div>
  )
}

export default function CoachDrawer({ open, onClose }) {
  const toast = useToast()
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [ctx, setCtx] = useState(null)
  const endRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    buildContext().then(c => {
      setCtx(c)
      if (msgs.length === 0) {
        const left = c.habits.filter(h => !h.doneToday).length
        setMsgs([{ id: uid(), role: 'assistant', text: `You have **${c.pendingTasks.length} open tasks** and **${left} habit${left === 1 ? '' : 's'}** left today. What do you want to get done?` }])
      }
    }).catch(() => {})
  }, [open])

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [msgs, busy])

  async function send(text) {
    const q = (text ?? input).trim()
    if (!q || busy) return
    setInput('')
    setMsgs(p => [...p, { id: uid(), role: 'user', text: q }])
    setBusy(true)
    try {
      const context = ctx || await buildContext()
      const res = await fetch('/api/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, context }),
      })
      const data = await res.json()
      const reply = data.reply || 'I couldn’t come up with an answer. Try asking another way.'
      setMsgs(p => [...p, { id: uid(), role: 'assistant', text: reply, suggestions: extractTasks(reply) }])
    } catch {
      setMsgs(p => [...p, { id: uid(), role: 'assistant', text: 'I can’t reach the coach right now. Check your connection and try again.' }])
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  async function addTasks(msgId, titles) {
    const rows = titles.map(title => ({
      id: uid(), created_at: today(),
      ...patchToRow({ title, priority: 'P3', due: today(), done: false, notes: '', depIds: [], status: 'todo' }),
    }))
    try {
      await dbRun('Coach tasks', () => sb.from('tasks').insert(rows))
      emit('tasks')
      setMsgs(p => p.map(m => m.id === msgId ? { ...m, added: rows.length } : m))
      toast(`Added ${rows.length} task${rows.length === 1 ? '' : 's'} for today`, {
        action: { label: 'Undo', onClick: async () => {
          await dbRun('Undo coach tasks', () => sb.from('tasks').delete().in('id', rows.map(r => r.id)))
          emit('tasks')
          setMsgs(p => p.map(m => m.id === msgId ? { ...m, added: 0 } : m))
        } },
      })
    } catch { toast('Couldn’t add those tasks.', 'error') }
  }

  return (
    <Sheet open={open} onClose={onClose} width={440} label="Coach"
      title={<span className="inline-flex items-center gap-2 text-ink font-semibold text-[15px]"><Sparkles size={16} className="text-accent" /> Coach</span>}
      footer={
        <div className="flex items-end gap-2">
          <textarea ref={inputRef} rows={1} value={input} placeholder="Ask about your day, week or goals…"
            onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px' }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            className="input min-h-[44px] max-h-[140px] resize-none py-[11px]" aria-label="Message the coach" />
          <button onClick={() => send()} disabled={!input.trim() || busy} aria-label="Send"
            className="btn btn-primary btn-icon h-11 w-11 flex-shrink-0"><ArrowUp size={18} /></button>
        </div>
      }>
      <div className="flex flex-col gap-4 pt-1 text-[14px]">
        {msgs.map(m => m.role === 'user' ? (
          <div key={m.id} className="self-end max-w-[85%] px-3.5 py-2.5 rounded-[14px] rounded-br-[4px] bg-accent text-accent-fg">{m.text}</div>
        ) : (
          <div key={m.id} className="max-w-[94%]">
            <Rich text={m.text} />
            {m.suggestions?.length > 0 && (
              <div className="mt-3 rounded-[12px] bg-sunken p-3">
                {m.added ? (
                  <p className="flex items-center gap-2 text-[13px] text-good font-medium"><Check size={15} /> {m.added} added to today</p>
                ) : (
                  <>
                    <p className="text-[12.5px] text-muted mb-2">Add these as tasks for today?</p>
                    <ul className="flex flex-col gap-1 mb-3">
                      {m.suggestions.map((s, i) => <li key={i} className="text-[13px] flex gap-2"><span className="text-faint">•</span>{s}</li>)}
                    </ul>
                    <button onClick={() => addTasks(m.id, m.suggestions)} className="btn btn-outline btn-sm"><ListPlus size={15} /> Add {m.suggestions.length} tasks</button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex gap-1.5 py-2" aria-label="Coach is thinking">
            {[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-faint pulse-live" style={{ animationDelay: `${i * 0.2}s` }} />)}
          </div>
        )}
        {msgs.length <= 1 && !busy && (
          <div className="flex flex-col gap-1.5 mt-2">
            {STARTERS.map(s => (
              <button key={s} onClick={() => send(s)} className="text-left text-[13.5px] px-3.5 h-10 rounded-[10px] shadow-[inset_0_0_0_1px_var(--c-line)] hover:bg-sunken text-muted hover:text-ink">{s}</button>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>
    </Sheet>
  )
}
