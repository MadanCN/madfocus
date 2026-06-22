import React, { useState, useEffect, useRef, useCallback } from 'react'
import { sb, dbRun } from '../../lib/supabase'
import { Confirm } from '../ui'

export default function NotesOverlay({ open, onClose, standalone }) {
  const [notes, setNotes]             = useState([])
  const [folders, setFolders]         = useState([])
  const [active, setActive]           = useState(null)
  const [search, setSearch]           = useState('')
  const [saving, setSaving]           = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeFolder, setActiveFolder] = useState(null) // null = All, 'pinned' = Pinned, 'archived' = Archived, folder id
  const [newFolderMode, setNewFolderMode] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [noteMenu, setNoteMenu]       = useState(null) // note id with open context menu

  const saveTimer      = useRef(null)
  const editorRef      = useRef(null)
  const titleInputRef  = useRef(null)
  const justCreated    = useRef(false)
  const activeRef      = useRef(active)

  useEffect(() => { activeRef.current = active }, [active])

  const isOpen = standalone || open

  useEffect(() => {
    if (!isOpen) return
    Promise.all([
      sb.from('notes').select('*').order('pinned', { ascending: false }).order('updated_at', { ascending: false }),
      sb.from('note_folders').select('*').order('sort_order', { ascending: true }),
    ]).then(([{ data: n }, { data: f }]) => {
      setNotes(n || [])
      setFolders(f || [])
    })
  }, [isOpen])

  const activeNote = notes.find(n => n.id === active) || null

  useEffect(() => {
    if (!editorRef.current) return
    editorRef.current.innerHTML = activeNote?.content || ''
    if (activeNote) lastSavedRef.current[activeNote.id] = activeNote.content || ''
  }, [activeNote?.id])

  const lastSavedRef = useRef({})

  useEffect(() => {
    if (!active || !titleInputRef.current) return
    if (justCreated.current) {
      justCreated.current = false
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [active])

  async function newNote(folderId = activeFolder === 'pinned' || activeFolder === 'archived' ? null : activeFolder) {
    const note = {
      id: crypto.randomUUID(),
      title: 'Untitled',
      content: '',
      tags: [],
      folder_id: typeof folderId === 'string' && folderId !== 'pinned' && folderId !== 'archived' ? folderId : null,
      pinned: false,
      archived: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    justCreated.current = true
    setNotes(prev => [note, ...prev])
    setActive(note.id)
    lastSavedRef.current[note.id] = ''
    await dbRun('Create note', () => sb.from('notes').insert(note))
  }

  const handleEditorInput = useCallback(() => {
    const el = editorRef.current
    if (!el || !activeRef.current) return
    const html = el.innerHTML
    const currentActive = activeRef.current
    lastSavedRef.current[currentActive] = html
    setNotes(prev => prev.map(n => n.id === currentActive ? { ...n, content: html, updated_at: new Date().toISOString() } : n))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (!activeRef.current) return
      setSaving(true)
      try {
        await dbRun('Save note', () => sb.from('notes').update({ content: html, updated_at: new Date().toISOString() }).eq('id', currentActive))
      } finally { setSaving(false) }
    }, 800)
  }, [])

  function handleTitleChange(e) {
    const val = e.target.value
    const currentActive = activeRef.current
    setNotes(prev => prev.map(n => n.id === currentActive ? { ...n, title: val, updated_at: new Date().toISOString() } : n))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (!currentActive) return
      setSaving(true)
      try {
        await dbRun('Save note', () => sb.from('notes').update({ title: val, updated_at: new Date().toISOString() }).eq('id', currentActive))
      } finally { setSaving(false) }
    }, 800)
  }

  async function deleteNote(id) {
    setNotes(prev => prev.filter(n => n.id !== id))
    if (active === id) setActive(null)
    setConfirmDelete(null)
    await dbRun('Delete note', () => sb.from('notes').delete().eq('id', id))
  }

  async function togglePin(id) {
    const note = notes.find(n => n.id === id)
    if (!note) return
    const pinned = !note.pinned
    setNotes(prev => prev.map(n => n.id === id ? { ...n, pinned } : n))
    setNoteMenu(null)
    await dbRun('Pin note', () => sb.from('notes').update({ pinned }).eq('id', id))
  }

  async function toggleArchive(id) {
    const note = notes.find(n => n.id === id)
    if (!note) return
    const archived = !note.archived
    setNotes(prev => prev.map(n => n.id === id ? { ...n, archived } : n))
    if (active === id) setActive(null)
    setNoteMenu(null)
    await dbRun('Archive note', () => sb.from('notes').update({ archived }).eq('id', id))
  }

  async function moveToFolder(noteId, folderId) {
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, folder_id: folderId } : n))
    setNoteMenu(null)
    await dbRun('Move note', () => sb.from('notes').update({ folder_id: folderId }).eq('id', noteId))
  }

  async function createFolder() {
    if (!newFolderName.trim()) return
    const folder = {
      id: crypto.randomUUID(),
      name: newFolderName.trim(),
      color: '#2d5a3d',
      sort_order: folders.length,
      created_at: new Date().toISOString(),
    }
    setFolders(prev => [...prev, folder])
    setNewFolderName('')
    setNewFolderMode(false)
    await dbRun('Create folder', () => sb.from('note_folders').insert(folder))
  }

  async function deleteFolder(id) {
    setFolders(prev => prev.filter(f => f.id !== id))
    setNotes(prev => prev.map(n => n.folder_id === id ? { ...n, folder_id: null } : n))
    await dbRun('Delete folder', () => sb.from('note_folders').delete().eq('id', id))
  }

  function execCmd(cmd, value = null) {
    document.execCommand(cmd, false, value)
    editorRef.current?.focus()
  }

  // Filter notes by active folder/view
  const visibleNotes = notes.filter(n => {
    if (activeFolder === 'archived') return n.archived
    if (n.archived) return false
    if (activeFolder === 'pinned') return n.pinned
    if (activeFolder === null) return true
    return n.folder_id === activeFolder
  }).filter(n => {
    if (!search) return true
    return n.title.toLowerCase().includes(search.toLowerCase()) || (n.content || '').toLowerCase().includes(search.toLowerCase())
  })

  const pinnedCount  = notes.filter(n => n.pinned && !n.archived).length
  const archivedCount = notes.filter(n => n.archived).length

  if (!isOpen) return null

  const inner = (
    <div
      className={`flex overflow-hidden ${standalone ? 'h-full' : 'rounded-[16px]'}`}
      style={{ background: 'var(--c-surface)' }}
      onClick={() => setNoteMenu(null)}
    >
      {/* ── Sidebar ── */}
      {sidebarOpen && (
        <div className="w-[240px] min-w-[240px] flex flex-col" style={{ borderRight: '1px solid var(--c-border)' }}>
          {/* Header */}
          <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--c-border-light)' }}>
            <h2 className="font-serif text-[18px]" style={{ color: 'var(--c-text)' }}>Notes</h2>
            <div className="flex items-center gap-1">
              <button onClick={() => setSidebarOpen(false)} className="px-1.5 py-1 text-[14px] rounded-[5px] transition-colors" style={{ color: 'var(--c-muted)' }} title="Collapse sidebar">‹</button>
              <button onClick={() => newNote()} className="btn btn-primary btn-sm btn-icon" title="New note"><PlusIcon /></button>
            </div>
          </div>

          {/* Search */}
          <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--c-border-light)' }}>
            <input
              className="form-input text-[12px] py-1.5"
              placeholder="Search notes…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Folder navigation */}
          <div className="px-2 py-2" style={{ borderBottom: '1px solid var(--c-border-light)' }}>
            <FolderBtn label="All Notes" count={notes.filter(n => !n.archived).length} active={activeFolder === null} onClick={() => setActiveFolder(null)} icon="📄" />
            {pinnedCount > 0 && (
              <FolderBtn label="Pinned" count={pinnedCount} active={activeFolder === 'pinned'} onClick={() => setActiveFolder('pinned')} icon="📌" />
            )}
            {folders.map(f => (
              <div key={f.id} className="group flex items-center">
                <FolderBtn label={f.name} count={notes.filter(n => n.folder_id === f.id && !n.archived).length} active={activeFolder === f.id} onClick={() => setActiveFolder(f.id)} icon="📁" />
                <button
                  onClick={() => deleteFolder(f.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all flex-shrink-0"
                  style={{ color: 'var(--c-faint)' }}
                  title="Delete folder"
                >×</button>
              </div>
            ))}
            {archivedCount > 0 && (
              <FolderBtn label="Archived" count={archivedCount} active={activeFolder === 'archived'} onClick={() => setActiveFolder('archived')} icon="🗄️" />
            )}

            {/* New folder */}
            {newFolderMode ? (
              <div className="flex gap-1 mt-1 px-1">
                <input
                  autoFocus
                  className="form-input text-[12px] py-1 flex-1"
                  placeholder="Folder name…"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setNewFolderMode(false) }}
                />
                <button onClick={createFolder} className="btn btn-primary btn-sm px-2 py-1">+</button>
              </div>
            ) : (
              <button
                onClick={() => setNewFolderMode(true)}
                className="w-full text-left px-2 py-1.5 text-[12px] rounded transition-colors mt-0.5"
                style={{ color: 'var(--c-faint)' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--c-accent)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--c-faint)' }}
              >
                + New folder
              </button>
            )}
          </div>

          {/* Note list */}
          <div className="flex-1 overflow-y-auto">
            {visibleNotes.length === 0 && (
              <div className="text-center py-10 text-[13px]" style={{ color: 'var(--c-faint)' }}>
                {search ? 'No results' : 'No notes yet'}
              </div>
            )}
            {visibleNotes.map(note => (
              <div key={note.id} className="relative group">
                <button
                  onClick={() => setActive(note.id)}
                  className="w-full text-left px-4 py-3 transition-colors"
                  style={{
                    borderBottom: '1px solid var(--c-border-light)',
                    background: active === note.id ? 'var(--c-accent-light)' : 'transparent',
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {note.pinned && <span className="text-[10px]">📌</span>}
                    <div className="text-[13px] font-medium truncate" style={{ color: active === note.id ? 'var(--c-accent)' : 'var(--c-text)' }}>
                      {note.title || 'Untitled'}
                    </div>
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--c-faint)' }}>
                    {new Date(note.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    {note.tags?.length > 0 && <span className="ml-2">{note.tags.map(t => `#${t}`).join(' ')}</span>}
                  </div>
                </button>
                {/* Note actions */}
                <button
                  onClick={e => { e.stopPropagation(); setNoteMenu(noteMenu === note.id ? null : note.id) }}
                  className="absolute right-2 top-3 opacity-0 group-hover:opacity-100 p-1 rounded-[5px] transition-all text-[14px]"
                  style={{ color: 'var(--c-muted)' }}
                >
                  ⋯
                </button>
                {noteMenu === note.id && (
                  <div
                    className="absolute right-2 top-8 z-20 rounded-[8px] py-1 shadow-lg w-[160px]"
                    style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
                    onClick={e => e.stopPropagation()}
                  >
                    <MenuAction label={note.pinned ? 'Unpin' : 'Pin note'} icon="📌" onClick={() => togglePin(note.id)} />
                    <MenuAction label={note.archived ? 'Unarchive' : 'Archive'} icon="🗄️" onClick={() => toggleArchive(note.id)} />
                    {folders.length > 0 && (
                      <>
                        <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--c-faint)' }}>Move to</div>
                        <MenuAction label="No folder" icon="📄" onClick={() => moveToFolder(note.id, null)} />
                        {folders.map(f => (
                          <MenuAction key={f.id} label={f.name} icon="📁" onClick={() => moveToFolder(note.id, f.id)} />
                        ))}
                      </>
                    )}
                    <div style={{ borderTop: '1px solid var(--c-border-light)', margin: '4px 0' }} />
                    <MenuAction label="Delete" icon="🗑️" danger onClick={() => { setNoteMenu(null); setConfirmDelete(note) }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Editor ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeNote ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-1 px-4 py-2 flex-wrap" style={{ borderBottom: '1px solid var(--c-border-light)' }}>
              {!sidebarOpen && (
                <>
                  <button onClick={() => setSidebarOpen(true)} className="px-1.5 py-1 text-[14px] rounded-[5px] transition-colors mr-1" style={{ color: 'var(--c-muted)' }} title="Expand sidebar">›</button>
                  <div className="w-px h-4 bg-border mx-1" />
                </>
              )}
              <ToolBtn onClick={() => execCmd('bold')}                title="Bold"><b>B</b></ToolBtn>
              <ToolBtn onClick={() => execCmd('italic')}              title="Italic"><i>I</i></ToolBtn>
              <ToolBtn onClick={() => execCmd('underline')}           title="Underline"><u>U</u></ToolBtn>
              <div className="w-px h-4 mx-1" style={{ background: 'var(--c-border)' }} />
              <ToolBtn onClick={() => execCmd('formatBlock', 'h2')}   title="Heading 2">H2</ToolBtn>
              <ToolBtn onClick={() => execCmd('formatBlock', 'h3')}   title="Heading 3">H3</ToolBtn>
              <ToolBtn onClick={() => execCmd('formatBlock', 'p')}    title="Paragraph">¶</ToolBtn>
              <div className="w-px h-4 mx-1" style={{ background: 'var(--c-border)' }} />
              <ToolBtn onClick={() => execCmd('insertUnorderedList')} title="Bullet list">• List</ToolBtn>
              <ToolBtn onClick={() => execCmd('insertOrderedList')}   title="Numbered list">1. List</ToolBtn>
              <div className="ml-auto flex items-center gap-2">
                {saving && <span className="text-[11px]" style={{ color: 'var(--c-accent)' }}>saving…</span>}
                {activeNote.pinned && <span className="text-[12px]" title="Pinned">📌</span>}
                <ToolBtn onClick={() => setConfirmDelete(activeNote)} title="Delete note" className="text-danger hover:bg-danger-light">
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
              className="px-6 pt-5 pb-2 font-serif font-normal bg-transparent outline-none border-none w-full"
              style={{ fontSize: 22, color: 'var(--c-text)' }}
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

            {/* Editor */}
            <div
              ref={editorRef}
              id="note-editor"
              contentEditable
              suppressContentEditableWarning
              dir="ltr"
              className="flex-1 px-6 py-4 outline-none overflow-y-auto text-[14px] leading-relaxed
                         [&_h2]:text-[20px] [&_h2]:font-serif [&_h2]:mb-2 [&_h2]:mt-4
                         [&_h3]:text-[16px] [&_h3]:font-medium [&_h3]:mb-1.5 [&_h3]:mt-3
                         [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:my-2
                         [&_ol]:list-decimal [&_ol]:ml-5 [&_ol]:my-2
                         [&_li]:my-0.5
                         empty:before:content-[attr(data-placeholder)] empty:before:text-faint"
              style={{ color: 'var(--c-text)' }}
              data-placeholder="Start writing…"
              onInput={handleEditorInput}
            />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="absolute left-3 top-3 px-1.5 py-1 text-[14px] rounded-[5px] transition-colors"
                style={{ color: 'var(--c-muted)' }}
                title="Expand sidebar"
              >›</button>
            )}
            <div style={{ color: 'var(--c-faint)', opacity: 0.3 }}>
              <NoteEmptyIcon className="w-12 h-12 mx-auto" />
            </div>
            <p className="text-[14px]" style={{ color: 'var(--c-muted)' }}>Select a note or create a new one</p>
            <button onClick={() => newNote()} className="btn btn-primary">
              <PlusIcon /> New note
            </button>
            {!standalone && (
              <button onClick={onClose} className="btn btn-ghost btn-sm absolute top-4 right-4">✕ Close</button>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <Confirm
        open={!!confirmDelete}
        title="Delete note?"
        body={`"${confirmDelete?.title || 'Untitled'}" will be permanently removed. This cannot be undone.`}
        okLabel="Delete"
        onOk={() => deleteNote(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )

  if (standalone) {
    return <div className="h-screen">{inner}</div>
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[900]" onClick={onClose} />
      <div className="fixed inset-4 z-[901] flex shadow-md overflow-hidden rounded-[16px]">
        {inner}
      </div>
    </>
  )
}

function FolderBtn({ label, count, active, onClick, icon }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-2 py-1.5 rounded-[6px] text-[12.5px] flex items-center gap-2 transition-all"
      style={{
        background: active ? 'var(--c-accent-light)' : 'transparent',
        color: active ? 'var(--c-accent)' : 'var(--c-muted)',
        fontWeight: active ? 500 : 400,
      }}
    >
      <span className="text-[13px]">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      <span className="text-[10px]" style={{ color: active ? 'var(--c-accent)' : 'var(--c-faint)' }}>{count}</span>
    </button>
  )
}

function MenuAction({ label, icon, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 transition-colors"
      style={{ color: danger ? 'var(--c-danger)' : 'var(--c-text)' }}
      onMouseEnter={e => { e.currentTarget.style.background = danger ? 'var(--c-danger-light)' : 'var(--c-border-light)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <span>{icon}</span> {label}
    </button>
  )
}

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
        <span key={t} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--c-border-light)', color: 'var(--c-muted)' }}>
          #{t}
          <button onClick={() => onChange(tags.filter(x => x !== t))} style={{ color: 'var(--c-faint)' }} onMouseEnter={e => { e.currentTarget.style.color = 'var(--c-danger)' }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--c-faint)' }}>×</button>
        </span>
      ))}
      <input
        className="text-[12px] outline-none bg-transparent min-w-[80px]"
        style={{ color: 'var(--c-muted)' }}
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
    <button onClick={onClick} title={title} className={`px-2 py-1 text-[12px] rounded-[5px] transition-colors ${className}`} style={{ color: 'var(--c-muted)' }}
      onMouseEnter={e => { if (!className.includes('danger')) { e.currentTarget.style.background = 'var(--c-border-light)'; e.currentTarget.style.color = 'var(--c-text)' } }}
      onMouseLeave={e => { if (!className.includes('danger')) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--c-muted)' } }}
    >
      {children}
    </button>
  )
}

function PlusIcon()       { return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> }
function TrashIcon(p)     { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg> }
function NoteEmptyIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> }
