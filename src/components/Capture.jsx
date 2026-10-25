import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, Flag, Hash, CornerDownLeft, ListChecks, StickyNote } from 'lucide-react'
import { usePresence, useLayer, useToast } from './ui'
import { parseTask } from '../lib/parse'
import { createTask } from '../lib/tasks'
import { sb, dbRun } from '../lib/supabase'
import { uid, nowIso, relDay, PRIORITIES } from '../lib/utils'
import { emit } from '../lib/bus'

export async function createNote({ title, body = '', folderId = null }) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const content = body ? body.split('\n').map(l => `<div>${esc(l) || '<br>'}</div>`).join('') : ''
  const note = {
    id: uid(), title: title || 'Untitled', content, tags: [], folder_id: folderId,
    pinned: false, archived: false, created_at: nowIso(), updated_at: nowIso(),
  }
  await dbRun('Create note', () => sb.from('notes').insert(note))
  emit('notes')
  return note
}

export default function Capture({ open, mode, setMode, onClose, onOpenTask }) {
  const [mounted, shown] = usePresence(open, 160)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [count, setCount] = useState(0)
  const inputRef = useRef(null)
  const toast = useToast()
  const navigate = useNavigate()
  useLayer(open, onClose)

  useEffect(() => {
    if (open) { setCount(0); setTimeout(() => inputRef.current?.focus(), 20) }
  }, [open, mode])

  const parsed = mode === 'task' ? parseTask(text) : null

  async function submit() {
    const raw = text.trim()
    if (!raw || busy) return
    setBusy(true)
    try {
      if (mode === 'task') {
        const p = parseTask(raw)
        const t = await createTask({ title: p.title || raw, due: p.due, priority: p.priority || 'P3', project: p.project || '' })
        setText(''); setCount(c => c + 1)
        toast(`Added “${t.title}”`, { action: { label: 'Open', onClick: () => onOpenTask(t.id) } })
      } else {
        const [first, ...rest] = raw.split('\n')
        const n = await createNote({ title: first.slice(0, 120), body: rest.join('\n').trim() })
        setText('')
        onClose()
        toast('Note saved', { action: { label: 'Open', onClick: () => navigate(`/notes?id=${n.id}`) } })
      }
    } catch {
      toast('Couldn’t save that. Check your connection and try again.', 'error')
    } finally { setBusy(false) }
  }

  function onKey(e) {
    if (e.key === 'Enter' && (mode === 'task' ? !e.shiftKey : (e.metaKey || e.ctrlKey))) { e.preventDefault(); submit() }
    if (e.key === 'Tab' && !text) { e.preventDefault(); setMode(mode === 'task' ? 'note' : 'task') }
  }

  if (!mounted) return null
  return createPortal(
    <div className="fixed inset-0 z-[1000]">
      <div className="scrim absolute inset-0" data-open={shown} onClick={onClose} style={{ background: 'color-mix(in srgb, var(--scrim) 60%, transparent)' }} />
      <div role="dialog" aria-modal="true" aria-label="Capture"
        className="pop pop-up absolute w-[min(640px,calc(100vw-24px))] bg-surface rounded-[18px] shadow-pop"
        style={{ bottom: 'calc(var(--dock-h) + 30px + env(safe-area-inset-bottom))', transformOrigin: 'bottom center', translate: '-50% 0', left: '50%' }}
        data-open={shown}>
        <div className="flex items-center gap-2 px-4 pt-3">
          <div className="seg" role="group" aria-label="Capture type">
            <button aria-pressed={mode === 'task'} onClick={() => setMode('task')}><span className="inline-flex items-center gap-1.5"><ListChecks size={14} /> Task</span></button>
            <button aria-pressed={mode === 'note'} onClick={() => setMode('note')}><span className="inline-flex items-center gap-1.5"><StickyNote size={14} /> Note</span></button>
          </div>
          {count > 0 && <span className="text-[12.5px] text-good font-medium ml-1">{count} added</span>}
          <span className="ml-auto hidden sm:flex items-center gap-1.5 text-[12px] text-faint">
            <span className="kbd">Tab</span> switch
          </span>
        </div>

        {mode === 'task' ? (
          <input ref={inputRef} value={text} onChange={e => setText(e.target.value)} onKeyDown={onKey}
            placeholder="Call Ravi tomorrow p1 #apollo"
            aria-label="Task"
            className="w-full bg-transparent outline-none px-4 pt-3 pb-2 text-[18px] font-medium placeholder:text-faint" />
        ) : (
          <textarea ref={inputRef} value={text} onChange={e => setText(e.target.value)} onKeyDown={onKey}
            placeholder={'First line becomes the title…\nKeep writing for the body.'}
            aria-label="Note" rows={4}
            className="w-full bg-transparent outline-none px-4 pt-3 pb-2 text-[16px] font-serif leading-relaxed resize-none placeholder:text-faint" />
        )}

        <div className="flex items-center gap-2 px-4 pb-3 pt-1 min-h-[44px] flex-wrap">
          {mode === 'task' && parsed && (
            <>
              {parsed.due && <span className="chip" style={{ background: 'var(--c-accent-soft)', color: 'var(--c-accent)' }}><CalendarDays size={13} /> {relDay(parsed.due)}</span>}
              {parsed.priority && <span className="chip" style={{ color: PRIORITIES[parsed.priority].color }}><Flag size={13} /> {PRIORITIES[parsed.priority].label}</span>}
              {parsed.project && <span className="chip"><Hash size={13} /> {parsed.project}</span>}
              {!parsed.due && !parsed.priority && !parsed.project && (
                <span className="text-[12.5px] text-faint">Try “today”, “fri”, “25 oct”, “p1”, “#project”</span>
              )}
            </>
          )}
          {mode === 'note' && <span className="text-[12.5px] text-faint">Saved to Notes, unfiled</span>}
          <button onClick={submit} disabled={!text.trim() || busy}
            className="btn btn-primary btn-sm ml-auto">
            {mode === 'task' ? 'Add task' : 'Save note'}
            <span className="inline-flex items-center opacity-70 text-[11px]">
              {mode === 'note' && <span className="mr-0.5">⌘</span>}<CornerDownLeft size={13} />
            </span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
