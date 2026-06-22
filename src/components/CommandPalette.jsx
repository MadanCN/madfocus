import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { sb } from '../lib/supabase'

const PAGES = [
  { label: 'Home',     to: '/',        icon: HomeIcon,    hint: 'Dashboard & overview' },
  { label: 'Tasks',    to: '/tasks',   icon: TaskIcon,    hint: 'Manage your tasks' },
  { label: 'Kanban',   to: '/kanban',  icon: KanbanIcon,  hint: 'Board view' },
  { label: 'Habits',   to: '/habits',  icon: ClockIcon,   hint: 'Daily habits & streaks' },
  { label: 'Goals',    to: '/goals',   icon: TargetIcon,  hint: 'Goals & milestones' },
  { label: 'Journal',  to: '/journal', icon: BookOpenIcon, hint: 'Daily journaling' },
  { label: 'Notes',    to: '/notes',   icon: FileIcon,    hint: 'Quick notes' },
  { label: 'Library',  to: '/library', icon: LibraryIcon, hint: 'Knowledge base' },
  { label: 'Pomodoro', to: '/pomodoro', icon: TimerIcon,  hint: 'Focus timer' },
]

function fuzzy(str, query) {
  if (!query) return true
  const s = str.toLowerCase(), q = query.toLowerCase()
  let si = 0
  for (let i = 0; i < q.length; i++) {
    const idx = s.indexOf(q[i], si)
    if (idx === -1) return false
    si = idx + 1
  }
  return true
}

export default function CommandPalette({ open, onClose }) {
  const [query, setQuery]     = useState('')
  const [tasks, setTasks]     = useState([])
  const [goals, setGoals]     = useState([])
  const [selected, setSelected] = useState(0)
  const inputRef              = useRef(null)
  const navigate              = useNavigate()

  // Load data once when opened
  useEffect(() => {
    if (!open) return
    setQuery(''); setSelected(0)
    Promise.all([
      sb.from('tasks').select('id,title,priority').eq('done', false).limit(20),
      sb.from('goals').select('id,title').eq('status', 'active').limit(10),
    ]).then(([{ data: t }, { data: g }]) => {
      setTasks(t || []); setGoals(g || [])
    })
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  // Build result groups
  const filteredPages = PAGES.filter(p => fuzzy(p.label + ' ' + p.hint, query))
  const filteredTasks = tasks.filter(t => fuzzy(t.title, query)).slice(0, 5)
  const filteredGoals = goals.filter(g => fuzzy(g.title, query)).slice(0, 4)

  const allItems = [
    ...filteredPages.map(p => ({ type: 'page', ...p })),
    ...filteredTasks.map(t => ({ type: 'task', label: t.title, id: t.id, priority: t.priority, to: '/tasks', icon: TaskIcon })),
    ...filteredGoals.map(g => ({ type: 'goal', label: g.title, id: g.id, to: '/goals', icon: TargetIcon })),
  ]

  function doSelect(item) {
    navigate(item.to)
    onClose()
  }

  useEffect(() => {
    setSelected(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const handler = e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, allItems.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
      else if (e.key === 'Enter') { e.preventDefault(); if (allItems[selected]) doSelect(allItems[selected]) }
      else if (e.key === 'Escape') { onClose() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, allItems, selected])

  if (!open) return null

  let globalIdx = 0
  function ResultItem({ item }) {
    const idx = globalIdx++
    const isActive = idx === selected
    return (
      <button
        onMouseEnter={() => setSelected(idx)}
        onClick={() => doSelect(item)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-left transition-all"
        style={{
          background: isActive ? 'var(--c-accent-light)' : 'transparent',
          border: isActive ? '1px solid var(--c-accent-mid)' : '1px solid transparent',
        }}
      >
        <item.icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? 'var(--c-accent)' : 'var(--c-faint)' }} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium truncate" style={{ color: isActive ? 'var(--c-accent)' : 'var(--c-text)' }}>{item.label}</p>
          {item.hint && <p className="text-[11px] truncate" style={{ color: 'var(--c-faint)' }}>{item.hint}</p>}
        </div>
        {item.priority && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'var(--c-border-light)', color: 'var(--c-muted)' }}>{item.priority}</span>
        )}
        {item.type === 'task' && (
          <span className="text-[10px] uppercase tracking-wide flex-shrink-0" style={{ color: 'var(--c-faint)' }}>task</span>
        )}
        {item.type === 'goal' && (
          <span className="text-[10px] uppercase tracking-wide flex-shrink-0" style={{ color: 'var(--c-faint)' }}>goal</span>
        )}
      </button>
    )
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[500]"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Palette */}
      <div
        className="fixed left-1/2 top-[18%] -translate-x-1/2 z-[501] w-[600px] max-w-[96vw] rounded-[14px] overflow-hidden shadow-2xl"
        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid var(--c-border)' }}>
          <SearchIcon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--c-faint)' }} />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent outline-none text-[14px]"
            style={{ color: 'var(--c-text)' }}
            placeholder="Search pages, tasks, goals…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--c-border-light)', color: 'var(--c-faint)', border: '1px solid var(--c-border)' }}>ESC</kbd>
        </div>

        {/* Results */}
        <div className="p-2 max-h-[400px] overflow-y-auto">
          {allItems.length === 0 && (
            <p className="text-center py-8 text-[13px]" style={{ color: 'var(--c-faint)' }}>No results for "{query}"</p>
          )}

          {filteredPages.length > 0 && (
            <Group label="Navigate">
              {filteredPages.map(item => <ResultItem key={item.to} item={{ ...item, type: 'page' }} />)}
            </Group>
          )}
          {filteredTasks.length > 0 && (
            <Group label="Tasks">
              {filteredTasks.map(t => <ResultItem key={t.id} item={{ type: 'task', label: t.title, id: t.id, priority: t.priority, to: '/tasks', icon: TaskIcon }} />)}
            </Group>
          )}
          {filteredGoals.length > 0 && (
            <Group label="Goals">
              {filteredGoals.map(g => <ResultItem key={g.id} item={{ type: 'goal', label: g.title, id: g.id, to: '/goals', icon: TargetIcon }} />)}
            </Group>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2.5" style={{ borderTop: '1px solid var(--c-border)' }}>
          {[['↑↓', 'navigate'], ['↵', 'select'], ['esc', 'close']].map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <kbd className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--c-border-light)', color: 'var(--c-faint)', border: '1px solid var(--c-border)' }}>{k}</kbd>
              <span className="text-[11px]" style={{ color: 'var(--c-faint)' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function Group({ label, children }) {
  return (
    <div className="mb-2">
      <p className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5" style={{ color: 'var(--c-faint)' }}>{label}</p>
      {children}
    </div>
  )
}

function HomeIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> }
function TaskIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg> }
function KanbanIcon(p)  { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="5" height="15" rx="1"/><rect x="10" y="3" width="5" height="10" rx="1"/><rect x="17" y="3" width="5" height="12" rx="1"/></svg> }
function ClockIcon(p)   { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> }
function TargetIcon(p)  { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> }
function BookOpenIcon(p){ return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> }
function FileIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> }
function LibraryIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> }
function TimerIcon(p)   { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3l-1.5 2.5"/><path d="M19 3l1.5 2.5"/><path d="M9 3h6"/></svg> }
function SearchIcon(p)  { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> }
