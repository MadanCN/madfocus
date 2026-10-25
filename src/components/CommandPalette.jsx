import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, StickyNote, Timer, Pause, Sparkles, Moon, Sun, ListChecks, Target, BookOpen, CornerDownLeft } from 'lucide-react'
import { sb } from '../lib/supabase'
import { useLayer, useToast } from './ui'
import { SPACES } from '../lib/spaces'
import { useFocus } from '../contexts/FocusContext'
import { useTheme } from '../contexts/ThemeContext'
import { createTask } from '../lib/tasks'
import { parseTask } from '../lib/parse'
import { relDay } from '../lib/utils'

function score(str, q) {
  if (!q) return 1
  const s = str.toLowerCase(), qq = q.toLowerCase()
  if (s.startsWith(qq)) return 3
  if (s.includes(qq)) return 2
  let si = 0
  for (const ch of qq) { const i = s.indexOf(ch, si); if (i < 0) return 0; si = i + 1 }
  return 1
}

// Keyboard-first: opens and closes instantly, no animation.
export default function CommandPalette({ open, onClose, onCapture, onCoach, onOpenTask }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [data, setData] = useState({ tasks: [], goals: [], notes: [], books: [] })
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const navigate = useNavigate()
  const toast = useToast()
  const focus = useFocus()
  const { dark, toggle } = useTheme()
  useLayer(open, onClose)

  useEffect(() => {
    if (!open) return
    setQ(''); setSel(0)
    setTimeout(() => inputRef.current?.focus(), 0)
    Promise.all([
      sb.from('tasks').select('id,title,priority,due,done').eq('done', false).limit(300),
      sb.from('goals').select('id,title,status').limit(100),
      sb.from('notes').select('id,title,archived').eq('archived', false).order('updated_at', { ascending: false }).limit(200),
      sb.from('books').select('id,title,status').limit(300),
    ]).then(([t, g, n, b]) => setData({ tasks: t.data || [], goals: g.data || [], notes: n.data || [], books: b.data || [] }))
  }, [open])

  const items = useMemo(() => {
    const out = []
    const query = q.trim()
    const go = fn => () => { onClose(); fn() }

    let createItem = null
    if (query) {
      const p = parseTask(query)
      createItem = ({ group: 'Create', icon: Plus, label: `Add task “${p.title || query}”`, hint: p.due ? relDay(p.due) : null,
        run: async () => {
          onClose()
          try {
            const t = await createTask({ title: p.title || query, due: p.due, priority: p.priority || 'P3', project: p.project || '' })
            toast(`Added “${t.title}”`, { action: { label: 'Open', onClick: () => onOpenTask(t.id) } })
          } catch { toast('Couldn’t add the task.', 'error') }
        } })
    }
    // A strong match on an action or page wins Enter; otherwise typing a phrase creates a task.
    const strong = query && [
      'Capture a task', 'Capture a note', 'Start a focus session', 'Resume focus timer', 'Pause focus timer', 'Ask the coach',
      ...SPACES.map(s => s.label),
    ].some(l => score(l, query) >= 2)
    if (createItem && !strong) out.push(createItem)

    const actions = [
      { icon: Plus, label: 'Capture a task', hint: 'N', run: go(() => onCapture('task')) },
      { icon: StickyNote, label: 'Capture a note', run: go(() => onCapture('note')) },
      focus.running
        ? { icon: Pause, label: 'Pause focus timer', run: go(focus.pause) }
        : { icon: Timer, label: focus.started ? 'Resume focus timer' : 'Start a focus session', hint: 'F', run: go(() => { focus.start(); focus.openOverlay() }) },
      { icon: Sparkles, label: 'Ask the coach', hint: 'C', run: go(onCoach) },
      { icon: dark ? Sun : Moon, label: dark ? 'Switch to light appearance' : 'Switch to dark appearance', run: go(toggle) },
    ]
    const min = query ? 2 : 1
    actions.filter(a => score(a.label, query) >= min).forEach(a => out.push({ group: 'Actions', ...a }))

    SPACES.filter(s => score(s.label, query) >= min).forEach(s =>
      out.push({ group: 'Go to', icon: s.icon, label: s.label, hint: s.key, run: go(() => navigate(s.to)) }))
    if (createItem && strong) out.push(createItem)

    if (query) {
      const rank = (arr, key = 'title') => arr.map(x => [x, score(x[key] || '', query)]).filter(([, s]) => s > 1).sort((a, b) => b[1] - a[1]).map(([x]) => x)
      rank(data.tasks).slice(0, 6).forEach(t => out.push({ group: 'Tasks', icon: ListChecks, label: t.title, hint: t.due ? relDay(t.due) : null, run: go(() => onOpenTask(t.id)) }))
      rank(data.goals).slice(0, 4).forEach(g => out.push({ group: 'Goals', icon: Target, label: g.title, run: go(() => navigate(`/goals?id=${g.id}`)) }))
      rank(data.notes).slice(0, 5).forEach(n => out.push({ group: 'Notes', icon: StickyNote, label: n.title || 'Untitled', run: go(() => navigate(`/notes?id=${n.id}`)) }))
      rank(data.books).slice(0, 4).forEach(b => out.push({ group: 'Books', icon: BookOpen, label: b.title, run: go(() => navigate(`/library/book/${b.id}`)) }))
    }
    return out
  }, [q, data, focus.running, focus.started, dark])

  useEffect(() => { setSel(0) }, [q])
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); items[sel]?.run() }
  }

  if (!open) return null
  let lastGroup = null
  return createPortal(
    <div className="fixed inset-0 z-[1050] flex justify-center px-3" style={{ paddingTop: 'min(16vh, 140px)' }}>
      <div className="absolute inset-0" style={{ background: 'var(--scrim)' }} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Search and commands"
        className="relative w-full max-w-[620px] h-fit max-h-[70vh] flex flex-col bg-surface rounded-[18px] shadow-pop overflow-hidden">
        <div className="flex items-center gap-3 px-4 h-[58px] border-b border-line-soft">
          <Search size={18} className="text-faint flex-shrink-0" />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Search, jump, or type a task to add…"
            role="combobox" aria-expanded="true" aria-controls="cmd-list" aria-activedescendant={`cmd-${sel}`}
            className="flex-1 bg-transparent outline-none text-[16px] placeholder:text-faint" />
          <span className="kbd">Esc</span>
        </div>
        <div ref={listRef} id="cmd-list" role="listbox" className="overflow-y-auto p-2">
          {items.length === 0 && <p className="text-center text-[13.5px] text-muted py-10">Nothing matches “{q}”.</p>}
          {items.map((it, i) => {
            const head = it.group !== lastGroup ? (lastGroup = it.group) : null
            const Icon = it.icon
            return (
              <React.Fragment key={i}>
                {head && <p className="px-3 pt-2.5 pb-1 text-[12px] font-semibold text-faint">{head}</p>}
                <button id={`cmd-${i}`} data-idx={i} role="option" aria-selected={i === sel}
                  onMouseMove={() => setSel(i)} onClick={it.run}
                  className="w-full flex items-center gap-3 px-3 h-11 rounded-[10px] text-left text-[14px]"
                  style={{ background: i === sel ? 'var(--c-sunken)' : 'transparent' }}>
                  <Icon size={17} className="flex-shrink-0" style={{ color: i === sel ? 'var(--c-accent)' : 'var(--c-faint)' }} />
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.hint && <span className="text-[12px] text-faint">{it.hint}</span>}
                  {i === sel && <CornerDownLeft size={14} className="text-faint" />}
                </button>
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </div>,
    document.body
  )
}
