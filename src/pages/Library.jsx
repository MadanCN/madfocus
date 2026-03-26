import React, { useState, useEffect, useRef } from 'react'
import { Routes, Route, useNavigate, useParams } from 'react-router-dom'
import { sb, dbRun } from '../lib/supabase'
import { Modal, Confirm, Empty, useToast, PlusIcon, EditIcon, TrashIcon, Ring, Stars } from '../components/ui'

function uid()   { return Date.now().toString(36) + Math.random().toString(36).slice(2,6) }
function today() { return new Date().toISOString().slice(0,10) }

// ── ETA calc ──────────────────────────────────────────────────
function calcETA(book, sessions) {
  const bookSessions = sessions.filter(s=>s.book_id===book.id&&s.duration_min>0)
  if (bookSessions.length===0) return null
  const recentN = bookSessions.slice(-5)
  const avgPPM = recentN.reduce((a,s)=>a+((s.end_page-s.start_page)/s.duration_min),0)/recentN.length
  if (avgPPM<=0) return null
  const remaining = (book.total_pages||0) - (book.pages_read||0)
  const mins = Math.ceil(remaining/avgPPM)
  if (mins<60) return `~${mins} min left`
  const hrs = Math.floor(mins/60), m=mins%60
  return `~${hrs}h ${m>0?`${m}m`:''}`.trim()
}

// ═══════════════════════════════════════════════════════════════
//  Main Library router
// ═══════════════════════════════════════════════════════════════
export default function Library() {
  return (
    <Routes>
      <Route path="/"           element={<LibraryHome />} />
      <Route path="/book/:id"   element={<BookDetail />} />
      <Route path="/series/:id" element={<SeriesDetail />} />
    </Routes>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Library Home — tabs: Library / Reading / Series / Calendar
// ═══════════════════════════════════════════════════════════════
function LibraryHome() {
  const toast    = useToast()
  const navigate = useNavigate()
  const [tab, setTab]         = useState('library')
  const [books, setBooks]     = useState([])
  const [authors, setAuthors] = useState([])
  const [series, setSeries]   = useState([])
  const [sessions, setSessions] = useState([])
  const [goals, setGoals]     = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [readingSession, setReadingSession] = useState(null) // book for full-screen reading
  const [completionFlow, setCompletionFlow] = useState(null) // book being completed
  const [reviewForm, setReviewForm]         = useState({ rating:5, review:'' })
  const [showConfetti, setShowConfetti]     = useState(false)

  useEffect(() => {
    Promise.all([
      sb.from('books').select('*'),
      sb.from('authors').select('*'),
      sb.from('series').select('*'),
      sb.from('reading_sessions').select('*'),
      sb.from('reading_goals').select('*').eq('active',true).limit(1),
    ]).then(([{data:b},{data:a},{data:s},{data:rs},{data:g}]) => {
      setBooks(b||[]); setAuthors(a||[]); setSeries(s||[])
      setSessions(rs||[]); setGoals(g||[])
      setLoading(false)
    })
  }, [])

  async function saveBook(bookData) {
    try {
      await dbRun('Save book', ()=>sb.from('books').upsert(bookData))
      setBooks(p => {
        const exists = p.find(b=>b.id===bookData.id)
        return exists ? p.map(b=>b.id===bookData.id?bookData:b) : [bookData,...p]
      })
      toast('Book added ✓')
      setModal(false)
    } catch { toast('Save failed','error') }
  }

  async function deleteBook(id) {
    setBooks(p=>p.filter(b=>b.id!==id)); setConfirm(null)
    try { await dbRun('Delete', ()=>sb.from('books').delete().eq('id',id)); toast('Book removed ✓') }
    catch { toast('Delete failed','error') }
  }

  async function logSession(session) {
    try {
      await dbRun('Log session', ()=>sb.from('reading_sessions').insert(session))
      setSessions(p=>[...p, session])
      // Update book pages_read
      const book = books.find(b=>b.id===session.book_id)
      if (book) {
        const newPages = Math.max(book.pages_read||0, session.end_page)
        const completed = newPages >= (book.total_pages||0) && book.total_pages > 0
        const updBook = { ...book, pages_read:newPages, status: completed?'completed':'reading' }
        await dbRun('Update pages', ()=>sb.from('books').upsert(updBook))
        setBooks(p=>p.map(b=>b.id===book.id?updBook:b))
        if (completed && book.status!=='completed') {
          setShowConfetti(true)
          setTimeout(()=>setShowConfetti(false), 3500)
          setCompletionFlow(updBook)
          setReviewForm({ rating:5, review:'' })
        } else { toast(`📖 Session logged — ${session.end_page-session.start_page} pages`) }
      }
    } catch { toast('Log failed','error') }
  }

  async function saveReview() {
    if (!completionFlow) return
    const updated = { ...completionFlow, rating:reviewForm.rating, review:reviewForm.review, completed_at:today() }
    await dbRun('Save review', ()=>sb.from('books').upsert(updated))
    setBooks(p=>p.map(b=>b.id===completionFlow.id?updated:b))
    setCompletionFlow(null)
    toast('Review saved ✓')
  }

  const reading   = books.filter(b=>b.status==='reading')
  const unread    = books.filter(b=>b.status==='unread')
  const completed = books.filter(b=>b.status==='completed')

  if (loading) return <div className="flex items-center justify-center h-64 text-muted text-[13px]">Loading library…</div>

  return (
    <div className="p-9">
      {/* Header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="page-title">Library</h1>
          <p className="page-sub">{books.length} books · {completed.length} completed · {reading.length} reading</p>
        </div>
        <button className="btn btn-primary" onClick={()=>setModal(true)}>
          <PlusIcon className="w-3.5 h-3.5"/> Add book
        </button>
      </div>

      {/* Daily goal banner */}
      {goals.length>0 && <DailyGoalBanner goal={goals[0]} sessions={sessions}/>}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {[['library','Library'],['reading','Currently Reading'],['series','Series'],['calendar','Calendar']].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)}
            className={`px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-all
              ${tab===id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-text'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab==='library' && (
        <LibraryGrid books={books} authors={authors} series={series} sessions={sessions}
          onDelete={id=>setConfirm({id})} onNavigate={navigate} onStartReading={setReadingSession}/>
      )}
      {tab==='reading' && (
        <CurrentlyReading books={reading} authors={authors} sessions={sessions}
          onNavigate={navigate} onLogSession={logSession} onStartReading={setReadingSession}/>
      )}
      {tab==='series' && (
        <SeriesGrid series={series} books={books} authors={authors} onNavigate={navigate}/>
      )}
      {tab==='calendar' && (
        <ReadingCalendar sessions={sessions} books={books}/>
      )}

      {/* Add book modal */}
      {modal && (
        <AddBookModal
          authors={authors} series={series}
          onAddAuthor={async name=>{
            const a={id:uid(),name,bio:'',created_at:today()}
            await dbRun('Add author',()=>sb.from('authors').insert(a))
            setAuthors(p=>[...p,a]); return a
          }}
          onAddSeries={async name=>{
            const s={id:uid(),name,description:'',created_at:today()}
            await dbRun('Add series',()=>sb.from('series').insert(s))
            setSeries(p=>[...p,s]); return s
          }}
          onSave={saveBook}
          onClose={()=>setModal(false)}
        />
      )}

      {/* Full-screen reading session */}
      {readingSession && (
        <ReadingSessionOverlay
          book={readingSession}
          onFinish={async session => { await logSession(session); setReadingSession(null) }}
          onClose={()=>setReadingSession(null)}
        />
      )}

      {/* Confetti + Completion flow */}
      {showConfetti && <Confetti/>}
      {completionFlow && (
        <BookCompletionModal
          book={completionFlow}
          form={reviewForm}
          onChange={(k,v)=>setReviewForm(p=>({...p,[k]:v}))}
          onSave={saveReview}
          onClose={()=>setCompletionFlow(null)}
        />
      )}

      <Confirm open={!!confirm} title="Remove book?"
        body="This book and all its reading sessions will be deleted."
        onOk={()=>deleteBook(confirm.id)} onCancel={()=>setConfirm(null)}/>
    </div>
  )
}

// ── Library grid ──────────────────────────────────────────────
function LibraryGrid({ books, authors, series, sessions, onDelete, onNavigate, onStartReading }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const filtered = books.filter(b => {
    if (filter!=='all' && b.status!==filter) return false
    if (search && !b.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })
  return (
    <div>
      <div className="flex gap-2 flex-wrap items-center mb-5">
        <input className="form-input text-[12px] py-1.5 w-48" placeholder="Search books…"
          value={search} onChange={e=>setSearch(e.target.value)}/>
        {['all','unread','reading','completed','paused'].map(s=>(
          <button key={s} onClick={()=>setFilter(s)}
            className={`px-3 py-1.5 rounded-full border text-[12px] transition-all capitalize
              ${filter===s?'bg-text text-white border-text':'border-border text-muted hover:border-muted hover:text-text'}`}>
            {s}
          </button>
        ))}
      </div>
      {filtered.length===0
        ? <Empty icon={<BookIcon className="w-9 h-9 mx-auto"/>} title="No books here" sub="Add your first book to get started"/>
        : <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map(b=>(
              <BookCard key={b.id} book={b}
                author={authors.find(a=>a.id===b.author_id)}
                series={series.find(s=>s.id===b.series_id)}
                sessions={sessions}
                onOpen={()=>onNavigate(`/library/book/${b.id}`)}
                onDelete={()=>onDelete(b.id)}
                onStartReading={onStartReading}/>
            ))}
          </div>
      }
    </div>
  )
}

// ── Book card ─────────────────────────────────────────────────
function BookCard({ book, author, series, sessions, onOpen, onDelete, onStartReading }) {
  const eta = calcETA(book, sessions)
  const pct = book.total_pages>0 ? Math.round(((book.pages_read||0)/book.total_pages)*100) : 0
  const STATUS_COLORS = { unread:'#c4c0ba', reading:'#b8860b', completed:'#2d5a3d', paused:'#8a8680' }

  return (
    <div className="group relative cursor-pointer" onClick={onOpen}>
      {/* Cover */}
      <div className="aspect-[2/3] rounded-[8px] overflow-hidden bg-border-light mb-2 relative shadow-card">
        {book.cover_url
          ? <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover"/>
          : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent-light to-accent-mid">
              <BookIcon className="w-8 h-8 text-accent opacity-50"/>
            </div>
        }
        {/* Status badge */}
        <div className="absolute top-2 left-2">
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded capitalize text-white"
            style={{background:STATUS_COLORS[book.status]||'#ccc'}}>
            {book.status}
          </span>
        </div>
        {/* Progress bar for reading */}
        {book.status==='reading' && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
            <div className="h-full bg-warn transition-all" style={{width:`${pct}%`}}/>
          </div>
        )}
        {/* Delete on hover */}
        <button onClick={e=>{e.stopPropagation();onDelete()}}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center transition-opacity text-[11px]">
          ✕
        </button>
      </div>
      {/* Info */}
      <p className="text-[13px] font-medium leading-snug truncate">{book.title}</p>
      {author && <p className="text-[11px] text-muted truncate">{author.name}</p>}
      {series && <p className="text-[10px] text-accent truncate">#{book.series_order} {series.name}</p>}
      {book.status==='reading' && (
        <div className="mt-1">
          <p className="text-[10px] text-muted">{pct}% · {eta||'Log sessions for ETA'}</p>
        </div>
      )}
      {book.status==='completed' && book.rating && (
        <Stars value={book.rating} size="sm"/>
      )}
      {book.status!=='completed' && (
        <button
          className="mt-2 w-full text-[11px] font-medium py-1.5 rounded-[6px] border border-accent text-accent hover:bg-accent hover:text-white transition-all"
          onClick={e=>{ e.stopPropagation(); onStartReading(book) }}
        >
          {book.status==='reading' ? '▶ Continue' : '▶ Start Reading'}
        </button>
      )}
    </div>
  )
}

// ── Currently Reading ─────────────────────────────────────────
function CurrentlyReading({ books, authors, sessions, onNavigate, onLogSession, onStartReading }) {
  const [logModal, setLogModal] = useState(null)

  if (books.length===0) return (
    <Empty icon={<BookIcon className="w-9 h-9 mx-auto"/>}
      title="Not reading anything" sub="Add a book and mark it as Reading"/>
  )
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {books.map(book => {
        const author = authors.find(a=>a.id===book.author_id)
        const pct = book.total_pages>0 ? Math.round(((book.pages_read||0)/book.total_pages)*100) : 0
        const eta = calcETA(book, sessions)
        const bookSessions = sessions.filter(s=>s.book_id===book.id)
        const totalMins = bookSessions.reduce((a,s)=>a+s.duration_min,0)
        return (
          <div key={book.id} className="bg-surface border border-border rounded-card p-5">
            <div className="flex gap-4 mb-4">
              {/* Cover */}
              <div className="w-16 flex-shrink-0 aspect-[2/3] rounded-[6px] overflow-hidden bg-border-light cursor-pointer" onClick={()=>onNavigate(`/library/book/${book.id}`)}>
                {book.cover_url
                  ? <img src={book.cover_url} alt="" className="w-full h-full object-cover"/>
                  : <div className="w-full h-full bg-accent-light flex items-center justify-center"><BookIcon className="w-5 h-5 text-accent opacity-50"/></div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-[15px] leading-snug mb-0.5">{book.title}</h3>
                {author && <p className="text-[12px] text-muted mb-2">{author.name}</p>}
                <div className="flex gap-2 text-[11px] text-muted flex-wrap">
                  <span>{book.pages_read||0} / {book.total_pages||'?'} pages</span>
                  <span>·</span>
                  <span>{totalMins} min read</span>
                  {eta && <><span>·</span><span className="text-accent font-medium">{eta}</span></>}
                </div>
              </div>
            </div>
            {/* Progress */}
            <div className="mb-4">
              <div className="flex justify-between text-[11px] text-muted mb-1">
                <span>{pct}% complete</span>
                <span>{(book.total_pages||0)-(book.pages_read||0)} pages left</span>
              </div>
              <div className="h-2 bg-border-light rounded-full overflow-hidden">
                <div className="h-full bg-warn rounded-full transition-all duration-500" style={{width:`${pct}%`}}/>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary flex-1" onClick={()=>onStartReading(book)}>
                ▶ Start Reading
              </button>
              <button className="btn btn-ghost" onClick={()=>setLogModal(book)} title="Log session manually">
                📖
              </button>
            </div>
          </div>
        )
      })}
      {logModal && (
        <LogSessionModal book={logModal} onSave={async s=>{await onLogSession(s);setLogModal(null)}} onClose={()=>setLogModal(null)}/>
      )}
    </div>
  )
}

// ── Series grid ───────────────────────────────────────────────
function SeriesGrid({ series, books, authors, onNavigate }) {
  if (series.length===0) return (
    <Empty icon={<BookIcon className="w-9 h-9 mx-auto"/>}
      title="No series yet" sub="When adding a book, assign it to a series"/>
  )
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {series.map(s=>{
        const seriesBooks = books.filter(b=>b.series_id===s.id).sort((a,b)=>(a.series_order||0)-(b.series_order||0))
        const done = seriesBooks.filter(b=>b.status==='completed').length
        return (
          <div key={s.id} className="bg-surface border border-border rounded-card p-5 cursor-pointer hover:shadow-md hover:border-faint transition-all"
            onClick={()=>onNavigate(`/library/series/${s.id}`)}>
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-serif text-[17px] leading-snug">{s.name}</h3>
              <span className="text-[11px] text-muted ml-2 flex-shrink-0">{done}/{seriesBooks.length} read</span>
            </div>
            {/* Mini covers */}
            <div className="flex gap-1.5 mb-3">
              {seriesBooks.slice(0,5).map(b=>(
                <div key={b.id} className={`w-10 aspect-[2/3] rounded-[4px] overflow-hidden flex-shrink-0 border-2
                  ${b.status==='completed'?'border-accent':'border-border'}`}>
                  {b.cover_url
                    ? <img src={b.cover_url} alt="" className="w-full h-full object-cover"/>
                    : <div className="w-full h-full bg-accent-light"/>
                  }
                </div>
              ))}
              {seriesBooks.length>5&&<div className="w-10 aspect-[2/3] rounded-[4px] bg-border-light flex items-center justify-center text-[11px] text-muted">+{seriesBooks.length-5}</div>}
            </div>
            <div className="h-1.5 bg-border-light rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full" style={{width:seriesBooks.length>0?`${(done/seriesBooks.length)*100}%`:'0%'}}/>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Reading Calendar ──────────────────────────────────────────
function ReadingCalendar({ sessions, books }) {
  const [month, setMonth] = useState(new Date())

  const year = month.getFullYear(), m = month.getMonth()
  const firstDay = new Date(year, m, 1).getDay()
  const daysInMonth = new Date(year, m+1, 0).getDate()

  // Group sessions by date
  const byDate = {}
  sessions.forEach(s=>{
    if (!byDate[s.date]) byDate[s.date]=[]
    const book = books.find(b=>b.id===s.book_id)
    if (book&&!byDate[s.date].find(b=>b.id===book.id)) byDate[s.date].push(book)
  })

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <button onClick={()=>setMonth(d=>{const n=new Date(d);n.setMonth(n.getMonth()-1);return n})} className="btn btn-ghost btn-sm btn-icon">←</button>
        <h3 className="font-medium text-[15px]">
          {month.toLocaleDateString('en-GB',{month:'long',year:'numeric'})}
        </h3>
        <button onClick={()=>setMonth(d=>{const n=new Date(d);n.setMonth(n.getMonth()+1);return n})} className="btn btn-ghost btn-sm btn-icon">→</button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>(
          <div key={d} className="text-center text-[11px] text-muted font-medium py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({length:firstDay}).map((_,i)=><div key={`e${i}`}/>)}
        {Array.from({length:daysInMonth},(_,i)=>{
          const d = i+1
          const dateStr = `${year}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
          const dayBooks = byDate[dateStr]||[]
          const isToday = dateStr===today()
          return (
            <div key={d} className={`aspect-square rounded-[6px] p-1 border flex flex-col items-center
              ${isToday?'border-accent bg-accent-light':'border-border-light'}
              ${dayBooks.length>0?'cursor-default':''}`}>
              <span className={`text-[11px] font-medium ${isToday?'text-accent':'text-muted'}`}>{d}</span>
              <div className="flex flex-wrap gap-0.5 mt-0.5 justify-center">
                {dayBooks.slice(0,3).map(b=>(
                  <div key={b.id} className="w-4 h-6 rounded-[2px] overflow-hidden flex-shrink-0" title={b.title}>
                    {b.cover_url
                      ? <img src={b.cover_url} alt="" className="w-full h-full object-cover"/>
                      : <div className="w-full h-full bg-accent-mid"/>
                    }
                  </div>
                ))}
                {dayBooks.length>3&&<div className="w-4 h-6 rounded-[2px] bg-border-light flex items-center justify-center text-[8px] text-muted">+{dayBooks.length-3}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Daily goal banner ─────────────────────────────────────────
function DailyGoalBanner({ goal, sessions }) {
  const todaySessions = sessions.filter(s=>s.date===today())
  const current = goal.goal_type==='minutes'
    ? todaySessions.reduce((a,s)=>a+s.duration_min,0)
    : todaySessions.reduce((a,s)=>a+(s.end_page-s.start_page),0)
  const pct = Math.min(100, Math.round((current/goal.target)*100))
  const done = current >= goal.target

  return (
    <div className={`mb-5 p-4 rounded-card border flex items-center gap-4
      ${done?'bg-accent-light border-accent':'bg-surface border-border'}`}>
      <Ring pct={pct} size={44} stroke={4} color={done?'#2d5a3d':'#b8860b'}>
        <span className="text-[9px] font-bold" style={{color:done?'#2d5a3d':'#b8860b'}}>{pct}%</span>
      </Ring>
      <div>
        <p className="text-[13px] font-medium">
          {done ? '🎉 Daily goal complete!' : 'Daily reading goal'}
        </p>
        <p className="text-[12px] text-muted">
          {current} / {goal.target} {goal.goal_type} today
        </p>
      </div>
      {done && <span className="ml-auto text-accent text-[20px]">✓</span>}
    </div>
  )
}

// ── Log session modal ─────────────────────────────────────────
function LogSessionModal({ book, onSave, onClose }) {
  const [form, setForm] = useState({ start_page: book.pages_read||0, end_page: book.pages_read||0, duration_min: 25 })
  const [timer, setTimer] = useState({ running:false, secs:0 })
  const timerRef = useRef(null)

  useEffect(()=>{
    if (timer.running) {
      timerRef.current = setInterval(()=>setTimer(t=>({...t,secs:t.secs+1})),1000)
    } else { clearInterval(timerRef.current) }
    return ()=>clearInterval(timerRef.current)
  },[timer.running])

  function stopTimer() {
    setTimer(t=>({...t,running:false}))
    setForm(p=>({...p,duration_min:Math.ceil(timer.secs/60)||1}))
  }

  async function submit() {
    if (form.end_page<=form.start_page) return
    const session = { id:uid(), book_id:book.id, date:today(),
      start_page:+form.start_page, end_page:+form.end_page,
      duration_min:+form.duration_min||1, created_at:new Date().toISOString() }
    await onSave(session)
  }

  const timerMins = String(Math.floor(timer.secs/60)).padStart(2,'0')
  const timerSecs = String(timer.secs%60).padStart(2,'0')

  return (
    <Modal open onClose={onClose} title={`Log session — ${book.title}`} width="max-w-md">
      <div className="space-y-4">
        {/* Timer */}
        <div className="bg-bg rounded-[8px] p-4 text-center">
          <div className="font-serif text-[36px] leading-none mb-3">{timerMins}:{timerSecs}</div>
          <div className="flex gap-2 justify-center">
            <button onClick={()=>setTimer(t=>({...t,running:!t.running}))} className="btn btn-primary">
              {timer.running?'Pause':'Start timer'}
            </button>
            {timer.secs>0&&timer.running===false&&(
              <button onClick={stopTimer} className="btn btn-ghost">Use this time</button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="form-label">Start page</label>
            <input className="form-input" type="number" min="0" value={form.start_page}
              onChange={e=>setForm(p=>({...p,start_page:+e.target.value}))}/>
          </div>
          <div>
            <label className="form-label">End page</label>
            <input className="form-input" type="number" min={form.start_page+1} value={form.end_page}
              onChange={e=>setForm(p=>({...p,end_page:+e.target.value}))}/>
          </div>
          <div>
            <label className="form-label">Minutes</label>
            <input className="form-input" type="number" min="1" value={form.duration_min}
              onChange={e=>setForm(p=>({...p,duration_min:+e.target.value}))}/>
          </div>
        </div>

        <p className="text-[12px] text-muted">
          Pages: {Math.max(0,form.end_page-form.start_page)} · 
          Speed: {form.duration_min>0?Math.round((form.end_page-form.start_page)/form.duration_min*100)/100:0} p/min
        </p>

        <div className="flex gap-2 justify-end">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={form.end_page<=form.start_page}>
            Log session
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Add book modal ────────────────────────────────────────────
function AddBookModal({ authors, series, onAddAuthor, onAddSeries, onSave, onClose }) {
  const [form, setForm] = useState({
    id: uid(), title:'', author_id:'', series_id:'', series_order:'',
    cover_url:'', description:'', total_pages:'', genres:[], status:'unread', pages_read:0
  })
  const [newAuthor, setNewAuthor] = useState('')
  const [newSeries, setNewSeries] = useState('')
  const [genreInput, setGenreInput] = useState('')
  const [saving, setSaving] = useState(false)
  const f = (k,v) => setForm(p=>({...p,[k]:v}))

  function handleCoverFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => f('cover_url', ev.target.result)
    reader.readAsDataURL(file)
  }

  async function handleSave() {
    if (!form.title.trim()) return
    setSaving(true)
    await onSave({ ...form, total_pages:+form.total_pages||0, pages_read:+form.pages_read||0,
                   series_order:form.series_order?+form.series_order:null, created_at:today() })
    setSaving(false)
  }

  return (
    <Modal open onClose={onClose} title="Add book" width="max-w-xl">
      <div className="space-y-4">

        {/* Cover — at top */}
        <div>
          <label className="form-label">Cover image</label>
          <div className="flex gap-4 items-start">
            <div className="w-20 flex-shrink-0 aspect-[2/3] rounded-[6px] overflow-hidden bg-border-light flex items-center justify-center shadow-sm">
              {form.cover_url
                ? <img src={form.cover_url} alt="" className="w-full h-full object-cover"/>
                : <BookIcon className="w-6 h-6 text-faint"/>
              }
            </div>
            <div className="flex-1">
              <label className="block w-full cursor-pointer">
                <div className="border-2 border-dashed border-border rounded-[8px] p-4 text-center hover:border-faint transition-colors">
                  <p className="text-[12px] text-muted">Click to select a file</p>
                  <p className="text-[11px] text-faint mt-0.5">JPG, PNG, WebP</p>
                </div>
                <input type="file" accept="image/*" className="sr-only" onChange={handleCoverFile}/>
              </label>
              {form.cover_url && (
                <button className="text-[11px] text-danger mt-1.5 hover:underline" onClick={()=>f('cover_url','')}>Remove</button>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="form-label">Title *</label>
          <input className="form-input" placeholder="Book title" autoFocus value={form.title} onChange={e=>f('title',e.target.value)}/>
        </div>

        {/* Author */}
        <div>
          <label className="form-label">Author</label>
          <select className="form-select mb-1" value={form.author_id} onChange={e=>f('author_id',e.target.value)}>
            <option value="">Select author…</option>
            {authors.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <div className="flex gap-2">
            <input className="form-input flex-1 text-[12px] py-1.5" placeholder="Or create new author…"
              value={newAuthor} onChange={e=>setNewAuthor(e.target.value)}/>
            <button className="btn btn-ghost btn-sm" onClick={async()=>{
              if (!newAuthor.trim()) return
              const a = await onAddAuthor(newAuthor.trim())
              f('author_id',a.id); setNewAuthor('')
            }}>Add</button>
          </div>
        </div>

        <div>
          <label className="form-label">Description</label>
          <textarea className="form-textarea" rows={2} placeholder="Short synopsis…" value={form.description} onChange={e=>f('description',e.target.value)}/>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Total pages</label>
            <input className="form-input" type="number" min="1" value={form.total_pages} onChange={e=>f('total_pages',e.target.value)}/>
          </div>
          <div>
            <label className="form-label">Status</label>
            <select className="form-select" value={form.status} onChange={e=>f('status',e.target.value)}>
              <option value="unread">Unread</option>
              <option value="reading">Currently reading</option>
              <option value="completed">Completed</option>
              <option value="paused">Paused</option>
            </select>
          </div>
        </div>

        {/* Genres */}
        <div>
          <label className="form-label">Genres / Tags</label>
          <div className="flex gap-2">
            <input className="form-input flex-1 text-[12px] py-1.5" placeholder="e.g. Fantasy, Sci-Fi…"
              value={genreInput} onChange={e=>setGenreInput(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'&&genreInput.trim()){f('genres',[...form.genres,genreInput.trim()]);setGenreInput('')}}}/>
            <button className="btn btn-ghost btn-sm" onClick={()=>{if(genreInput.trim()){f('genres',[...form.genres,genreInput.trim()]);setGenreInput('')}}}>Add</button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {form.genres.map(g=>(
              <span key={g} className="inline-flex items-center gap-1 bg-border-light text-muted text-[12px] px-2.5 py-0.5 rounded-full">
                {g}<button onClick={()=>f('genres',form.genres.filter(x=>x!==g))} className="text-faint hover:text-danger">×</button>
              </span>
            ))}
          </div>
        </div>

        {/* Series */}
        <div>
          <label className="form-label">Series</label>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <select className="form-select" value={form.series_id} onChange={e=>f('series_id',e.target.value)}>
                <option value="">Not part of a series</option>
                {series.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <input className="form-input" type="number" min="1" placeholder="Book #"
                value={form.series_order} onChange={e=>f('series_order',e.target.value)} disabled={!form.series_id}/>
            </div>
          </div>
          <div className="flex gap-2 mt-1">
            <input className="form-input flex-1 text-[12px] py-1.5" placeholder="Or create new series…"
              value={newSeries} onChange={e=>setNewSeries(e.target.value)}/>
            <button className="btn btn-ghost btn-sm" onClick={async()=>{
              if (!newSeries.trim()) return
              const s = await onAddSeries(newSeries.trim())
              f('series_id',s.id); setNewSeries('')
            }}>Add</button>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving||!form.title.trim()}>
            {saving?'Saving…':'Add book'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Book completion modal ─────────────────────────────────────
function BookCompletionModal({ book, form, onChange, onSave, onClose }) {
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm"/>
      <div className="relative bg-surface rounded-[20px] shadow-md p-8 w-[440px] max-w-[94vw] text-center z-[501]">
        <div className="text-[48px] mb-3">🎉</div>
        <h2 className="font-serif text-[24px] mb-1">You finished it!</h2>
        <p className="text-muted text-[14px] mb-6">Congratulations on completing <strong>{book.title}</strong></p>

        <div className="text-left mb-5">
          <label className="form-label mb-3">Your rating</label>
          <Stars value={form.rating} onChange={v=>onChange('rating',v)}/>
        </div>

        <div className="text-left mb-5">
          <label className="form-label">Your review</label>
          <textarea className="form-textarea" rows={4} placeholder="What did you think? Would you recommend it?"
            value={form.review} onChange={e=>onChange('review',e.target.value)}/>
        </div>

        <div className="flex gap-2">
          <button className="btn btn-ghost flex-1" onClick={onClose}>Skip</button>
          <button className="btn btn-primary flex-1" onClick={onSave}>Save review</button>
        </div>
      </div>
    </div>
  )
}

// ── Book detail page ──────────────────────────────────────────
function BookDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [book, setBook]       = useState(null)
  const [author, setAuthor]   = useState(null)
  const [series, setSeries]   = useState(null)
  const [sessions, setSessions] = useState([])
  const [logOpen, setLogOpen] = useState(false)

  useEffect(()=>{
    Promise.all([
      sb.from('books').select('*').eq('id',id).single(),
      sb.from('reading_sessions').select('*').eq('book_id',id).order('date',{ascending:false}),
    ]).then(([{data:b},{data:s}])=>{
      if (b) {
        setBook(b)
        if (b.author_id) sb.from('authors').select('*').eq('id',b.author_id).single().then(({data})=>setAuthor(data))
        if (b.series_id) sb.from('series').select('*').eq('id',b.series_id).single().then(({data})=>setSeries(data))
      }
      setSessions(s||[])
    })
  },[id])

  async function logSession(session) {
    await dbRun('Log session', ()=>sb.from('reading_sessions').insert(session))
    const newPages = Math.max(book.pages_read||0, session.end_page)
    const updBook = { ...book, pages_read:newPages, status: newPages>=(book.total_pages||0)&&book.total_pages>0?'completed':'reading' }
    await dbRun('Update book', ()=>sb.from('books').upsert(updBook))
    setBook(updBook); setSessions(p=>[session,...p])
    toast('Session logged ✓'); setLogOpen(false)
  }

  if (!book) return <div className="flex items-center justify-center h-64 text-muted">Loading…</div>

  const pct = book.total_pages>0 ? Math.round(((book.pages_read||0)/book.total_pages)*100) : 0
  const eta = calcETA(book, sessions)
  const totalMins = sessions.reduce((a,s)=>a+s.duration_min,0)

  return (
    <div className="p-9 max-w-[860px]">
      <button onClick={()=>navigate('/library')} className="btn btn-ghost btn-sm mb-6">← Back to library</button>

      <div className="flex gap-8 mb-8">
        {/* Cover */}
        <div className="w-32 flex-shrink-0">
          <div className="aspect-[2/3] rounded-[8px] overflow-hidden bg-border-light shadow-md">
            {book.cover_url
              ? <img src={book.cover_url} alt="" className="w-full h-full object-cover"/>
              : <div className="w-full h-full bg-accent-light flex items-center justify-center"><BookIcon className="w-8 h-8 text-accent opacity-40"/></div>
            }
          </div>
        </div>
        {/* Info */}
        <div className="flex-1">
          <h1 className="font-serif text-[28px] leading-tight mb-1">{book.title}</h1>
          {author && <p className="text-muted text-[14px] mb-1">{author.name}</p>}
          {series && (
            <button onClick={()=>navigate(`/library/series/${series.id}`)}
              className="text-accent text-[13px] hover:underline mb-2 block">
              📚 {series.name} #{book.series_order}
            </button>
          )}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {(book.genres||[]).map(g=><span key={g} className="tag bg-border-light text-muted">{g}</span>)}
          </div>
          {book.description && <p className="text-[13px] text-muted leading-relaxed mb-4">{book.description}</p>}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              ['Pages read', `${book.pages_read||0} / ${book.total_pages||'?'}`],
              ['Time spent', `${totalMins} min`],
              ['ETA', eta||'—'],
            ].map(([label,val])=>(
              <div key={label} className="bg-bg rounded-[8px] p-3">
                <p className="text-[10px] text-muted uppercase tracking-wide mb-1">{label}</p>
                <p className="text-[15px] font-semibold">{val}</p>
              </div>
            ))}
          </div>

          {/* Progress */}
          {book.total_pages>0 && (
            <div className="mb-4">
              <div className="flex justify-between text-[11px] text-muted mb-1">
                <span>{pct}% complete</span>
                <span>{(book.total_pages||0)-(book.pages_read||0)} pages left</span>
              </div>
              <div className="h-2 bg-border-light rounded-full overflow-hidden">
                <div className="h-full bg-warn rounded-full transition-all duration-500" style={{width:`${pct}%`}}/>
              </div>
            </div>
          )}

          {book.status==='reading' && (
            <button className="btn btn-primary" onClick={()=>setLogOpen(true)}>📖 Log reading session</button>
          )}
          {book.status==='completed' && book.rating && (
            <div className="flex items-center gap-2">
              <Stars value={book.rating} size="md"/>
              <span className="text-[13px] text-muted">Your rating</span>
            </div>
          )}
        </div>
      </div>

      {book.status==='completed' && book.review && (
        <div className="bg-surface border border-border rounded-card p-5 mb-6">
          <h3 className="text-[13px] font-medium mb-2">Your review</h3>
          <p className="text-[13px] text-muted leading-relaxed">{book.review}</p>
        </div>
      )}

      {/* Sessions list */}
      {sessions.length>0 && (
        <div>
          <h3 className="text-[13px] font-medium text-muted uppercase tracking-wide mb-3">Reading sessions</h3>
          <div className="flex flex-col gap-1.5">
            {sessions.map(s=>(
              <div key={s.id} className="flex items-center gap-4 bg-surface border border-border rounded-[8px] px-4 py-3 text-[13px]">
                <span className="text-muted w-24 flex-shrink-0">{new Date(s.date+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>
                <span className="font-medium">pp. {s.start_page}–{s.end_page}</span>
                <span className="text-muted">{s.end_page-s.start_page} pages</span>
                <span className="ml-auto text-muted">{s.duration_min} min</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {logOpen && <LogSessionModal book={book} onSave={logSession} onClose={()=>setLogOpen(false)}/>}
    </div>
  )
}

// ── Series detail page ────────────────────────────────────────
function SeriesDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [series, setSeries]   = useState(null)
  const [books, setBooks]     = useState([])
  const [authors, setAuthors] = useState([])

  useEffect(()=>{
    Promise.all([
      sb.from('series').select('*').eq('id',id).single(),
      sb.from('books').select('*').eq('series_id',id).order('series_order'),
      sb.from('authors').select('*'),
    ]).then(([{data:s},{data:b},{data:a}])=>{
      setSeries(s); setBooks(b||[]); setAuthors(a||[])
    })
  },[id])

  if (!series) return <div className="flex items-center justify-center h-64 text-muted">Loading…</div>
  const done = books.filter(b=>b.status==='completed').length

  return (
    <div className="p-9 max-w-[860px]">
      <button onClick={()=>navigate('/library')} className="btn btn-ghost btn-sm mb-6">← Back to library</button>
      <div className="mb-7">
        <h1 className="font-serif text-[28px]">{series.name}</h1>
        <p className="text-muted text-[14px] mt-1">{done} of {books.length} books read</p>
        <div className="h-1.5 bg-border-light rounded-full overflow-hidden mt-2 max-w-xs">
          <div className="h-full bg-accent rounded-full" style={{width:books.length>0?`${(done/books.length)*100}%`:'0%'}}/>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {books.map(b=>{
          const author = authors.find(a=>a.id===b.author_id)
          const pct = b.total_pages>0?Math.round(((b.pages_read||0)/b.total_pages)*100):0
          return (
            <div key={b.id} onClick={()=>navigate(`/library/book/${b.id}`)}
              className="flex gap-4 bg-surface border border-border rounded-card p-4 cursor-pointer hover:shadow-card hover:border-faint transition-all">
              <div className="w-12 flex-shrink-0 aspect-[2/3] rounded-[5px] overflow-hidden bg-border-light">
                {b.cover_url?<img src={b.cover_url} alt="" className="w-full h-full object-cover"/>
                  :<div className="w-full h-full bg-accent-light"/>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[11px] text-muted">Book {b.series_order}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize font-medium
                    ${b.status==='completed'?'bg-accent-light text-accent':b.status==='reading'?'bg-warn-light text-warn':'bg-border-light text-muted'}`}>
                    {b.status}
                  </span>
                </div>
                <p className="font-medium text-[14px] truncate">{b.title}</p>
                {author&&<p className="text-[12px] text-muted">{author.name}</p>}
                {b.status==='reading'&&(
                  <div className="mt-2 h-1 bg-border-light rounded-full overflow-hidden max-w-[200px]">
                    <div className="h-full bg-warn rounded-full" style={{width:`${pct}%`}}/>
                  </div>
                )}
                {b.status==='completed'&&b.rating&&<Stars value={b.rating} size="sm"/>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Reading session overlay ───────────────────────────────────
function ReadingSessionOverlay({ book, onFinish, onClose }) {
  const [secs, setSecs]         = useState(0)
  const [running, setRunning]   = useState(true)
  const [showFinish, setShowFinish] = useState(false)
  const [endPage, setEndPage]   = useState((book.pages_read||0) + 1)
  const intervalRef             = useRef(null)

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setSecs(s => s + 1), 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [running])

  const mins     = String(Math.floor(secs / 60)).padStart(2, '0')
  const secsDisp = String(secs % 60).padStart(2, '0')
  const durationMin = Math.ceil(secs / 60) || 1

  function handleFinish() {
    setRunning(false)
    setShowFinish(true)
  }

  async function handleSave() {
    if (endPage <= (book.pages_read||0)) return
    const session = {
      id: uid(), book_id: book.id, date: today(),
      start_page: book.pages_read||0,
      end_page: endPage,
      duration_min: durationMin,
      created_at: new Date().toISOString()
    }
    await onFinish(session)
  }

  return (
    <div className="fixed inset-0 z-[800] bg-surface flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-border">
        <div className="flex items-center gap-4">
          {book.cover_url && (
            <div className="w-8 aspect-[2/3] rounded-[4px] overflow-hidden flex-shrink-0 shadow-sm">
              <img src={book.cover_url} alt="" className="w-full h-full object-cover"/>
            </div>
          )}
          <div>
            <h2 className="font-serif text-[17px] leading-tight">{book.title}</h2>
            <p className="text-[11px] text-muted">Reading session in progress</p>
          </div>
        </div>
        <button onClick={onClose} className="btn btn-ghost btn-sm text-muted">✕ Close</button>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        {/* Cover */}
        <div className="w-28 aspect-[2/3] rounded-[10px] overflow-hidden bg-border-light shadow-md">
          {book.cover_url
            ? <img src={book.cover_url} alt="" className="w-full h-full object-cover"/>
            : <div className="w-full h-full bg-accent-light flex items-center justify-center">
                <BookIcon className="w-10 h-10 text-accent opacity-40"/>
              </div>
          }
        </div>

        {/* Timer */}
        <div className="text-center">
          <div className="font-serif text-[72px] leading-none text-text tabular-nums">{mins}:{secsDisp}</div>
          <p className="text-[13px] text-muted mt-1">{running ? 'Reading…' : 'Paused'}</p>
        </div>

        {/* Controls / Finish form */}
        {!showFinish ? (
          <div className="flex gap-3">
            <button className="btn btn-ghost px-8" onClick={()=>setRunning(r=>!r)}>
              {running ? 'Pause' : 'Resume'}
            </button>
            <button className="btn btn-primary px-8" onClick={handleFinish}>
              Finish
            </button>
          </div>
        ) : (
          <div className="bg-bg border border-border rounded-[14px] p-6 w-[300px] text-center">
            <p className="font-serif text-[18px] mb-1">Session complete</p>
            <p className="text-[12px] text-muted mb-5">{mins}:{secsDisp} · {durationMin} min</p>
            <label className="form-label text-left block mb-1.5">What page did you reach?</label>
            <input
              className="form-input mb-1 text-center text-[20px] font-medium"
              type="number"
              min={(book.pages_read||0)+1}
              max={book.total_pages||9999}
              value={endPage}
              onChange={e=>setEndPage(+e.target.value)}
              autoFocus
            />
            {book.total_pages>0 && (
              <p className="text-[11px] text-muted mb-4">
                {Math.max(0, endPage-(book.pages_read||0))} pages read · {book.total_pages} total
              </p>
            )}
            <div className="flex gap-2">
              <button className="btn btn-ghost flex-1" onClick={onClose}>Skip</button>
              <button className="btn btn-primary flex-1" onClick={handleSave}
                disabled={endPage<=(book.pages_read||0)}>
                Save & finish
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Confetti ──────────────────────────────────────────────────
function Confetti() {
  const colors = ['#2d5a3d','#b8860b','#c0392b','#2563eb','#c8dece','#fdf8ec']
  const pieces = Array.from({length:60},(_,i)=>({
    id:i, x:Math.random()*100, delay:Math.random()*1.5,
    color:colors[Math.floor(Math.random()*colors.length)],
    size: Math.random()*8+4
  }))
  return (
    <div className="fixed inset-0 pointer-events-none z-[600] overflow-hidden">
      {pieces.map(p=>(
        <div key={p.id} className="absolute animate-bounce"
          style={{ left:`${p.x}%`, top:'-10px', width:p.size, height:p.size,
                   background:p.color, borderRadius:'2px',
                   animationDelay:`${p.delay}s`, animationDuration:'1s',
                   transform:`rotate(${Math.random()*360}deg)` }}>
          <style>{`
            @keyframes fall-${p.id} { to { transform: translateY(110vh) rotate(${Math.random()*720}deg); } }
          `}</style>
        </div>
      ))}
    </div>
  )
}

function BookIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> }
