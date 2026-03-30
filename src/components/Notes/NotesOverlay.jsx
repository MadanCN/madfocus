import React, { useState, useEffect, useRef, useCallback } from 'react'
import { sb, dbRun } from '../../lib/supabase'

export default function NotesOverlay({ open, onClose, standalone }) {
  const [notes, setNotes]         = useState([])
  const [active, setActive]       = useState(null)
  const [search, setSearch]       = useState('')
  const [saving, setSaving]       = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const saveTimer                 = useRef(null)
  const editorRef                 = useRef(null)
  const titleInputRef             = useRef(null)
  const justCreated               = useRef(false)
  const lastSavedContent          = useRef({})
  const activeRef                 = useRef(active)

  // Keep activeRef in sync so the debounce timer always has fresh active ID
  useEffect(() => { activeRef.current = active }, [active])

  // In standalone mode (route /notes), always "open"
  const isOpen = standalone || open

  // Load all notes
  useEffect(() => {
    if (!isOpen) return
    sb.from('notes').select('*').order('updated_at', { ascending: false })
      .then(({ data }) => { if (data) setNotes(data) })
  }, [isOpen])

  const activeNote = notes.find(n => n.id === active) || null

  // Sync editor content on note switch — always update innerHTML when the active note changes
  useEffect(() => {
    if (!editorRef.current) return
    editorRef.current.innerHTML = activeNote?.content || ''
    if (activeNote) {
      lastSavedContent.current[activeNote.id] = activeNote.content || ''
    }
  }, [activeNote?.id]) // only runs on note switch

  // Auto-focus title when a new note is created
  useEffect(() => {
    if (!active || !titleInputRef.current) return
    if (justCreated.current) {
      justCreated.current = false
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [active])

  // Create new note
  async function newNote() {
    const note = {
      id: crypto.randomUUID(),
      title: 'Untitled',
      content: '',
      tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    justCreated.current = true
    setNotes(prev => [note, ...prev])
    setActive(note.id)
    lastSavedContent.current[note.id] = ''
    await dbRun('Create note', () => sb.from('notes').insert(note))
  }

  // Auto-save on content change (debounced).
  // Uses activeRef so this callback never goes stale and doesn't need recreating.
  const handleEditorInput = useCallback(() => {
    const el = editorRef.current
    if (!el || !activeRef.current) return
    const html = el.innerHTML
    const currentActive = activeRef.current
    lastSavedContent.current[currentActive] = html

    setNotes(prev => prev.map(n =>
      n.id === currentActive ? { ...n, content: html, updated_at: new Date().toISOString() } : n
    ))

    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (!activeRef.current) return
      setSaving(true)
      try {
        await dbRun('Save note', () =>
          sb.from('notes')
            .update({ content: html, updated_at: new Date().toISOString() })
            .eq('id', currentActive)
        )
      } finally { setSaving(false) }
    }, 800)
  }, []) // stable — reads active via ref, no stale-closure risk

  function handleTitleChange(e) {
    const val = e.target.value
    const currentActive = activeRef.current
    setNotes(prev => prev.map(n =>
      n.id === currentActive ? { ...n, title: val, updated_at: new Date().toISOString() } : n
    ))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (!currentActive) return
      setSaving(true)
      try {
        await dbRun('Save note', () =>
          sb.from('notes')
            .update({ title: val, updated_at: new Date().toISOString() })
            .eq('id', currentActive)
        )
      } finally { setSaving(false) }
    }, 800)
  }

  async function deleteNote(id) {
    setNotes(prev => prev.filter(n => n.id !== id))
    if (active === id) setActive(null)
    await dbRun('Delete note', () => sb.from('notes').delete().eq('id', id))
  }

  function execCmd(cmd, value = null) {
    document.execCommand(cmd, false, value)
    editorRef.current?.focus()
  }

  const filtered = notes.filter(n =>
    !search ||
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    (n.content || '').toLowerCase().includes(search.toLowerCase())
  )

  if (!isOpen) return null

  const inner = (
    <div className={`flex bg-surface overflow-hidden ${standalone ? 'h-full' : 'rounded-[16px]'}`}
      style={{ boxShadow: standalone ? 'none' : undefined }}>

      {/* ── Note list sidebar ── */}
      {sidebarOpen && (
        <div className="w-[240px] min-w-[240px] border-r border-border flex flex-col">
          <div className="p-4 border-b border-border-light flex items-center justify-between">
            <h2 className="font-serif text-[18px]">Notes</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSidebarOpen(false)}
                className="px-1.5 py-1 text-[14px] rounded-[5px] text-muted hover:bg-border-light hover:text-text transition-colors"
                title="Collapse sidebar"
              >
                ‹
              </button>
              <button onClick={newNote} className="btn btn-primary btn-sm btn-icon" title="New note">
                <PlusIcon />
              </button>
            </div>
          </div>

          <div className="px-3 py-2 border-b border-border-light">
            <input
              className="form-input text-[12px] py-1.5"
              placeholder="Search notes…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="text-center py-10 text-faint text-[13px]">
                {search ? 'No results' : 'No notes yet'}
              </div>
            )}
            {filtered.map(note => (
              <button
                key={note.id}
                onClick={() => setActive(note.id)}
                className={`w-full text-left px-4 py-3 border-b border-border-light transition-colors
                  ${active === note.id ? 'bg-accent-light' : 'hover:bg-bg'}`}
              >
                <div className={`text-[13px] font-medium truncate ${active === note.id ? 'text-accent' : 'text-text'}`}>
                  {note.title || 'Untitled'}
                </div>
                <div className="text-[11px] text-faint mt-0.5">
                  {new Date(note.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Editor ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeNote ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-1 px-4 py-2 border-b border-border-light flex-wrap">
              {!sidebarOpen && (
                <>
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="px-1.5 py-1 text-[14px] rounded-[5px] text-muted hover:bg-border-light hover:text-text transition-colors mr-1"
                    title="Expand sidebar"
                  >
                    ›
                  </button>
                  <div className="w-px h-4 bg-border mx-1" />
                </>
              )}
              <ToolBtn onClick={() => execCmd('bold')}                title="Bold"><b>B</b></ToolBtn>
              <ToolBtn onClick={() => execCmd('italic')}              title="Italic"><i>I</i></ToolBtn>
              <ToolBtn onClick={() => execCmd('underline')}           title="Underline"><u>U</u></ToolBtn>
              <div className="w-px h-4 bg-border mx-1" />
              <ToolBtn onClick={() => execCmd('formatBlock', 'h2')}   title="Heading 2">H2</ToolBtn>
              <ToolBtn onClick={() => execCmd('formatBlock', 'h3')}   title="Heading 3">H3</ToolBtn>
              <ToolBtn onClick={() => execCmd('formatBlock', 'p')}    title="Paragraph">¶</ToolBtn>
              <div className="w-px h-4 bg-border mx-1" />
              <ToolBtn onClick={() => execCmd('insertUnorderedList')} title="Bullet list">• List</ToolBtn>
              <ToolBtn onClick={() => execCmd('insertOrderedList')}   title="Numbered list">1. List</ToolBtn>
              <div className="ml-auto flex items-center gap-2">
                {saving && <span className="text-[11px] text-accent">saving…</span>}
                <ToolBtn onClick={() => deleteNote(active)} title="Delete note" className="text-danger hover:bg-danger-light">
                  <TrashIcon className="w-3.5 h-3.5" />
                </ToolBtn>
                {!standalone && (
                  <ToolBtn onClick={onClose} title="Close">✕</ToolBtn>
                )}
              </div>
            </div>

            {/* Title */}
            <input
              ref={titleInputRef}
              className="px-6 pt-5 pb-2 text-[22px] font-serif font-normal bg-transparent
                         outline-none border-none text-text placeholder:text-faint w-full"
              placeholder="Note title…"
              value={activeNote.title}
              onChange={handleTitleChange}
              dir="ltr"
            />

            {/* Tags */}
            <TagInput
              tags={activeNote.tags || []}
              onChange={tags => {
                setNotes(prev => prev.map(n => n.id === active ? { ...n, tags } : n))
                dbRun('Save tags', () => sb.from('notes').update({ tags }).eq('id', active))
              }}
            />

            {/* Rich text body */}
            <div
              ref={editorRef}
              id="note-editor"
              contentEditable
              suppressContentEditableWarning
              dir="ltr"
              className="flex-1 px-6 py-4 outline-none overflow-y-auto text-[14px]
                         leading-relaxed text-text
                         [&_h2]:text-[20px] [&_h2]:font-serif [&_h2]:mb-2 [&_h2]:mt-4
                         [&_h3]:text-[16px] [&_h3]:font-medium [&_h3]:mb-1.5 [&_h3]:mt-3
                         [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:my-2
                         [&_ol]:list-decimal [&_ol]:ml-5 [&_ol]:my-2
                         [&_li]:my-0.5
                         [&_img]:max-w-full [&_img]:rounded-[8px] [&_img]:my-3
                         empty:before:content-[attr(data-placeholder)] empty:before:text-faint"
              data-placeholder="Start writing…"
              onInput={handleEditorInput}
            />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="absolute left-3 top-3 px-1.5 py-1 text-[14px] rounded-[5px] text-muted hover:bg-border-light hover:text-text transition-colors"
                title="Expand sidebar"
              >
                ›
              </button>
            )}
            <div className="text-faint opacity-30">
              <NoteEmptyIcon className="w-12 h-12 mx-auto" />
            </div>
            <p className="text-muted text-[14px]">Select a note or create a new one</p>
            <button onClick={newNote} className="btn btn-primary">
              <PlusIcon /> New note
            </button>
            {!standalone && (
              <button onClick={onClose} className="btn btn-ghost btn-sm absolute top-4 right-4">✕ Close</button>
            )}
          </div>
        )}
      </div>
    </div>
  )

  if (standalone) {
    return <div className="h-screen">{inner}</div>
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[900]" onClick={onClose} />
      <div className="fixed inset-4 z-[901] flex shadow-md overflow-hidden rounded-[16px]">
        {inner}
      </div>
    </>
  )
}

// ── Tag input ──
function TagInput({ tags, onChange }) {
  const [input, setInput] = useState('')
  function add(e) {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault()
      if (!tags.includes(input.trim())) onChange([...tags, input.trim()])
      setInput('')
    }
  }
  return (
    <div className="flex flex-wrap gap-1 px-6 pb-2 items-center">
      {tags.map(t => (
        <span key={t} className="inline-flex items-center gap-1 bg-border-light text-muted text-[11px] px-2 py-0.5 rounded-full">
          #{t}
          <button onClick={() => onChange(tags.filter(x => x !== t))} className="text-faint hover:text-danger">×</button>
        </span>
      ))}
      <input
        className="text-[12px] outline-none bg-transparent text-muted placeholder:text-faint min-w-[80px]"
        placeholder="+ add tag"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={add}
      />
    </div>
  )
}

function ToolBtn({ onClick, title, children, className = '' }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-2 py-1 text-[12px] rounded-[5px] text-muted hover:bg-border-light hover:text-text transition-colors ${className}`}
    >
      {children}
    </button>
  )
}

function PlusIcon()       { return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> }
function TrashIcon(p)     { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg> }
function NoteEmptyIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> }
