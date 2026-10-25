import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Plus, Search, Pin, PinOff, Archive, ArchiveRestore, Trash2, FolderPlus, Folder, ChevronLeft, X,
  Bold, Italic, Underline, Heading2, Heading3, List, ListOrdered, Quote, StickyNote, PenLine,
} from 'lucide-react'
import { Menu, SaveState, Empty, PageLoader, useToast, useConfirm } from '../components/ui'
import { sb, dbRun } from '../lib/supabase'
import { useAutosave } from '../lib/useAutosave'
import { useBus } from '../lib/bus'
import { uid, nowIso, stripHtml } from '../lib/utils'

function ago(iso) {
  if (!iso) return ''
  const d = new Date(iso), diff = (Date.now() - d) / 1000
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7) return d.toLocaleDateString('en-GB', { weekday: 'short' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function Notes() {
  const [params, setParams] = useSearchParams()
  const [notes, setNotes] = useState(null)
  const [folders, setFolders] = useState([])
  const [scope, setScope] = useState('all') // all | pinned | unfiled | archived | <folderId>
  const [q, setQ] = useState('')
  const [newFolder, setNewFolder] = useState(null)
  const [renaming, setRenaming] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const toast = useToast()
  const confirm = useConfirm()
  const activeId = params.get('id')

  const { queue, flush, status, retry } = useAutosave(
    (id, patch) => dbRun('Save note', () => sb.from('notes').update({ ...patch, updated_at: nowIso() }).eq('id', id)), 700)

  async function reload() {
    const [n, f] = await Promise.all([
      sb.from('notes').select('*').order('updated_at', { ascending: false }),
      sb.from('note_folders').select('*').order('sort_order', { ascending: true }),
    ])
    if (n.error) toast('Couldn’t load notes.', 'error')
    setNotes(n.data || []); setFolders(f.data || [])
  }
  useEffect(() => { reload() }, [])
  useBus('notes', reload)

  const active = notes?.find(n => n.id === activeId) || null

  function patch(id, p, { save = true } = {}) {
    setNotes(ns => ns.map(n => n.id === id ? { ...n, ...p, updated_at: nowIso() } : n))
    if (save) queue(id, p)
  }

  async function open(id) { await flush(); setParams(id ? { id } : {}) }

  async function create() {
    await flush()
    const folderId = scope !== 'all' && scope !== 'pinned' && scope !== 'unfiled' && scope !== 'archived' ? scope : null
    const n = { id: uid(), title: '', content: '', tags: [], folder_id: folderId, pinned: scope === 'pinned', archived: false, created_at: nowIso(), updated_at: nowIso() }
    setNotes(ns => [n, ...ns])
    setParams({ id: n.id })
    if (scope === 'archived') setScope('all')
    try { await dbRun('Create note', () => sb.from('notes').insert({ ...n, title: 'Untitled' })) }
    catch { toast('Couldn’t create the note.', 'error') }
  }

  async function togglePin(n) { patch(n.id, { pinned: !n.pinned }); toast(n.pinned ? 'Unpinned' : 'Pinned to the top') }
  async function toggleArchive(n) {
    patch(n.id, { archived: !n.archived })
    toast(n.archived ? 'Note restored' : 'Note archived', { action: { label: 'Undo', onClick: () => patch(n.id, { archived: n.archived }) } })
  }
  async function remove(n) {
    const ok = await confirm({ title: 'Delete this note?', body: `“${n.title || 'Untitled'}” will be deleted for good. Archive it instead if you might need it later.`, confirmLabel: 'Delete note' })
    if (!ok) return
    await flush()
    setNotes(ns => ns.filter(x => x.id !== n.id))
    if (activeId === n.id) setParams({})
    try { await dbRun('Delete note', () => sb.from('notes').delete().eq('id', n.id)); toast('Note deleted') }
    catch { reload(); toast('Couldn’t delete the note.', 'error') }
  }

  async function createFolder(name) {
    setNewFolder(null)
    if (!name.trim()) return
    const f = { id: uid(), name: name.trim(), sort_order: folders.length, created_at: nowIso() }
    setFolders(fs => [...fs, f]); setScope(f.id)
    try { await dbRun('Create folder', () => sb.from('note_folders').insert(f)) }
    catch { setFolders(fs => fs.filter(x => x.id !== f.id)); toast('Couldn’t create the folder.', 'error') }
  }
  async function renameFolder(f, name) {
    setRenaming(null)
    if (!name.trim() || name.trim() === f.name) return
    setFolders(fs => fs.map(x => x.id === f.id ? { ...x, name: name.trim() } : x))
    try { await dbRun('Rename folder', () => sb.from('note_folders').update({ name: name.trim() }).eq('id', f.id)) }
    catch { toast('Couldn’t rename the folder.', 'error') }
  }
  async function removeFolder(f) {
    const inside = notes.filter(n => n.folder_id === f.id).length
    const ok = await confirm({
      title: `Delete the folder “${f.name}”?`,
      body: inside ? `Its ${inside} note${inside === 1 ? '' : 's'} won’t be deleted. They’ll move to Unfiled.` : 'The folder is empty.',
      confirmLabel: 'Delete folder',
    })
    if (!ok) return
    setFolders(fs => fs.filter(x => x.id !== f.id))
    setNotes(ns => ns.map(n => n.folder_id === f.id ? { ...n, folder_id: null } : n))
    if (scope === f.id) setScope('all')
    try {
      await dbRun('Unfile notes', () => sb.from('notes').update({ folder_id: null }).eq('folder_id', f.id))
      await dbRun('Delete folder', () => sb.from('note_folders').delete().eq('id', f.id))
      toast('Folder deleted')
    } catch { reload(); toast('Couldn’t delete the folder.', 'error') }
  }
  function moveTo(n, folderId) {
    patch(n.id, { folder_id: folderId })
    toast(folderId ? `Moved to ${folders.find(f => f.id === folderId)?.name}` : 'Moved to Unfiled')
  }

  const list = useMemo(() => {
    if (!notes) return []
    const query = q.trim().toLowerCase()
    return notes.filter(n => {
      if (query) return (n.title || '').toLowerCase().includes(query) || stripHtml(n.content).toLowerCase().includes(query) || (n.tags || []).some(t => t.toLowerCase().includes(query))
      if (scope === 'archived') return n.archived
      if (n.archived) return false
      if (scope === 'pinned') return n.pinned
      if (scope === 'unfiled') return !n.folder_id
      if (scope !== 'all') return n.folder_id === scope
      return true
    }).sort((a, b) => (b.pinned - a.pinned) || (b.updated_at || '').localeCompare(a.updated_at || ''))
  }, [notes, scope, q])

  if (!notes) return <PageLoader />
  const live = notes.filter(n => !n.archived)
  const scopes = [
    { id: 'all', label: 'All', count: live.length },
    live.some(n => n.pinned) && { id: 'pinned', label: 'Pinned', count: live.filter(n => n.pinned).length },
    ...folders.map(f => ({ id: f.id, label: f.name, count: live.filter(n => n.folder_id === f.id).length, folder: f })),
    folders.length > 0 && { id: 'unfiled', label: 'Unfiled', count: live.filter(n => !n.folder_id).length },
    notes.some(n => n.archived) && { id: 'archived', label: 'Archived', count: notes.filter(n => n.archived).length },
  ].filter(Boolean)

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-8 pt-8 md:pt-12">
      <header className={`flex flex-wrap items-end gap-4 mb-6 ${active ? 'hidden md:flex' : ''}`}>
        <div className="mr-auto">
          <h1 className="h-page">Notes</h1>
          <p className="text-[14px] text-muted mt-1">{live.length} note{live.length === 1 ? '' : 's'}{folders.length ? `, ${folders.length} folder${folders.length === 1 ? '' : 's'}` : ''}</p>
        </div>
        <button onClick={create} className="btn btn-primary"><Plus size={16} /> New note</button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[320px_minmax(0,1fr)] gap-6 items-start">
        {/* Navigator */}
        <div className={`${active ? 'hidden md:block' : ''} md:sticky md:top-6`}>
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search notes and tags" className="input pl-9" aria-label="Search notes" />
            {q && <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-faint hover:text-ink" aria-label="Clear search"><X size={15} /></button>}
          </div>

          {!q && (
            <div className="flex flex-wrap gap-1.5 mb-3" role="group" aria-label="Folders">
              {scopes.map(s => renaming === s.id ? (
                <input key={s.id} autoFocus defaultValue={s.label} className="input h-8 w-36 text-[13px]"
                  onBlur={e => renameFolder(s.folder, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null) }} aria-label="Folder name" />
              ) : (
                <div key={s.id} className="relative inline-flex"
                  onDragOver={s.folder || s.id === 'unfiled' ? e => { e.preventDefault(); setDragOver(s.id) } : undefined}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={s.folder || s.id === 'unfiled' ? e => { e.preventDefault(); const n = notes.find(x => x.id === e.dataTransfer.getData('text/note')); if (n) moveTo(n, s.folder ? s.id : null); setDragOver(null) } : undefined}>
                  <button className="pick h-8 text-[13px]" aria-pressed={scope === s.id}
                    style={dragOver === s.id ? { boxShadow: 'inset 0 0 0 1.5px var(--c-accent)', background: 'var(--c-accent-soft)' } : undefined}
                    onClick={() => setScope(s.id)}
                    onDoubleClick={() => s.folder && setRenaming(s.id)}>
                    {s.folder && <Folder size={13} />}{s.label}<span className="opacity-60 tnum">{s.count}</span>
                  </button>
                  {s.folder && scope === s.id && (
                    <Menu label={`Folder ${s.label} actions`} items={[
                      { label: 'Rename', icon: <PenLine size={15} />, onClick: () => setRenaming(s.id) },
                      { label: 'Delete folder', icon: <Trash2 size={15} />, danger: true, onClick: () => removeFolder(s.folder) },
                    ]} />
                  )}
                </div>
              ))}
              {newFolder !== null ? (
                <input autoFocus value={newFolder} onChange={e => setNewFolder(e.target.value)} placeholder="Folder name"
                  onBlur={() => createFolder(newFolder)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setNewFolder(null) }}
                  className="input h-8 w-36 text-[13px]" aria-label="New folder name" />
              ) : (
                <button onClick={() => setNewFolder('')} className="h-8 px-3 rounded-full text-[13px] text-muted hover:text-ink inline-flex items-center gap-1.5"><FolderPlus size={14} /> Folder</button>
              )}
            </div>
          )}

          <div className="panel p-1.5 md:max-h-[calc(100vh-300px)] overflow-y-auto">
            {list.length === 0 ? (
              <p className="text-[13.5px] text-muted px-3 py-6 text-center">{q ? `No notes match “${q}”.` : scope === 'archived' ? 'Nothing archived.' : 'No notes here yet.'}</p>
            ) : list.map(n => (
              <button key={n.id} draggable onDragStart={e => e.dataTransfer.setData('text/note', n.id)}
                onClick={() => open(n.id)} aria-current={n.id === activeId}
                className="w-full text-left rounded-[10px] px-3 py-2.5 transition-colors"
                style={{ background: n.id === activeId ? 'var(--c-sunken)' : undefined }}>
                <span className="flex items-center gap-1.5">
                  {n.pinned && <Pin size={12} className="text-accent flex-shrink-0" />}
                  <span className="text-[14px] font-medium truncate flex-1">{n.title?.trim() || 'Untitled'}</span>
                  <span className="text-[11.5px] text-faint flex-shrink-0">{ago(n.updated_at)}</span>
                </span>
                <span className="block text-[12.5px] text-muted truncate mt-0.5">{stripHtml(n.content) || 'No text yet'}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className={active ? '' : 'hidden md:block'}>
          {active ? (
            <Editor key={active.id} note={active} folders={folders} status={status} retry={retry}
              onBack={() => open(null)} onPatch={p => patch(active.id, p)}
              onPin={() => togglePin(active)} onArchive={() => toggleArchive(active)} onDelete={() => remove(active)} onMove={f => moveTo(active, f)} />
          ) : (
            <div className="panel">
              <Empty icon={StickyNote} title={live.length ? 'Pick a note' : 'Your first note'}
                body={live.length ? 'Or start a new one. Everything saves as you type.' : 'Ideas, meeting notes, story fragments. Everything saves as you type.'}
                action={<button onClick={create} className="btn btn-primary"><Plus size={16} /> New note</button>} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Editor({ note, folders, status, retry, onBack, onPatch, onPin, onArchive, onDelete, onMove }) {
  const bodyRef = useRef(null)
  const titleRef = useRef(null)
  const [tag, setTag] = useState('')

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.innerHTML = note.content || ''
    if (!note.title && titleRef.current) titleRef.current.focus()
  }, [])

  const cmd = (c, v = null) => { document.execCommand(c, false, v); bodyRef.current?.focus(); onPatch({ content: bodyRef.current.innerHTML }) }
  const addTag = () => { const t = tag.trim().replace(/^#/, ''); if (t && !(note.tags || []).includes(t)) onPatch({ tags: [...(note.tags || []), t] }); setTag('') }

  return (
    <article className="panel min-h-[60vh] flex flex-col" aria-label="Note editor">
      <div className="flex items-center gap-1 px-3 md:px-5 pt-3 pb-2 border-b border-line-soft flex-wrap">
        <button onClick={onBack} className="btn btn-quiet btn-sm md:hidden"><ChevronLeft size={16} /> Notes</button>
        <div className="hidden md:flex items-center gap-0.5">
          {[[Bold, 'bold'], [Italic, 'italic'], [Underline, 'underline']].map(([I, c]) => (
            <button key={c} onMouseDown={e => { e.preventDefault(); cmd(c) }} className="btn btn-quiet btn-sm btn-icon" aria-label={c}><I size={15} /></button>
          ))}
          <span className="w-px h-5 bg-line mx-1" />
          <button onMouseDown={e => { e.preventDefault(); cmd('formatBlock', 'h2') }} className="btn btn-quiet btn-sm btn-icon" aria-label="Heading"><Heading2 size={16} /></button>
          <button onMouseDown={e => { e.preventDefault(); cmd('formatBlock', 'h3') }} className="btn btn-quiet btn-sm btn-icon" aria-label="Subheading"><Heading3 size={16} /></button>
          <button onMouseDown={e => { e.preventDefault(); cmd('insertUnorderedList') }} className="btn btn-quiet btn-sm btn-icon" aria-label="Bulleted list"><List size={16} /></button>
          <button onMouseDown={e => { e.preventDefault(); cmd('insertOrderedList') }} className="btn btn-quiet btn-sm btn-icon" aria-label="Numbered list"><ListOrdered size={16} /></button>
          <button onMouseDown={e => { e.preventDefault(); cmd('formatBlock', 'blockquote') }} className="btn btn-quiet btn-sm btn-icon" aria-label="Quote"><Quote size={15} /></button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <SaveState status={status} onRetry={retry} className="mr-2" />
          <button onClick={onPin} className="btn btn-quiet btn-sm btn-icon" aria-label={note.pinned ? 'Unpin' : 'Pin'} data-tip={note.pinned ? 'Unpin' : 'Pin'}>
            {note.pinned ? <PinOff size={16} /> : <Pin size={16} />}
          </button>
          <Menu items={[
            { heading: 'Move to' },
            { label: 'Unfiled', checked: !note.folder_id, onClick: () => onMove(null) },
            ...folders.map(f => ({ label: f.name, icon: <Folder size={15} />, checked: note.folder_id === f.id, onClick: () => onMove(f.id) })),
            { divider: true },
            { label: note.archived ? 'Restore from archive' : 'Archive', icon: note.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />, onClick: onArchive },
            { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: onDelete },
          ]} />
        </div>
      </div>

      <div className="px-5 md:px-10 pt-6 md:pt-8 pb-10 flex-1 flex flex-col max-w-[760px] w-full">
        {note.archived && <p className="text-[13px] text-warn mb-3">This note is archived.</p>}
        <input ref={titleRef} value={note.title === 'Untitled' ? '' : note.title || ''} placeholder="Untitled"
          onChange={e => onPatch({ title: e.target.value || 'Untitled' })}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); bodyRef.current?.focus() } }}
          className="w-full bg-transparent outline-none font-serif text-[28px] md:text-[34px] leading-tight font-medium placeholder:text-faint" aria-label="Title" />
        <div className="flex flex-wrap items-center gap-1.5 mt-3 mb-6">
          {(note.tags || []).map(t => (
            <span key={t} className="chip h-7 pr-1">#{t}
              <button onClick={() => onPatch({ tags: note.tags.filter(x => x !== t) })} aria-label={`Remove tag ${t}`} className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-line"><X size={11} /></button>
            </span>
          ))}
          <input value={tag} onChange={e => setTag(e.target.value)} onBlur={addTag}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() } }}
            placeholder="Add tag" className="bg-transparent outline-none text-[13px] w-24 placeholder:text-faint" aria-label="Add tag" />
        </div>
        <div ref={bodyRef} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Note body"
          data-placeholder="Start writing…"
          onInput={e => onPatch({ content: e.currentTarget.innerHTML })}
          className="prose-write flex-1 min-h-[300px]" />
      </div>
    </article>
  )
}
