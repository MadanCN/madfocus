import React, { useState, useEffect, useRef } from 'react'
import { sb, dbRun } from '../lib/supabase'
import { useToast, PlusIcon } from '../components/ui'

const COLS = [
  { id: 'todo',        label: 'To Do',       color: '#c4c0ba' },
  { id: 'in_progress', label: 'In Progress', color: '#b8860b' },
  { id: 'in_review',   label: 'In Review',   color: '#2563eb' },
  { id: 'done',        label: 'Done',        color: '#2d5a3d' },
]

const PRIORITY_COLORS = { P1: '#c0392b', P2: '#b8860b', P3: '#2d5a3d', P4: '#c4c0ba' }

function today() { return new Date().toISOString().slice(0, 10) }
function uid()   { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

export default function Kanban() {
  const toast = useToast()
  const [tasks, setTasks]     = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding]   = useState(null)
  const [newTitle, setNewTitle] = useState('')
  const [dragging, setDragging] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const addInputRef = useRef(null)

  useEffect(() => {
    sb.from('tasks').select('*').then(({ data, error }) => {
      if (error) toast('Failed to load', 'error')
      else setTasks((data || []).map(r => ({
        id: r.id, title: r.title, priority: r.priority || 'P3',
        project: r.project, due: r.due,
        kanbanStatus: r.kanban_status || 'todo', done: r.done
      })))
      setLoading(false)
    })
  }, [])

  // ── FIX: use .update() not .upsert() for moves — avoids NOT NULL constraint errors ──
  async function moveTask(taskId, newStatus) {
    const t = tasks.find(x => x.id === taskId)
    if (!t) return
    const prev = { ...t }
    const updated = { ...t, kanbanStatus: newStatus, done: newStatus === 'done' }
    setTasks(p => p.map(x => x.id === taskId ? updated : x))
    try {
      await dbRun('Move task', () =>
        sb.from('tasks')
          .update({
            kanban_status: newStatus,
            done: newStatus === 'done',
            completed_at: newStatus === 'done' ? today() : null,
          })
          .eq('id', taskId)
      )
    } catch (e) {
      // Rollback optimistic update
      setTasks(p => p.map(x => x.id === taskId ? prev : x))
      toast('Move failed — ' + (e?.message || 'unknown error'), 'error')
    }
  }

  async function quickAdd(colId) {
    if (!newTitle.trim()) return
    const task = {
      id: uid(), title: newTitle.trim(), priority: 'P3',
      kanbanStatus: colId, done: colId === 'done',
      project: null, due: null,
    }
    setTasks(p => [...p, task])
    setAdding(null)
    setNewTitle('')
    try {
      await dbRun('Add task', () => sb.from('tasks').insert({
        id: task.id, title: task.title, priority: task.priority,
        kanban_status: colId, done: task.done,
        created_at: today(), completed_at: task.done ? today() : null,
        notes: '', dep_ids: [],
      }))
    } catch { toast('Add failed', 'error') }
  }

  // Focus input when adding opens
  useEffect(() => {
    if (adding && addInputRef.current) addInputRef.current.focus()
  }, [adding])

  // Drag handlers
  function onDragStart(e, taskId) {
    setDragging(taskId)
    e.dataTransfer.effectAllowed = 'move'
  }
  function onDragOver(e, colId) { e.preventDefault(); setDragOver(colId) }
  function onDragLeave()        { setDragOver(null) }
  function onDrop(e, colId) {
    e.preventDefault()
    if (dragging && dragging !== colId) moveTask(dragging, colId)
    setDragging(null)
    setDragOver(null)
  }
  function onDragEnd() { setDragging(null); setDragOver(null) }

  // Touch drag state for mobile
  const touchTask = useRef(null)
  const touchGhost = useRef(null)

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-muted text-[13px]">
      Loading…
    </div>
  )

  const totalDone = tasks.filter(t => t.kanbanStatus === 'done').length
  const total = tasks.length

  return (
    <div className="flex flex-col h-screen p-4 lg:p-9 pb-20 lg:pb-9">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="page-title">Kanban</h1>
          <p className="page-sub">
            {total > 0 ? `${totalDone} of ${total} tasks done` : 'Drag tasks across columns'}
          </p>
        </div>
        {total > 0 && (
          <div className="hidden sm:flex items-center gap-2">
            <div className="h-1.5 w-32 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{ width: `${Math.round((totalDone / total) * 100)}%` }}
              />
            </div>
            <span className="text-[11px] text-muted">{Math.round((totalDone / total) * 100)}%</span>
          </div>
        )}
      </div>

      {/* Board */}
      <div className="flex gap-3 lg:gap-4 flex-1 overflow-x-auto pb-2 min-h-0">
        {COLS.map(col => {
          const colTasks = tasks.filter(t => t.kanbanStatus === col.id)
          const isOver   = dragOver === col.id

          return (
            <div
              key={col.id}
              className={`flex flex-col w-[260px] lg:w-[280px] min-w-[220px] rounded-[10px] transition-all duration-150
                ${isOver ? 'bg-accent-light ring-2 ring-accent ring-offset-1' : 'bg-bg'}`}
              onDragOver={e => onDragOver(e, col.id)}
              onDragLeave={onDragLeave}
              onDrop={e => onDrop(e, col.id)}
            >
              {/* Column header */}
              <div className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.color }} />
                <span className="text-[13px] font-medium">{col.label}</span>
                <span className="ml-auto bg-border text-muted text-[11px] font-medium px-2 py-0.5 rounded-full">
                  {colTasks.length}
                </span>
              </div>

              {/* Task cards */}
              <div className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-2">
                {colTasks.length === 0 && !isOver && (
                  <div className="text-center py-6 text-faint text-[12px] border-2 border-dashed border-border rounded-[8px]">
                    Drop here
                  </div>
                )}

                {colTasks.map(t => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={e => onDragStart(e, t.id)}
                    onDragEnd={onDragEnd}
                    className={`bg-surface border border-border rounded-[8px] p-3 cursor-grab active:cursor-grabbing
                                hover:shadow-card hover:border-faint transition-all select-none
                                ${dragging === t.id ? 'opacity-40 scale-95' : ''}`}
                  >
                    <p className="text-[13px] font-medium mb-2 leading-snug">{t.title}</p>

                    <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                        style={{ background: `${PRIORITY_COLORS[t.priority]}18`, color: PRIORITY_COLORS[t.priority] }}
                      >
                        {t.priority}
                      </span>
                      {t.project && (
                        <span className="text-[10px] text-muted bg-border-light px-1.5 py-0.5 rounded truncate max-w-[80px]">
                          {t.project}
                        </span>
                      )}
                      {t.due && (
                        <span className={`text-[10px] ml-auto ${t.due < today() ? 'text-danger' : 'text-muted'}`}>
                          {new Date(t.due + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>

                    {/* Quick move buttons */}
                    <div className="flex gap-1">
                      {COLS.filter(c => c.id !== col.id).map(c => (
                        <button
                          key={c.id}
                          onClick={() => moveTask(t.id, c.id)}
                          title={`Move to ${c.label}`}
                          className="text-[10px] text-muted hover:text-text bg-bg hover:bg-border-light
                                     px-1.5 py-1 rounded transition-colors flex-1 truncate"
                        >
                          → {c.label.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Add card inline */}
                {adding === col.id ? (
                  <div className="bg-surface border border-accent rounded-[8px] p-2.5">
                    <input
                      ref={addInputRef}
                      className="form-input text-[13px] py-1.5 mb-2"
                      placeholder="Task title…"
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') quickAdd(col.id)
                        if (e.key === 'Escape') { setAdding(null); setNewTitle('') }
                      }}
                    />
                    <div className="flex gap-1.5">
                      <button className="btn btn-primary btn-sm flex-1" onClick={() => quickAdd(col.id)}>Add</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setAdding(null); setNewTitle('') }}>✕</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAdding(col.id); setNewTitle('') }}
                    className="flex items-center gap-1.5 text-[12px] text-muted hover:text-text
                               px-2 py-2 rounded-[7px] hover:bg-border-light transition-colors w-full"
                  >
                    <PlusIcon className="w-3.5 h-3.5" /> Add card
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
