import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Routes, Route, Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Plus, BookOpen, Play, Pause, ChevronLeft, ChevronRight, Trash2, Search, Upload, X, Clock, Check, Library as LibIcon, Layers, CalendarDays, Target, MoreHorizontal,
} from 'lucide-react'
import { Dialog, Sheet, Menu, Seg, Stars, Empty, PageLoader, SaveState, Ring, useToast, useConfirm } from '../components/ui'
import { sb, dbRun } from '../lib/supabase'
import { useAutosave } from '../lib/useAutosave'
import { uid, today, fmtDay, fmtMinutes, fmtClock, plural, parseYmd, nowIso, weekOffset, weekdayLabels } from '../lib/utils'
import { useAuth } from '../contexts/AuthContext'

const STATUS = { unread: 'Want to read', reading: 'Reading', completed: 'Finished', paused: 'Paused' }

function pctOf(b) { return b.total_pages > 0 ? Math.min(100, Math.round(((b.pages_read || 0) / b.total_pages) * 100)) : 0 }

function eta(book, sessions) {
  const s = sessions.filter(x => x.book_id === book.id && x.duration_min > 0 && x.end_page > x.start_page).slice(-5)
  if (!s.length || !book.total_pages) return null
  const ppm = s.reduce((a, x) => a + (x.end_page - x.start_page) / x.duration_min, 0) / s.length
  if (ppm <= 0) return null
  const left = Math.max(0, book.total_pages - (book.pages_read || 0))
  return left ? `about ${fmtMinutes(Math.ceil(left / ppm))} left` : null
}

export default function Library() {
  return (
    <Routes>
      <Route path="/" element={<LibraryHome />} />
      <Route path="/book/:id" element={<BookDetail />} />
      <Route path="/series/:id" element={<SeriesDetail />} />
    </Routes>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Home
// ═══════════════════════════════════════════════════════════════
function LibraryHome() {
  const [tab, setTab] = useState('shelf')
  const [data, setData] = useState(null)
  const [adding, setAdding] = useState(false)
  const [reading, setReading] = useState(null)
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()

  async function reload() {
    const [b, a, s, rs, g] = await Promise.all([
      sb.from('books').select('*'), sb.from('authors').select('*'), sb.from('series').select('*'),
      sb.from('reading_sessions').select('*'), sb.from('reading_goals').select('*').eq('active', true).limit(1),
    ])
    if (b.error) toast('Couldn’t load your library.', 'error')
    setData({ books: b.data || [], authors: a.data || [], series: s.data || [], sessions: rs.data || [], goal: (g.data || [])[0] || null })
  }
  useEffect(() => { reload() }, [])

  async function removeBook(b) {
    const n = data.sessions.filter(s => s.book_id === b.id).length
    const ok = await confirm({ title: `Delete “${b.title}”?`, body: n ? `Its ${plural(n, 'reading session')} will be deleted too. This can’t be undone.` : 'This can’t be undone.', confirmLabel: 'Delete book' })
    if (!ok) return
    setData(d => ({ ...d, books: d.books.filter(x => x.id !== b.id) }))
    try { await dbRun('Delete book', () => sb.from('books').delete().eq('id', b.id)); toast('Book deleted') }
    catch { reload(); toast('Couldn’t delete the book.', 'error') }
  }

  async function setStatus(b, status) {
    const p = { status, ...(status === 'completed' ? { completed_at: today(), pages_read: b.total_pages || b.pages_read } : {}) }
    setData(d => ({ ...d, books: d.books.map(x => x.id === b.id ? { ...x, ...p } : x) }))
    try { await dbRun('Update book', () => sb.from('books').update(p).eq('id', b.id)); toast(`Moved to ${STATUS[status]}`) }
    catch { reload(); toast('Couldn’t update the book.', 'error') }
  }

  if (!data) return <PageLoader />
  const now = data.books.filter(b => b.status === 'reading')

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-8 pt-8 md:pt-12">
      <header className="flex flex-wrap items-end gap-4 mb-6">
        <div className="mr-auto">
          <h1 className="h-page">Library</h1>
          <p className="text-[14px] text-muted mt-1">{plural(data.books.length, 'book')}, {data.books.filter(b => b.status === 'completed').length} finished</p>
        </div>
        <button onClick={() => setAdding(true)} className="btn btn-primary"><Plus size={16} /> Add book</button>
      </header>

      <div className="flex flex-wrap items-center gap-4 mb-8">
        <Seg label="Section" value={tab} onChange={setTab} options={[
          { value: 'shelf', label: 'Shelf', icon: <LibIcon size={15} /> },
          { value: 'series', label: 'Series', icon: <Layers size={15} /> },
          { value: 'calendar', label: 'Calendar', icon: <CalendarDays size={15} /> },
        ]} />
        <DailyGoal goal={data.goal} sessions={data.sessions} onSaved={g => setData(d => ({ ...d, goal: g }))} />
      </div>

      {tab === 'shelf' && (
        <>
          {now.length > 0 && (
            <section className="mb-10" aria-labelledby="now-h">
              <h2 id="now-h" className="h-section mb-3">Reading now</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {now.map(b => (
                  <article key={b.id} className="panel p-4 flex gap-4">
                    <Link to={`/library/book/${b.id}`} className="w-[72px] flex-shrink-0"><Cover book={b} compact /></Link>
                    <div className="flex-1 min-w-0 flex flex-col">
                      <Link to={`/library/book/${b.id}`} className="font-serif text-[18px] leading-snug font-medium hover:underline underline-offset-2 line-clamp-2">{b.title}</Link>
                      <p className="text-[13px] text-muted mt-0.5">{data.authors.find(a => a.id === b.author_id)?.name}</p>
                      <div className="mt-auto pt-3">
                        <div className="flex items-baseline justify-between text-[12.5px] text-muted mb-1.5">
                          <span className="tnum">{b.pages_read || 0} of {b.total_pages || '?'} pages</span>
                          <span>{eta(b, data.sessions) || `${pctOf(b)}%`}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-line overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pctOf(b)}%`, background: 'var(--m-library)' }} /></div>
                      </div>
                    </div>
                    <button onClick={() => setReading(b)} className="btn btn-primary self-center"><Play size={15} /> Read</button>
                  </article>
                ))}
              </div>
            </section>
          )}
          <Shelf data={data} onRemove={removeBook} onStatus={setStatus} onRead={setReading} onAdd={() => setAdding(true)} />
        </>
      )}
      {tab === 'series' && <SeriesGrid data={data} />}
      {tab === 'calendar' && <ReadingCalendar data={data} />}

      <AddBook open={adding} onClose={() => setAdding(false)} authors={data.authors}
        onCreated={b => { setAdding(false); navigate(`/library/book/${b.id}`) }} />
      {reading && <ReadingSession book={reading} onClose={() => setReading(null)} onSaved={() => { setReading(null); reload() }} />}
    </div>
  )
}

function Cover({ book, className = '', compact }) {
  return (
    <div className={`aspect-[2/3] rounded-[6px] overflow-hidden bg-sunken shadow-[0_1px_2px_rgba(0,0,0,.12),0_6px_16px_rgba(0,0,0,.08)] ${className}`}>
      {book.cover_url
        ? <img src={book.cover_url} alt="" className="w-full h-full object-cover" loading="lazy" />
        : <div className="w-full h-full flex flex-col justify-between p-3" style={{ background: 'color-mix(in srgb, var(--m-library) 14%, var(--c-surface))' }}>
            <BookOpen size={compact ? 13 : 16} style={{ color: 'var(--m-library)' }} />
            {!compact && <span className="font-serif text-[13px] leading-tight line-clamp-4">{book.title}</span>}
          </div>}
    </div>
  )
}

function Shelf({ data, onRemove, onStatus, onRead, onAdd }) {
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const list = data.books
    .filter(b => (filter === 'all' || b.status === filter) && (!q || b.title.toLowerCase().includes(q.toLowerCase()) || (data.authors.find(a => a.id === b.author_id)?.name || '').toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))

  if (data.books.length === 0) {
    return <Empty icon={BookOpen} title="Your shelf is empty" body="Add what you’re reading now. Log a session and you’ll see your pace and when you’ll finish."
      action={<button onClick={onAdd} className="btn btn-primary"><Plus size={16} /> Add book</button>} />
  }

  return (
    <section aria-labelledby="shelf-h">
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <h2 id="shelf-h" className="h-section mr-2">Shelf</h2>
        <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="Filter books">
          {[['all', 'All'], ...Object.entries(STATUS)].map(([k, v]) => (
            <button key={k} className="pick h-8 text-[13px]" aria-pressed={filter === k} onClick={() => setFilter(k)}>{v}</button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-56">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Title or author" className="input h-9 pl-9" aria-label="Search books" />
        </div>
      </div>
      {list.length === 0 ? <p className="text-[14px] text-muted py-6">No books match.</p> : (
        <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-x-5 gap-y-8">
          {list.map(b => {
            const series = data.series.find(s => s.id === b.series_id)
            return (
              <div key={b.id} className="group relative">
                <Link to={`/library/book/${b.id}`} className="block">
                  <div className="relative">
                    <Cover book={b} />
                    {b.status === 'reading' && <div className="absolute inset-x-0 bottom-0 h-1 bg-black/20"><div className="h-full" style={{ width: `${pctOf(b)}%`, background: 'var(--m-library)' }} /></div>}
                  </div>
                  <p className="text-[13.5px] font-medium leading-snug mt-2.5 line-clamp-2">{b.title}</p>
                  <p className="text-[12.5px] text-muted truncate">{data.authors.find(a => a.id === b.author_id)?.name || STATUS[b.status]}</p>
                  {series && <p className="text-[12px] text-faint truncate">{series.name}{b.series_order ? ` #${b.series_order}` : ''}</p>}
                  {b.status === 'completed' && b.rating > 0 && <Stars value={b.rating} size={12} />}
                </Link>
                <div className="absolute top-1.5 right-1.5 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                  <Menu label={`Actions for ${b.title}`} items={[
                    b.status !== 'completed' && { label: b.status === 'reading' ? 'Continue reading' : 'Start reading', icon: <Play size={15} />, onClick: () => onRead(b) },
                    { heading: 'Move to' },
                    ...Object.entries(STATUS).filter(([k]) => k !== b.status).map(([k, v]) => ({ label: v, onClick: () => onStatus(b, k) })),
                    { divider: true },
                    { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: () => onRemove(b) },
                  ]} trigger={p => <button {...p} aria-label="Book actions" className="w-8 h-8 rounded-full bg-surface flex items-center justify-center shadow-float text-muted hover:text-ink"><MoreHorizontal size={16} /></button>} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function DailyGoal({ goal, sessions, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ goal_type: goal?.goal_type || 'pages', target: goal?.target || 20 })
  const toast = useToast()
  const t = sessions.filter(s => s.date === today())
  const current = goal ? (goal.goal_type === 'minutes' ? t.reduce((a, s) => a + (s.duration_min || 0), 0) : t.reduce((a, s) => a + Math.max(0, s.end_page - s.start_page), 0)) : 0
  const pct = goal ? Math.min(100, Math.round((current / goal.target) * 100)) : 0

  async function save() {
    const row = { id: goal?.id || uid(), goal_type: form.goal_type, target: Math.max(1, +form.target || 1), active: true, created_at: goal?.created_at || today() }
    try { await dbRun('Save reading goal', () => sb.from('reading_goals').upsert(row)); onSaved(row); setEditing(false); toast('Daily goal saved') }
    catch { toast('Couldn’t save the goal.', 'error') }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 text-[13.5px]">
        <span className="text-muted">Read</span>
        <input type="number" min="1" className="input h-9 w-20 tnum" value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))} aria-label="Daily target" autoFocus />
        <select className="input h-9 w-auto" value={form.goal_type} onChange={e => setForm(f => ({ ...f, goal_type: e.target.value }))} aria-label="Unit">
          <option value="pages">pages</option><option value="minutes">minutes</option>
        </select>
        <span className="text-muted">a day</span>
        <button onClick={save} className="btn btn-primary btn-sm">Save</button>
        <button onClick={() => setEditing(false)} className="btn btn-quiet btn-sm">Cancel</button>
      </div>
    )
  }
  if (!goal) return <button onClick={() => setEditing(true)} className="btn btn-quiet btn-sm"><Target size={15} /> Set a daily reading goal</button>
  return (
    <button onClick={() => { setForm({ goal_type: goal.goal_type, target: goal.target }); setEditing(true) }} className="flex items-center gap-3 text-left rounded-[10px] pr-2" aria-label="Edit daily reading goal">
      <Ring pct={pct} size={36} stroke={4} color={pct >= 100 ? 'var(--c-good)' : 'var(--m-library)'}>{pct >= 100 && <Check size={14} className="text-good" />}</Ring>
      <span className="text-[13.5px]"><span className="font-semibold tnum">{current} of {goal.target}</span> <span className="text-muted">{goal.goal_type} today</span></span>
    </button>
  )
}

function SeriesGrid({ data }) {
  if (!data.series.length) return <Empty icon={Layers} title="No series yet" body="Assign a book to a series from its page and it shows up here." />
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {data.series.map(s => {
        const books = data.books.filter(b => b.series_id === s.id).sort((a, b) => (a.series_order || 0) - (b.series_order || 0))
        const done = books.filter(b => b.status === 'completed').length
        return (
          <Link key={s.id} to={`/library/series/${s.id}`} className="panel p-5 block hover:shadow-[inset_0_0_0_1px_var(--c-line)]">
            <div className="flex gap-1.5 mb-4 h-[84px]">
              {books.slice(0, 5).map(b => <div key={b.id} className="w-14"><Cover book={b} compact /></div>)}
            </div>
            <p className="font-serif text-[18px] font-medium">{s.name}</p>
            <p className="text-[13px] text-muted mt-0.5">{done} of {plural(books.length, 'book')} read</p>
          </Link>
        )
      })}
    </div>
  )
}

function ReadingCalendar({ data }) {
  const mondayFirst = useAuth().profile?.week_starts_monday !== false
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const y = month.getFullYear(), m = month.getMonth()
  const offset = weekOffset(new Date(y, m, 1), mondayFirst)
  const days = new Date(y, m + 1, 0).getDate()
  const byDate = {}
  data.sessions.forEach(s => {
    const e = (byDate[s.date] ||= { mins: 0, books: [] })
    e.mins += s.duration_min || 0
    const b = data.books.find(x => x.id === s.book_id)
    if (b && !e.books.includes(b)) e.books.push(b)
  })
  const monthMins = Object.entries(byDate).filter(([d]) => d.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`)).reduce((a, [, v]) => a + v.mins, 0)
  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setMonth(new Date(y, m - 1, 1))} className="btn btn-outline btn-icon btn-sm" aria-label="Previous month"><ChevronLeft size={16} /></button>
        <h2 className="h-section w-40 text-center">{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h2>
        <button onClick={() => setMonth(new Date(y, m + 1, 1))} className="btn btn-outline btn-icon btn-sm" aria-label="Next month"><ChevronRight size={16} /></button>
        <span className="ml-auto text-[13px] text-muted">{monthMins ? `${fmtMinutes(monthMins)} read this month` : 'No reading logged this month'}</span>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[12px] text-faint mb-1.5">{weekdayLabels(mondayFirst, 'short').map(d => <span key={d}>{d}</span>)}</div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: offset }).map((_, i) => <div key={'e' + i} />)}
        {Array.from({ length: days }, (_, i) => {
          const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
          const e = byDate[ds]
          return (
            <div key={ds} className="aspect-square rounded-[10px] p-1.5 flex flex-col" title={e ? `${fmtMinutes(e.mins)}: ${e.books.map(b => b.title).join(', ')}` : undefined}
              style={{ background: e ? 'color-mix(in srgb, var(--m-library) 12%, var(--c-surface))' : 'var(--c-surface)', boxShadow: ds === today() ? 'inset 0 0 0 1.5px var(--c-ink)' : 'inset 0 0 0 1px var(--c-line-soft)' }}>
              <span className="text-[12px] tnum text-muted">{i + 1}</span>
              {e && <div className="flex gap-0.5 mt-auto justify-center">{e.books.slice(0, 2).map(b => <div key={b.id} className="w-3.5 sm:w-5"><Cover book={b} compact /></div>)}</div>}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── Add book ───────────────────────────────────────────────────
function AddBook({ open, onClose, authors, onCreated }) {
  const [f, setF] = useState({ title: '', author: '', total_pages: '', status: 'unread', cover_url: '' })
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  useEffect(() => { if (open) setF({ title: '', author: '', total_pages: '', status: 'unread', cover_url: '' }) }, [open])

  async function submit(e) {
    e.preventDefault()
    if (!f.title.trim() || busy) return
    setBusy(true)
    try {
      const author_id = await ensureAuthor(f.author, authors)
      const b = { id: uid(), title: f.title.trim(), author_id, series_id: null, series_order: null, cover_url: f.cover_url || null, description: '',
        total_pages: +f.total_pages || 0, genres: [], status: f.status, pages_read: 0, created_at: today() }
      await dbRun('Add book', () => sb.from('books').insert(b))
      toast(`Added “${b.title}”`)
      onCreated(b)
    } catch { toast('Couldn’t add the book.', 'error') }
    finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add a book" width={520}>
      <form onSubmit={submit} className="flex gap-5">
        <div className="w-[96px] flex-shrink-0 hidden xs:block">
          <CoverPicker value={f.cover_url} title={f.title} onChange={v => setF(p => ({ ...p, cover_url: v }))} />
        </div>
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <div><label className="label" htmlFor="bt">Title</label><input id="bt" data-autofocus className="input" value={f.title} onChange={e => setF(p => ({ ...p, title: e.target.value }))} /></div>
          <div><label className="label" htmlFor="ba">Author</label>
            <input id="ba" className="input" list="mf-authors" value={f.author} onChange={e => setF(p => ({ ...p, author: e.target.value }))} placeholder="Optional" />
            <datalist id="mf-authors">{authors.map(a => <option key={a.id} value={a.name} />)}</datalist></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="bp">Pages</label><input id="bp" type="number" min="0" className="input tnum" value={f.total_pages} onChange={e => setF(p => ({ ...p, total_pages: e.target.value }))} /></div>
            <div><label className="label" htmlFor="bs">Status</label>
              <select id="bs" className="input" value={f.status} onChange={e => setF(p => ({ ...p, status: e.target.value }))}>
                {Object.entries(STATUS).filter(([k]) => k !== 'completed').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
          </div>
          <p className="text-[12.5px] text-faint">You can add the series, genres and notes on the book’s page.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-outline">Cancel</button>
            <button type="submit" disabled={!f.title.trim() || busy} className="btn btn-primary">Add book</button>
          </div>
        </div>
      </form>
    </Dialog>
  )
}

async function ensureAuthor(name, authors) {
  const n = (name || '').trim()
  if (!n) return null
  const found = authors.find(a => a.name.toLowerCase() === n.toLowerCase())
  if (found) return found.id
  const a = { id: uid(), name: n, bio: '', created_at: today() }
  await dbRun('Add author', () => sb.from('authors').insert(a))
  authors.push(a)
  return a.id
}

function CoverPicker({ value, title, onChange }) {
  const input = useRef(null)
  function pick(e) {
    const file = e.target.files?.[0]; if (!file) return
    const img = new Image(), reader = new FileReader()
    reader.onload = ev => {
      img.onload = () => {
        // Downscale so covers don't bloat the database
        const w = 360, h = Math.round(img.height * (w / img.width))
        const c = document.createElement('canvas'); c.width = w; c.height = h
        c.getContext('2d').drawImage(img, 0, 0, w, h)
        onChange(c.toDataURL('image/jpeg', 0.82))
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }
  return (
    <div>
      <button type="button" onClick={() => input.current?.click()} className="block w-full group relative" aria-label={value ? 'Change cover' : 'Upload cover'}>
        <Cover book={{ cover_url: value, title: title || 'Cover' }} />
        <span className="absolute inset-0 rounded-[6px] flex items-center justify-center bg-black/40 text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"><Upload size={18} /></span>
      </button>
      {value && <button type="button" onClick={() => onChange('')} className="text-[12px] text-muted hover:text-danger mt-2 w-full">Remove cover</button>}
      <input ref={input} type="file" accept="image/*" className="sr-only" onChange={pick} tabIndex={-1} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Book detail — everything edits in place and autosaves
// ═══════════════════════════════════════════════════════════════
function BookDetail() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const [book, setBook] = useState(null)
  const [authors, setAuthors] = useState([])
  const [series, setSeries] = useState([])
  const [sessions, setSessions] = useState([])
  const [authorName, setAuthorName] = useState('')
  const [genre, setGenre] = useState('')
  const [reading, setReading] = useState(false)
  const [logging, setLogging] = useState(false)
  const [finished, setFinished] = useState(false)
  const { queue, flush, status, retry } = useAutosave((bid, p) => dbRun('Save book', () => sb.from('books').update(p).eq('id', bid)), 600)

  async function load() {
    const [b, a, s, rs] = await Promise.all([
      sb.from('books').select('*').eq('id', id).single(), sb.from('authors').select('*'), sb.from('series').select('*'),
      sb.from('reading_sessions').select('*').eq('book_id', id).order('created_at', { ascending: false }),
    ])
    if (!b.data) { toast('That book no longer exists.', 'error'); navigate('/library'); return }
    setBook(b.data); setAuthors(a.data || []); setSeries(s.data || []); setSessions(rs.data || [])
    setAuthorName((a.data || []).find(x => x.id === b.data.author_id)?.name || '')
  }
  useEffect(() => { load() }, [id])
  useEffect(() => { if (params.get('read') && book && book.status !== 'completed') { setReading(true); setParams({}, { replace: true }) } }, [book?.id])

  function set(p) { setBook(b => ({ ...b, ...p })); queue(book.id, p) }

  async function commitAuthor() {
    const n = authorName.trim()
    const current = authors.find(a => a.id === book.author_id)?.name || ''
    if (n === current) return
    try { const aid = await ensureAuthor(n, authors); setAuthors([...authors]); set({ author_id: aid }) }
    catch { toast('Couldn’t save the author.', 'error') }
  }

  async function setSeriesByName(name) {
    const n = name.trim()
    if (!n) return set({ series_id: null, series_order: null })
    let s = series.find(x => x.name.toLowerCase() === n.toLowerCase())
    if (!s) {
      s = { id: uid(), name: n, description: '', created_at: today() }
      try { await dbRun('Add series', () => sb.from('series').insert(s)); setSeries(p => [...p, s]) }
      catch { toast('Couldn’t create the series.', 'error'); return }
    }
    set({ series_id: s.id })
  }

  async function removeSession(s) {
    const ok = await confirm({ title: 'Delete this reading session?', body: `${fmtDay(s.date, { weekday: 'short', day: 'numeric', month: 'short' })}, pages ${s.start_page}–${s.end_page}, ${fmtMinutes(s.duration_min)}.`, confirmLabel: 'Delete session' })
    if (!ok) return
    const rest = sessions.filter(x => x.id !== s.id)
    setSessions(rest)
    try {
      await dbRun('Delete session', () => sb.from('reading_sessions').delete().eq('id', s.id))
      if (s.end_page >= (book.pages_read || 0)) {
        const pages = rest.length ? Math.max(...rest.map(x => x.end_page)) : s.start_page
        set({ pages_read: pages })
      }
      toast('Session deleted')
    } catch { load(); toast('Couldn’t delete the session.', 'error') }
  }

  async function removeBook() {
    const ok = await confirm({ title: `Delete “${book.title}”?`, body: sessions.length ? `Its ${plural(sessions.length, 'reading session')} will be deleted too. This can’t be undone.` : 'This can’t be undone.', confirmLabel: 'Delete book' })
    if (!ok) return
    try { await dbRun('Delete book', () => sb.from('books').delete().eq('id', book.id)); toast('Book deleted'); navigate('/library') }
    catch { toast('Couldn’t delete the book.', 'error') }
  }

  async function sessionSaved(s, updated) {
    setSessions(p => [s, ...p]); setBook(updated)
    if (updated.status === 'completed' && book.status !== 'completed') setFinished(true)
  }

  if (!book) return <PageLoader />
  const pct = pctOf(book)
  const minutes = sessions.reduce((a, s) => a + (s.duration_min || 0), 0)
  const currentSeries = series.find(s => s.id === book.series_id)

  return (
    <div className="max-w-[980px] mx-auto px-4 md:px-8 pt-6 md:pt-10">
      <div className="flex items-center gap-2 mb-6">
        <button onClick={async () => { await flush(); navigate('/library') }} className="btn btn-quiet btn-sm -ml-2"><ChevronLeft size={16} /> Library</button>
        <SaveState status={status} onRetry={retry} className="ml-auto" />
        <Menu items={[{ label: 'Delete book', icon: <Trash2 size={15} />, danger: true, onClick: removeBook }]} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[180px_minmax(0,1fr)] gap-8">
        <div className="w-[150px] sm:w-full">
          <CoverPicker value={book.cover_url} title={book.title} onChange={v => set({ cover_url: v || null })} />
        </div>
        <div className="min-w-0">
          <textarea value={book.title} rows={1} ref={grow} onChange={e => { set({ title: e.target.value }); grow(e.target) }}
            className="w-full bg-transparent outline-none resize-none font-serif text-[30px] md:text-[36px] leading-[1.15] font-medium" aria-label="Title" />
          <input value={authorName} onChange={e => setAuthorName(e.target.value)} onBlur={commitAuthor} list="mf-authors2" placeholder="Add author"
            className="inline-edit text-[16px] text-muted mt-1 max-w-[360px]" aria-label="Author" />
          <datalist id="mf-authors2">{authors.map(a => <option key={a.id} value={a.name} />)}</datalist>

          <div className="mt-5 overflow-x-auto">
            <Seg label="Status" value={book.status} onChange={v => {
              set({ status: v, ...(v === 'completed' ? { completed_at: today(), pages_read: book.total_pages || book.pages_read } : {}) })
              if (v === 'completed' && book.status !== 'completed') setFinished(true)
            }} options={Object.entries(STATUS).map(([value, label]) => ({ value, label }))} />
          </div>

          {book.status !== 'completed' && (
            <div className="flex flex-wrap gap-2 mt-5">
              <button onClick={() => setReading(true)} className="btn btn-primary"><Play size={16} /> {book.status === 'reading' ? 'Continue reading' : 'Start reading'}</button>
              <button onClick={() => setLogging(true)} className="btn btn-outline"><Clock size={16} /> Log a session</button>
            </div>
          )}

          <div className="mt-7">
            <div className="flex items-baseline justify-between text-[13px] text-muted mb-1.5">
              <span>{pct}% read{eta(book, sessions) ? `, ${eta(book, sessions)}` : ''}</span>
              <span>{fmtMinutes(minutes)} across {plural(sessions.length, 'session')}</span>
            </div>
            <div className="h-1.5 rounded-full bg-line overflow-hidden"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: 'var(--m-library)' }} /></div>
            <div className="grid grid-cols-2 gap-3 mt-4 max-w-[360px]">
              <label><span className="block text-[12.5px] text-muted mb-1">Pages read</span>
                <input type="number" min="0" className="input tnum" value={book.pages_read || 0} onChange={e => set({ pages_read: Math.max(0, +e.target.value || 0) })} /></label>
              <label><span className="block text-[12.5px] text-muted mb-1">Total pages</span>
                <input type="number" min="0" className="input tnum" value={book.total_pages || 0} onChange={e => set({ total_pages: Math.max(0, +e.target.value || 0) })} /></label>
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3 mt-6 max-w-[480px]">
            <label><span className="label">Series</span>
              <input className="input" list="mf-series" defaultValue={currentSeries?.name || ''} key={currentSeries?.id || 'none'}
                onBlur={e => setSeriesByName(e.target.value)} placeholder="None" />
              <datalist id="mf-series">{series.map(s => <option key={s.id} value={s.name} />)}</datalist></label>
            <label><span className="label">Book #</span>
              <input type="number" min="1" className="input tnum" disabled={!book.series_id} value={book.series_order || ''} onChange={e => set({ series_order: e.target.value ? +e.target.value : null })} /></label>
          </div>
          {currentSeries && <Link to={`/library/series/${currentSeries.id}`} className="text-[13px] text-muted hover:text-ink inline-block mt-2">See the whole series</Link>}

          <div className="mt-6">
            <span className="label">Genres</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {(book.genres || []).map(g => (
                <span key={g} className="chip h-7 pr-1">{g}
                  <button onClick={() => set({ genres: book.genres.filter(x => x !== g) })} aria-label={`Remove ${g}`} className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-line"><X size={11} /></button>
                </span>
              ))}
              <input value={genre} onChange={e => setGenre(e.target.value)} placeholder="Add genre" aria-label="Add genre"
                onKeyDown={e => { if (e.key === 'Enter' && genre.trim()) { e.preventDefault(); if (!(book.genres || []).includes(genre.trim())) set({ genres: [...(book.genres || []), genre.trim()] }); setGenre('') } }}
                className="bg-transparent outline-none text-[13px] w-28 placeholder:text-faint" />
            </div>
          </div>

          <div className="mt-6">
            <label className="label" htmlFor="bd">About the book</label>
            <textarea id="bd" ref={grow} className="input min-h-[88px]" value={book.description || ''} placeholder="A line or two so you remember why you picked it up"
              onChange={e => { set({ description: e.target.value }); grow(e.target) }} />
          </div>

          {book.status === 'completed' && (
            <div className="mt-6">
              <span className="label">Your rating</span>
              <Stars value={book.rating || 0} onChange={v => set({ rating: v || null })} size={22} />
              <textarea ref={grow} className="input min-h-[100px] mt-3" value={book.review || ''} placeholder="What stayed with you?"
                onChange={e => { set({ review: e.target.value }); grow(e.target) }} aria-label="Review" />
            </div>
          )}

          {sessions.length > 0 && (
            <section className="mt-10">
              <h2 className="h-section mb-2">Sessions</h2>
              <div className="flex flex-col">
                {sessions.map(s => (
                  <div key={s.id} className="flex items-center gap-3 min-h-[44px] border-b border-line-soft text-[13.5px]">
                    <span className="w-28 text-muted">{fmtDay(s.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    <span className="flex-1 tnum">pp. {s.start_page}–{s.end_page} <span className="text-faint">· {plural(Math.max(0, s.end_page - s.start_page), 'page')}</span></span>
                    <span className="text-muted tnum">{fmtMinutes(s.duration_min)}</span>
                    <button onClick={() => removeSession(s)} className="btn btn-quiet btn-sm btn-icon" aria-label="Delete session"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {reading && <ReadingSession book={book} onClose={() => setReading(false)} onSaved={(s, b) => { setReading(false); sessionSaved(s, b) }} />}
      <LogSession open={logging} book={book} onClose={() => setLogging(false)} onSaved={(s, b) => { setLogging(false); sessionSaved(s, b) }} />
      <Finished open={finished} book={book} onClose={() => setFinished(false)} onRate={v => set({ rating: v })} />
    </div>
  )
}

function grow(el) { if (!el) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }

async function recordSession(book, start, end, minutes) {
  const s = { id: uid(), book_id: book.id, date: today(), start_page: start, end_page: end, duration_min: Math.max(1, minutes), created_at: nowIso() }
  await dbRun('Log reading', () => sb.from('reading_sessions').insert(s))
  const pages = Math.max(book.pages_read || 0, end)
  const done = book.total_pages > 0 && pages >= book.total_pages
  const patch = { pages_read: pages, status: done ? 'completed' : 'reading', ...(done ? { completed_at: today() } : {}) }
  await dbRun('Update book', () => sb.from('books').update(patch).eq('id', book.id))
  return [s, { ...book, ...patch }]
}

// ── Full-screen reading timer ──────────────────────────────────
function ReadingSession({ book, onClose, onSaved }) {
  const [startAt] = useState(Date.now())
  const [pausedMs, setPausedMs] = useState(0)
  const [pauseAt, setPauseAt] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [finishing, setFinishing] = useState(false)
  const [end, setEnd] = useState(String((book.pages_read || 0) + 1))
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const confirm = useConfirm()

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t) }, [])
  const elapsed = Math.floor(((pauseAt || now) - startAt - pausedMs) / 1000)
  const running = !pauseAt && !finishing

  function toggle() {
    if (pauseAt) { setPausedMs(p => p + (Date.now() - pauseAt)); setPauseAt(null) } else setPauseAt(Date.now())
  }
  async function close() {
    if (elapsed > 60) {
      const ok = await confirm({ title: 'Discard this session?', body: `You’ve been reading for ${fmtMinutes(Math.round(elapsed / 60))}. Closing without saving throws that time away.`, confirmLabel: 'Discard session' })
      if (!ok) return
    }
    onClose()
  }
  async function save(e) {
    e.preventDefault()
    const endPage = parseInt(end, 10)
    if (!(endPage > (book.pages_read || 0)) || busy) return
    setBusy(true)
    try {
      const [s, b] = await recordSession(book, book.pages_read || 0, endPage, Math.round(elapsed / 60))
      toast(`Logged ${plural(endPage - (book.pages_read || 0), 'page')} in ${fmtMinutes(Math.max(1, Math.round(elapsed / 60)))}`)
      onSaved(s, b)
    } catch { toast('Couldn’t save the session.', 'error'); setBusy(false) }
  }

  return (
    <Sheet open onClose={close} label="Reading session" width={460} title={<span className="text-ink font-medium">Reading</span>}>
      <div className="flex flex-col items-center text-center pt-4 pb-6">
        <div className="w-[110px]"><Cover book={book} /></div>
        <p className="font-serif text-[20px] font-medium mt-5 leading-snug" style={{ textWrap: 'balance' }}>{book.title}</p>
        <p className="font-serif text-[64px] leading-none tnum mt-6" role="timer">{fmtClock(elapsed)}</p>
        <p className="text-[13.5px] text-muted mt-2">{running ? `Started on page ${book.pages_read || 0}` : finishing ? 'Nice session' : 'Paused'}</p>
        {!finishing ? (
          <div className="flex gap-2 mt-8">
            <button onClick={toggle} className="btn btn-outline btn-lg">{pauseAt ? <><Play size={17} /> Resume</> : <><Pause size={17} /> Pause</>}</button>
            <button onClick={() => { if (!pauseAt) setPauseAt(Date.now()); setFinishing(true) }} className="btn btn-primary btn-lg"><Check size={17} /> Finish</button>
          </div>
        ) : (
          <form onSubmit={save} className="w-full max-w-[300px] mt-8">
            <label className="label text-left" htmlFor="endp">Which page did you reach?</label>
            <input id="endp" autoFocus type="number" inputMode="numeric" min={(book.pages_read || 0) + 1} max={book.total_pages || undefined}
              className="input h-12 text-center text-[20px] font-semibold tnum" value={end} onChange={e => setEnd(e.target.value)} />
            {book.total_pages > 0 && <p className="text-[12.5px] text-faint mt-1.5">of {book.total_pages}</p>}
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={() => { setFinishing(false); toggle() }} className="btn btn-outline flex-1">Keep reading</button>
              <button type="submit" disabled={busy || !(parseInt(end, 10) > (book.pages_read || 0))} className="btn btn-primary flex-1">Save session</button>
            </div>
          </form>
        )}
      </div>
    </Sheet>
  )
}

function LogSession({ open, book, onClose, onSaved }) {
  const [f, setF] = useState({ start: 0, end: 0, mins: 25 })
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  useEffect(() => { if (open) setF({ start: book.pages_read || 0, end: (book.pages_read || 0) + 10, mins: 25 }) }, [open])
  async function submit(e) {
    e.preventDefault()
    if (!(+f.end > +f.start) || busy) return
    setBusy(true)
    try { const [s, b] = await recordSession(book, +f.start, +f.end, +f.mins || 1); toast('Session logged'); onSaved(s, b) }
    catch { toast('Couldn’t log the session.', 'error') }
    finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Log a reading session" width={420}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          {[['start', 'From page'], ['end', 'To page'], ['mins', 'Minutes']].map(([k, l]) => (
            <label key={k}><span className="label">{l}</span>
              <input type="number" min="0" className="input tnum" value={f[k]} onChange={e => setF(p => ({ ...p, [k]: e.target.value }))} /></label>
          ))}
        </div>
        <p className="text-[13px] text-muted">{Math.max(0, f.end - f.start)} pages{+f.mins > 0 && f.end > f.start ? `, about ${((f.end - f.start) / f.mins).toFixed(1)} a minute` : ''}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-outline">Cancel</button>
          <button type="submit" disabled={busy || !(+f.end > +f.start)} className="btn btn-primary">Log session</button>
        </div>
      </form>
    </Dialog>
  )
}

function Finished({ open, book, onClose, onRate }) {
  return (
    <Dialog open={open} onClose={onClose} title="" width={420}>
      <div className="text-center pb-2">
        <div className="w-[96px] mx-auto rise-in"><Cover book={book} /></div>
        <p className="font-serif text-[30px] font-medium mt-6 rise-in" style={{ animationDelay: '120ms' }}>Finished.</p>
        <p className="text-[14px] text-muted mt-1">{book.title}, {plural(book.total_pages || book.pages_read || 0, 'page')}.</p>
        <div className="flex justify-center mt-6"><Stars value={book.rating || 0} onChange={onRate} size={28} /></div>
        <p className="text-[12.5px] text-faint mt-2">Rate it now, or add a review on the book’s page.</p>
        <button onClick={onClose} className="btn btn-primary mt-6">Done</button>
      </div>
    </Dialog>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Series detail
// ═══════════════════════════════════════════════════════════════
function SeriesDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const [s, setS] = useState(null)
  const [books, setBooks] = useState([])
  const [authors, setAuthors] = useState([])
  const { queue, flush, status, retry } = useAutosave((sid, p) => dbRun('Save series', () => sb.from('series').update(p).eq('id', sid)), 600)

  useEffect(() => {
    Promise.all([
      sb.from('series').select('*').eq('id', id).single(),
      sb.from('books').select('*').eq('series_id', id).order('series_order'),
      sb.from('authors').select('*'),
    ]).then(([a, b, c]) => {
      if (!a.data) { navigate('/library'); return }
      setS(a.data); setBooks(b.data || []); setAuthors(c.data || [])
    })
  }, [id])

  function set(p) { setS(x => ({ ...x, ...p })); queue(s.id, p) }

  async function remove() {
    const ok = await confirm({ title: `Delete the series “${s.name}”?`, body: books.length ? `The ${plural(books.length, 'book')} in it stay on your shelf. They just won’t belong to a series.` : 'This can’t be undone.', confirmLabel: 'Delete series' })
    if (!ok) return
    try {
      await dbRun('Unlink books', () => sb.from('books').update({ series_id: null, series_order: null }).eq('series_id', s.id))
      await dbRun('Delete series', () => sb.from('series').delete().eq('id', s.id))
      toast('Series deleted'); navigate('/library')
    } catch { toast('Couldn’t delete the series.', 'error') }
  }

  if (!s) return <PageLoader />
  const done = books.filter(b => b.status === 'completed').length
  return (
    <div className="max-w-[860px] mx-auto px-4 md:px-8 pt-6 md:pt-10">
      <div className="flex items-center gap-2 mb-6">
        <button onClick={async () => { await flush(); navigate('/library') }} className="btn btn-quiet btn-sm -ml-2"><ChevronLeft size={16} /> Library</button>
        <SaveState status={status} onRetry={retry} className="ml-auto" />
        <Menu items={[{ label: 'Delete series', icon: <Trash2 size={15} />, danger: true, onClick: remove }]} />
      </div>
      <input value={s.name} onChange={e => set({ name: e.target.value })} className="inline-edit font-serif text-[32px] md:text-[36px] font-medium" aria-label="Series name" />
      <textarea value={s.description || ''} onChange={e => { set({ description: e.target.value }); grow(e.target) }} ref={grow} rows={1}
        placeholder="Add a description" className="w-full bg-transparent outline-none resize-none text-[15px] text-muted mt-2 placeholder:text-faint" aria-label="Description" />
      <p className="text-[13.5px] text-muted mt-4">{done} of {plural(books.length, 'book')} read</p>
      <div className="h-1.5 rounded-full bg-line overflow-hidden mt-2 max-w-[320px]"><div className="h-full rounded-full" style={{ width: books.length ? `${(done / books.length) * 100}%` : 0, background: 'var(--m-library)' }} /></div>
      <ol className="mt-8 flex flex-col gap-2">
        {books.map(b => (
          <li key={b.id}>
            <Link to={`/library/book/${b.id}`} className="panel p-3 flex items-center gap-4 hover:shadow-[inset_0_0_0_1px_var(--c-line)]">
              <span className="w-6 text-center text-[13px] text-faint tnum">{b.series_order || '–'}</span>
              <div className="w-11"><Cover book={b} compact /></div>
              <div className="flex-1 min-w-0">
                <p className="text-[14.5px] font-medium truncate">{b.title}</p>
                <p className="text-[12.5px] text-muted">{[authors.find(a => a.id === b.author_id)?.name, STATUS[b.status]].filter(Boolean).join(', ')}</p>
              </div>
              {b.status === 'completed' && b.rating > 0 && <Stars value={b.rating} size={13} />}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}
