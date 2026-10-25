import React, { useState, useEffect, useRef, useCallback } from 'react'
import { sb, dbRun } from '../../lib/supabase'
import { Confirm, useToast } from '../ui'

// ── helpers ────────────────────────────────────────────────────
function uid() { return crypto.randomUUID() }
function now() { return new Date().toISOString() }

export default function NotesOverlay({ open, onClose, standalone }) {
  const toast = useToast()

  // ── core state ──────────────────────────────────────────────
  const [notes, setNotes]         = useState([])
  const [folders, setFolders]     = useState([])
  const [active, setActive]       = useState(null)
  const [search, setSearch]       = useState('')
  const [saving, setSaving]       = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // ── tree state ──────────────────────────────────────────────
  const [expanded, setExpanded]   = useState(new Set()) // folder ids (+ 'unfiled' + 'archived')
  const [newFolderMode, setNewFolderMode] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [editFolderName, setEditFolderName] = useState(null) // folder id being renamed
  const [renameVal, setRenameVal]           = useState('')

  // ── drag state ──────────────────────────────────────────────
  const [dragNote, setDragNote]   = useState(null)      // note id being dragged
  const [dragOver, setDragOver]   = useState(null)      // 'unfiled' | folderId | null

  // ── confirmation state ───────────────────────────────────────
  const [confirmNote, setConfirmNote]     = useState(null)
  const [confirmFolder, setConfirmFolder] = useState(null)
  const [noteMenu, setNoteMenu]           = useState(null)

  // ── refs ────────────────────────────────────────────────────
  const saveTimer     = useRef(null)
  const editorRef     = useRef(null)
  const titleRef      = useRef(null)
  const justCreated   = useRef(false)
  const activeRef     = useRef(active)
  const lastSaved     = useRef({})

  useEffect(() => { activeRef.current = active }, [active])

  const isOpen = standalone || open

  // ── load ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    Promise.all([
      sb.from('notes').select('*').order('pinned', { ascending: false }).order('updated_at', { ascending: false }),
      sb.from('note_folders').select('*').order('sort_order', { ascending: true }),
    ]).then(([{ data: n }, { data: f }]) => {
      const flds = f || []
      setNotes(n || [])
      setFolders(flds)
      // Default: expand all folders
      setExpanded(new Set(['unfiled', ...flds.map(x => x.id)]))
    })
  }, [isOpen])

  // ── editor sync ─────────────────────────────────────────────
  const activeNote = notes.find(n => n.id === active) || null

  useEffect(() => {
    if (!editorRef.current) return
    editorRef.current.innerHTML = activeNote?.content || ''
    if (activeNote) lastSaved.current[activeNote.id] = activeNote.content || ''
  }, [activeNote?.id])

  useEffect(() => {
    if (!active || !titleRef.current) return
    if (justCreated.current) {
      justCreated.current = false
      titleRef.current.focus()
      titleRef.current.select()
    }
  }, [active])

  // ── CRUD operations ─────────────────────────────────────────
  async function newNote(folderId = null) {
    const note = {
      id: uid(), title: 'Untitled', content: '', tags: [],
      folder_id: folderId, pinned: false, archived: false,
      created_at: now(), updated_at: now(),
    }
    justCreated.current = true
    setNotes(p => [note, ...p])
    setActive(note.id)
    lastSaved.current[note.id] = ''
    // Auto-expand the target folder
    if (folderId) setExpanded(p => new Set([...p, folderId]))
    else setExpanded(p => new Set([...p, 'unfiled']))
    await dbRun('Create note', () => sb.from('notes').insert(note))
  }

  const handleEditorInput = useCallback(() => {
    const el = editorRef.current
    if (!el || !activeRef.current) return
    const html = el.innerHTML
    const id = activeRef.current
    lastSaved.current[id] = html
    setNotes(p => p.map(n => n.id === id ? { ...n, content: html, updated_at: now() } : n))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (!activeRef.current) return
      setSaving(true)
      try { await dbRun('Save', () => sb.from('notes').update({ content: html, updated_at: now() }).eq('id', id)) }
      finally { setSaving(false) }
    }, 800)
  }, [])

  function handleTitleChange(e) {
    const val = e.target.value
    const id = activeRef.current
    setNotes(p => p.map(n => n.id === id ? { ...n, title: val, updated_at: now() } : n))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (!id) return
      setSaving(true)
      try { await dbRun('Title', () => sb.from('notes').update({ title: val, updated_at: now() }).eq('id', id)) }
      finally { setSaving(false) }
    }, 800)
  }

  async function deleteNote(id) {
    setNotes(p => p.filter(n => n.id !== id))
    if (active === id) setActive(null)
    setConfirmNote(null)
    await dbRun('Delete note', () => sb.from('notes').delete().eq('id', id))
  }

  async function togglePin(id) {
    const note = notes.find(n => n.id === id); if (!note) return
    const pinned = !note.pinned
    setNotes(p => p.map(n => n.id === id ? { ...n, pinned } : n))
    setNoteMenu(null)
    await dbRun('Pin', () => sb.from('notes').update({ pinned }).eq('id', id))
  }

  async function toggleArchive(id) {
    const note = notes.find(n => n.id === id); if (!note) return
    const archived = !note.archived
    setNotes(p => p.map(n => n.id === id ? { ...n, archived } : n))
    if (active === id) setActive(null)
    setNoteMenu(null)
    await dbRun('Archive', () => sb.from('notes').update({ archived }).eq('id', id))
  }

  async function moveToFolder(noteId, folderId) {
    setNotes(p => p.map(n => n.id === noteId ? { ...n, folder_id: folderId } : n))
    setNoteMenu(null)
    await dbRun('Move', () => sb.from('notes').update({ folder_id: folderId }).eq('id', noteId))
  }

  async function createFolder() {
    if (!newFolderName.trim()) return
    const folder = {
      id: uid(), name: newFolderName.trim(),
      sort_order: folders.length, created_at: now(),
    }
    setFolders(p => [...p, folder])
    setExpanded(p => new Set([...p, folder.id]))
    setNewFolderName(''); setNewFolderMode(false)
    await dbRun('Create folder', () => sb.from('note_folders').insert(folder))
  }

  async function renameFolder(id, name) {
    if (!name.trim()) { setEditFolderName(null); return }
    setFolders(p => p.map(f => f.id === id ? { ...f, name: name.trim() } : f))
    setEditFolderName(null); setRenameVal('')
    await dbRun('Rename folder', () => sb.from('note_folders').update({ name: name.trim() }).eq('id', id))
  }

  async function doDeleteFolder(id) {
    setFolders(p => p.filter(f => f.id !== id))
    setConfirmFolder(null)
    await dbRun('Delete folder', () => sb.from('note_folders').delete().eq('id', id))
  }

  function tryDeleteFolder(folder) {
    const hasNotes = notes.some(n => n.folder_id === folder.id && !n.archived)
    if (hasNotes) {
      toast('Move or delete all notes in this folder first', 'warn')
    } else {
      setConfirmFolder(folder)
    }
  }

  function execCmd(cmd, val = null) {
    document.execCommand(cmd, false, val)
    editorRef.current?.focus()
  }

  function toggleExpanded(key) {
    setExpanded(p => {
      const next = new Set(p)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // ── drag handlers ────────────────────────────────────────────
  function onNoteDragStart(e, noteId) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('noteId', noteId)
    setDragNote(noteId)
  }
  function onNoteDragEnd() { setDragNote(null); setDragOver(null) }
  function onFolderDragOver(e, key) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(key) }
  function onFolderDragLeave(e) {
    // Only clear if we're leaving the folder row itself (not a child)
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null)
  }
  function onFolderDrop(e, folderId) {
    e.preventDefault()
    const noteId = e.dataTransfer.getData('noteId')
    if (noteId) moveToFolder(noteId, folderId)
    setDragOver(null); setDragNote(null)
  }

  // ── derived data ─────────────────────────────────────────────
  const activeNotes    = notes.filter(n => !n.archived)
  const archivedNotes  = notes.filter(n => n.archived)
  const pinnedNotes    = activeNotes.filter(n => n.pinned)
  const unfiledNotes   = activeNotes.filter(n => !n.folder_id)

  const searchActive = search.trim().length > 0
  const searchResults = searchActive
    ? notes.filter(n =>
        n.title.toLowerCase().includes(search.toLowerCase()) ||
        (n.content || '').toLowerCase().includes(search.toLowerCase())
      )
    : []

  if (!isOpen) return null

  // ── NoteRow (shared between tree nodes and search results) ───
  function NoteRow({ note, indent = false }) {
    const isActive = active === note.id
    const menuOpen = noteMenu === note.id

    return (
      <div
        className="relative group/note select-none"
        draggable={!searchActive}
        onDragStart={e => onNoteDragStart(e, note.id)}
        onDragEnd={onNoteDragEnd}
      >
        <button
          onClick={() => { setActive(note.id); setNoteMenu(null) }}
          className="w-full flex items-center gap-1.5 py-[5px] pr-7 rounded-[6px] text-left transition-all"
          style={{
            paddingLeft: indent ? 28 : 8,
            background: isActive ? 'var(--c-accent-light)' : dragNote && !isActive ? 'transparent' : 'transparent',
            color: isActive ? 'var(--c-accent)' : 'var(--c-text)',
          }}
          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--c-border-light)' }}
          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
        >
          <FileTextIcon className="w-3 h-3 flex-shrink-0" style={{ color: isActive ? 'var(--c-accent)' : 'var(--c-faint)' }} />
          {note.pinned && <PinIcon className="w-2.5 h-2.5 flex-shrink-0" style={{ color: 'var(--c-accent)' }} />}
          <span className="text-[12.5px] truncate flex-1 font-medium">{note.title || 'Untitled'}</span>
          {note.archived && <span className="text-[9px] uppercase tracking-wide flex-shrink-0" style={{ color: 'var(--c-faint)' }}>archived</span>}
        </button>

        {/* 3-dot menu button */}
        <button
          onClick={e => { e.stopPropagation(); setNoteMenu(menuOpen ? null : note.id) }}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded opacity-0 group-hover/note:opacity-100 transition-opacity"
          style={{ color: 'var(--c-muted)' }}
        >
          <DotsIcon className="w-3.5 h-3.5" />
        </button>

        {/* Context menu */}
        {menuOpen && (
          <div
            className="absolute right-1 top-6 z-30 rounded-[8px] py-1 w-[160px] shadow-lg"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
            onClick={e => e.stopPropagation()}
          >
            <MenuItem icon={<PinIcon className="w-3.5 h-3.5"/>}
              label={note.pinned ? 'Unpin' : 'Pin'} onClick={() => togglePin(note.id)} />
            <MenuItem icon={<ArchiveIcon className="w-3.5 h-3.5"/>}
              label={note.archived ? 'Unarchive' : 'Archive'} onClick={() => toggleArchive(note.id)} />
            {!note.archived && folders.length > 0 && (
              <>
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--c-faint)' }}>Move to</div>
                {note.folder_id && (
                  <MenuItem icon={<FileTextIcon className="w-3.5 h-3.5"/>} label="No folder" onClick={() => moveToFolder(note.id, null)} />
                )}
                {folders.filter(f => f.id !== note.folder_id).map(f => (
                  <MenuItem key={f.id} icon={<FolderIcon className="w-3.5 h-3.5"/>} label={f.name} onClick={() => moveToFolder(note.id, f.id)} />
                ))}
              </>
            )}
            <div style={{ borderTop: '1px solid var(--c-border-light)', margin: '4px 0' }} />
            <MenuItem icon={<TrashIcon className="w-3.5 h-3.5"/>} label="Delete" danger
              onClick={() => { setNoteMenu(null); setConfirmNote(note) }} />
          </div>
        )}
      </div>
    )
  }

  // ── folder row ───────────────────────────────────────────────
  function FolderRow({ folder }) {
    const folderNotes    = activeNotes.filter(n => n.folder_id === folder.id)
    const isExpanded     = expanded.has(folder.id)
    const isDragTarget   = dragOver === folder.id
    const hasNotes       = folderNotes.length > 0

    return (
      <div>
        {/* Folder header */}
        <div
          className="flex items-center gap-1 px-1 py-[4px] rounded-[6px] group/folder transition-all"
          style={{
            background: isDragTarget ? 'var(--c-accent-light)' : 'transparent',
            border: isDragTarget ? '1px dashed var(--c-accent)' : '1px solid transparent',
          }}
          onDragOver={e => onFolderDragOver(e, folder.id)}
          onDragLeave={onFolderDragLeave}
          onDrop={e => onFolderDrop(e, folder.id)}
        >
          {/* Chevron toggle */}
          <button
            onClick={() => toggleExpanded(folder.id)}
            className="p-0.5 rounded flex-shrink-0 transition-colors"
            style={{ color: 'var(--c-faint)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--c-text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--c-faint)'}
          >
            <ChevronIcon open={isExpanded} />
          </button>

          {/* Folder icon + name */}
          <button
            className="flex-1 flex items-center gap-1.5 text-left min-w-0"
            onClick={() => toggleExpanded(folder.id)}
          >
            <FolderIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isDragTarget ? 'var(--c-accent)' : 'var(--c-faint)' }} />

            {editFolderName === folder.id ? (
              <input
                autoFocus
                className="flex-1 text-[12.5px] font-medium bg-transparent outline-none border-b min-w-0"
                style={{ color: 'var(--c-text)', borderColor: 'var(--c-accent)' }}
                value={renameVal}
                onChange={e => setRenameVal(e.target.value)}
                onBlur={() => renameFolder(folder.id, renameVal)}
                onKeyDown={e => { if (e.key === 'Enter') renameFolder(folder.id, renameVal); if (e.key === 'Escape') setEditFolderName(null) }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="text-[12.5px] font-semibold truncate" style={{ color: isDragTarget ? 'var(--c-accent)' : 'var(--c-text)' }}>
                {folder.name}
              </span>
            )}
          </button>

          {/* Note count */}
          <span className="text-[10px] flex-shrink-0 mr-0.5" style={{ color: 'var(--c-faint)' }}>{folderNotes.length}</span>

          {/* Action buttons (shown on hover) */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover/folder:opacity-100 transition-opacity flex-shrink-0">
            {/* Add note in folder */}
            <button
              onClick={e => { e.stopPropagation(); newNote(folder.id) }}
              className="p-0.5 rounded transition-colors"
              style={{ color: 'var(--c-faint)' }} title="Add note here"
              onMouseEnter={e => e.currentTarget.style.color = 'var(--c-accent)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--c-faint)'}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>

            {/* Rename */}
            <button
              onClick={e => { e.stopPropagation(); setEditFolderName(folder.id); setRenameVal(folder.name) }}
              className="p-0.5 rounded transition-colors"
              style={{ color: 'var(--c-faint)' }} title="Rename folder"
              onMouseEnter={e => e.currentTarget.style.color = 'var(--c-text)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--c-faint)'}
            >
              <EditIcon className="w-3 h-3" />
            </button>

            {/* Delete */}
            <button
              onClick={e => { e.stopPropagation(); tryDeleteFolder(folder) }}
              className="p-0.5 rounded transition-colors"
              style={{ color: hasNotes ? 'var(--c-faint)' : 'var(--c-faint)', opacity: 1, cursor: 'pointer' }}
              title={hasNotes ? 'Remove all notes first' : 'Delete folder'}
              onMouseEnter={e => { e.currentTarget.style.color = hasNotes ? 'var(--c-faint)' : 'var(--c-danger)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--c-faint)' }}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </div>

        {/* Notes inside this folder */}
        {isExpanded && (
          <div className="ml-3 pl-2" style={{ borderLeft: '1px solid var(--c-border-light)' }}>
            {folderNotes.length === 0 ? (
              <p className="text-[11px] py-1.5 pl-2 italic" style={{ color: 'var(--c-faint)' }}>Empty</p>
            ) : (
              folderNotes.map(note => <NoteRow key={note.id} note={note} indent={false} />)
            )}
          </div>
        )}
      </div>
    )
  }

  // ── inner layout ─────────────────────────────────────────────
  const inner = (
    <div
      className={`flex overflow-hidden ${standalone ? 'h-full' : 'rounded-[16px]'}`}
      style={{ background: 'var(--c-surface)' }}
      onClick={() => setNoteMenu(null)}
    >
      {/* ── Sidebar ── */}
      {sidebarOpen && (
        <div className="w-[240px] min-w-[240px] flex flex-col" style={{ borderRight: '1px solid var(--c-border)', background: 'var(--c-bg)' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-3" style={{ borderBottom: '1px solid var(--c-border)' }}>
            <span className="font-semibold text-[13px]" style={{ color: 'var(--c-text)' }}>Notes</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 rounded-[5px] transition-colors"
                style={{ color: 'var(--c-faint)' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--c-text)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--c-faint)'}
                title="Collapse"
              >
                <ChevLeftIcon />
              </button>
              <button onClick={() => newNote()} className="btn btn-primary btn-sm btn-icon" title="New note">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--c-border)' }}>
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: 'var(--c-faint)' }} />
              <input
                className="form-input text-[12px] py-1.5 pl-7"
                placeholder="Search notes…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--c-faint)' }}>
                  <XIcon className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Tree / Search results */}
          <div className="flex-1 overflow-y-auto py-1.5 px-2">

            {searchActive ? (
              /* ── Flat search results ── */
              <>
                <p className="text-[10px] font-bold uppercase tracking-widest px-1 mb-1.5" style={{ color: 'var(--c-faint)' }}>
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                </p>
                {searchResults.length === 0
                  ? <p className="text-[12px] text-center py-6" style={{ color: 'var(--c-faint)' }}>No matches</p>
                  : searchResults.map(n => <NoteRow key={n.id} note={n} />)
                }
              </>
            ) : (
              /* ── Tree view ── */
              <>
                {/* Pinned quick-view */}
                {pinnedNotes.length > 0 && (
                  <div className="mb-1">
                    <div
                      className="flex items-center gap-1 px-1 py-[4px] rounded-[6px] cursor-pointer group/pinned transition-all"
                      onClick={() => toggleExpanded('pinned')}
                      onDragOver={e => e.preventDefault()}
                    >
                      <ChevronIcon open={expanded.has('pinned')} />
                      <PinIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--c-faint)' }} />
                      <span className="text-[12.5px] font-semibold flex-1" style={{ color: 'var(--c-text)' }}>Pinned</span>
                      <span className="text-[10px]" style={{ color: 'var(--c-faint)' }}>{pinnedNotes.length}</span>
                    </div>
                    {expanded.has('pinned') && (
                      <div className="ml-3 pl-2" style={{ borderLeft: '1px solid var(--c-border-light)' }}>
                        {pinnedNotes.map(n => <NoteRow key={n.id} note={n} />)}
                      </div>
                    )}
                  </div>
                )}

                {/* Folders */}
                {folders.map(f => <FolderRow key={f.id} folder={f} />)}

                {/* Unfiled notes drop zone */}
                <div
                  className="mt-0.5"
                  onDragOver={e => onFolderDragOver(e, 'unfiled')}
                  onDragLeave={onFolderDragLeave}
                  onDrop={e => onFolderDrop(e, null)}
                >
                  <div
                    className="flex items-center gap-1 px-1 py-[4px] rounded-[6px] cursor-pointer transition-all"
                    style={{
                      background: dragOver === 'unfiled' ? 'var(--c-accent-light)' : 'transparent',
                      border: dragOver === 'unfiled' ? '1px dashed var(--c-accent)' : '1px solid transparent',
                    }}
                    onClick={() => toggleExpanded('unfiled')}
                  >
                    <ChevronIcon open={expanded.has('unfiled')} />
                    <FileTextIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: dragOver === 'unfiled' ? 'var(--c-accent)' : 'var(--c-faint)' }} />
                    <span className="text-[12.5px] font-semibold flex-1" style={{ color: dragOver === 'unfiled' ? 'var(--c-accent)' : 'var(--c-text)' }}>
                      {folders.length > 0 ? 'Unfiled' : 'Notes'}
                    </span>
                    <span className="text-[10px]" style={{ color: dragOver === 'unfiled' ? 'var(--c-accent)' : 'var(--c-faint)' }}>{unfiledNotes.length}</span>
                  </div>
                  {expanded.has('unfiled') && (
                    <div className="ml-3 pl-2" style={{ borderLeft: '1px solid var(--c-border-light)' }}>
                      {unfiledNotes.length === 0
                        ? <p className="text-[11px] py-1.5 pl-2 italic" style={{ color: 'var(--c-faint)' }}>Drop notes here</p>
                        : unfiledNotes.map(n => <NoteRow key={n.id} note={n} />)
                      }
                    </div>
                  )}
                </div>

                {/* Archived */}
                {archivedNotes.length > 0 && (
                  <div className="mt-1 pt-1" style={{ borderTop: '1px solid var(--c-border-light)' }}>
                    <div
                      className="flex items-center gap-1 px-1 py-[4px] rounded-[6px] cursor-pointer"
                      onClick={() => toggleExpanded('archived')}
                    >
                      <ChevronIcon open={expanded.has('archived')} />
                      <ArchiveIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--c-faint)' }} />
                      <span className="text-[12.5px] font-semibold flex-1" style={{ color: 'var(--c-muted)' }}>Archived</span>
                      <span className="text-[10px]" style={{ color: 'var(--c-faint)' }}>{archivedNotes.length}</span>
                    </div>
                    {expanded.has('archived') && (
                      <div className="ml-3 pl-2" style={{ borderLeft: '1px solid var(--c-border-light)' }}>
                        {archivedNotes.map(n => <NoteRow key={n.id} note={n} />)}
                      </div>
                    )}
                  </div>
                )}

                {/* New folder */}
                <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--c-border-light)' }}>
                  {newFolderMode ? (
                    <div className="flex gap-1 px-1">
                      <FolderIcon className="w-3.5 h-3.5 flex-shrink-0 mt-[9px]" style={{ color: 'var(--c-faint)' }} />
                      <input
                        autoFocus
                        className="form-input text-[12px] py-1 flex-1"
                        placeholder="Folder name…"
                        value={newFolderName}
                        onChange={e => setNewFolderName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setNewFolderMode(false) }}
                        onBlur={() => { if (!newFolderName.trim()) setNewFolderMode(false) }}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setNewFolderMode(true)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[6px] text-[12px] transition-colors"
                      style={{ color: 'var(--c-faint)' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--c-accent)'; e.currentTarget.style.background = 'var(--c-accent-light)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--c-faint)'; e.currentTarget.style.background = 'transparent' }}
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      New folder
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Editor ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeNote ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-1 px-3 py-2 flex-wrap" style={{ borderBottom: '1px solid var(--c-border-light)' }}>
              {!sidebarOpen && (
                <>
                  <button onClick={() => setSidebarOpen(true)} className="p-1 rounded-[5px] mr-1 transition-colors" style={{ color: 'var(--c-muted)' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--c-text)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--c-muted)'} title="Show sidebar">
                    <ChevRightIcon />
                  </button>
                  <div className="w-px h-4 mx-1" style={{ background: 'var(--c-border)' }} />
                </>
              )}
              <ToolBtn onClick={() => execCmd('bold')} title="Bold"><b>B</b></ToolBtn>
              <ToolBtn onClick={() => execCmd('italic')} title="Italic"><i>I</i></ToolBtn>
              <ToolBtn onClick={() => execCmd('underline')} title="Underline"><u>U</u></ToolBtn>
              <div className="w-px h-4 mx-1" style={{ background: 'var(--c-border)' }} />
              <ToolBtn onClick={() => execCmd('formatBlock', 'h2')} title="H2">H2</ToolBtn>
              <ToolBtn onClick={() => execCmd('formatBlock', 'h3')} title="H3">H3</ToolBtn>
              <ToolBtn onClick={() => execCmd('formatBlock', 'p')} title="Para">¶</ToolBtn>
              <div className="w-px h-4 mx-1" style={{ background: 'var(--c-border)' }} />
              <ToolBtn onClick={() => execCmd('insertUnorderedList')} title="Bullets">• List</ToolBtn>
              <ToolBtn onClick={() => execCmd('insertOrderedList')} title="Numbers">1. List</ToolBtn>
              <div className="ml-auto flex items-center gap-2">
                {saving && <span className="text-[11px]" style={{ color: 'var(--c-accent)' }}>saving…</span>}
                {activeNote.pinned && <PinIcon className="w-3.5 h-3.5" style={{ color: 'var(--c-accent)' }} />}
                <ToolBtn onClick={() => { setActive(null); setTimeout(() => togglePin(activeNote.id), 0) }} title={activeNote.pinned ? 'Unpin' : 'Pin'}>
                  <PinIcon className="w-3.5 h-3.5" />
                </ToolBtn>
                <ToolBtn onClick={() => setConfirmNote(activeNote)} title="Delete" className="danger">
                  <TrashIcon className="w-3.5 h-3.5" />
                </ToolBtn>
                {!standalone && (
                  <ToolBtn onClick={onClose} title="Close"><XIcon className="w-3.5 h-3.5" /></ToolBtn>
                )}
              </div>
            </div>

            {/* Breadcrumb */}
            {(activeNote.folder_id || activeNote.pinned) && (
              <div className="px-6 pt-3 flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--c-faint)' }}>
                {activeNote.folder_id && (
                  <>
                    <FolderIcon className="w-3 h-3" />
                    <span>{folders.find(f => f.id === activeNote.folder_id)?.name || 'Folder'}</span>
                    <span>›</span>
                  </>
                )}
                {activeNote.pinned && <><PinIcon className="w-3 h-3" /><span>Pinned</span></>}
              </div>
            )}

            {/* Title */}
            <input
              ref={titleRef}
              className="px-6 pt-4 pb-1 font-serif font-normal bg-transparent outline-none border-none w-full"
              style={{ fontSize: 22, color: 'var(--c-text)' }}
              placeholder="Note title…"
              value={activeNote.title}
              onChange={handleTitleChange}
              dir="ltr"
            />

            {/* Tags */}
            <TagInput tags={activeNote.tags || []} onChange={tags => {
              setNotes(p => p.map(n => n.id === active ? { ...n, tags } : n))
              dbRun('Tags', () => sb.from('notes').update({ tags }).eq('id', active))
            }} />

            {/* Editor */}
            <div
              ref={editorRef}
              contentEditable suppressContentEditableWarning dir="ltr"
              className="flex-1 px-6 py-4 outline-none overflow-y-auto text-[14px] leading-relaxed
                [&_h2]:text-[20px] [&_h2]:font-serif [&_h2]:mb-2 [&_h2]:mt-4
                [&_h3]:text-[16px] [&_h3]:font-medium [&_h3]:mb-1.5 [&_h3]:mt-3
                [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:my-2
                [&_ol]:list-decimal [&_ol]:ml-5 [&_ol]:my-2 [&_li]:my-0.5"
              style={{ color: 'var(--c-text)' }}
              data-placeholder="Start writing…"
              onInput={handleEditorInput}
            />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)} className="absolute left-3 top-3 p-1.5 rounded-[6px] transition-colors"
                style={{ color: 'var(--c-muted)' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--c-text)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--c-muted)'}>
                <ChevRightIcon />
              </button>
            )}
            <NoteEmptyIcon className="w-10 h-10 opacity-20" style={{ color: 'var(--c-faint)' }} />
            <p className="text-[13px]" style={{ color: 'var(--c-muted)' }}>Select a note or create a new one</p>
            <button onClick={() => newNote()} className="btn btn-primary btn-sm">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New note
            </button>
            {!standalone && (
              <button onClick={onClose} className="btn btn-ghost btn-sm absolute top-3 right-3">
                <XIcon className="w-3.5 h-3.5" /> Close
              </button>
            )}
          </div>
        )}
      </div>

      {/* Delete note confirm */}
      <Confirm
        open={!!confirmNote}
        title="Delete note?"
        body={`"${confirmNote?.title || 'Untitled'}" will be permanently removed.`}
        okLabel="Delete"
        onOk={() => deleteNote(confirmNote.id)}
        onCancel={() => setConfirmNote(null)}
      />

      {/* Delete folder confirm */}
      <Confirm
        open={!!confirmFolder}
        title="Delete folder?"
        body={`"${confirmFolder?.name}" will be removed. Notes inside will not be deleted.`}
        okLabel="Delete folder"
        onOk={() => doDeleteFolder(confirmFolder.id)}
        onCancel={() => setConfirmFolder(null)}
      />
    </div>
  )

  if (standalone) return <div className="h-screen">{inner}</div>

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[900]" onClick={onClose} />
      <div className="fixed inset-4 z-[901] flex shadow-2xl overflow-hidden rounded-[16px]"
        style={{ border: '1px solid var(--c-border)' }}>
        {inner}
      </div>
    </>
  )
}

// ── Sub-components ─────────────────────────────────────────────
function MenuItem({ label, icon, onClick, danger }) {
  return (
    <button onClick={onClick}
      className="w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 transition-colors"
      style={{ color: danger ? 'var(--c-danger)' : 'var(--c-text)' }}
      onMouseEnter={e => { e.currentTarget.style.background = danger ? 'var(--c-danger-light)' : 'var(--c-border-light)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
      <span style={{ color: danger ? 'var(--c-danger)' : 'var(--c-faint)' }}>{icon}</span>
      {label}
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
        <span key={t} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
          style={{ background: 'var(--c-border-light)', color: 'var(--c-muted)' }}>
          #{t}
          <button onClick={() => onChange(tags.filter(x => x !== t))} style={{ color: 'var(--c-faint)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--c-danger)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--c-faint)'}>×</button>
        </span>
      ))}
      <input className="text-[12px] outline-none bg-transparent min-w-[80px]" style={{ color: 'var(--c-muted)' }}
        placeholder="+ add tag" value={input} onChange={e => setInput(e.target.value)} onKeyDown={add} />
    </div>
  )
}

function ToolBtn({ onClick, title, children, className = '' }) {
  return (
    <button onClick={onClick} title={title}
      className={`px-2 py-1 text-[12px] rounded-[5px] transition-colors ${className}`}
      style={{ color: 'var(--c-muted)' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-border-light)'; e.currentTarget.style.color = 'var(--c-text)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--c-muted)' }}>
      {children}
    </button>
  )
}

// ── Icons ──────────────────────────────────────────────────────
function ChevronIcon({ open }) {
  return (
    <svg className="w-3 h-3 transition-transform flex-shrink-0" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}
function ChevLeftIcon()       { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg> }
function ChevRightIcon()      { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg> }
function SearchIcon(p)        { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> }
function FolderIcon(p)        { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> }
function FileTextIcon(p)      { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> }
function PinIcon(p)           { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> }
function ArchiveIcon(p)       { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg> }
function DotsIcon(p)          { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg> }
function TrashIcon(p)         { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg> }
function NoteEmptyIcon(p)     { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> }
function EditIcon(p)          { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> }
function XIcon(p)             { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
