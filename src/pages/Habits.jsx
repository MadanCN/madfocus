import React, { useState, useEffect } from 'react'
import { sb, dbRun } from '../lib/supabase'
import { Modal, Confirm, Empty, useToast, PlusIcon, TrashIcon } from '../components/ui'

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6) }
function today() { return new Date().toISOString().slice(0,10) }

function habitToRow(h) {
  return { id:h.id, name:h.name, freq:h.freq, track_type:h.trackType, variants:h.variants||[], category:h.category||'', created_at:h.createdAt }
}
function rowToHabit(r) {
  return { id:r.id, name:r.name, freq:r.freq, trackType:r.track_type, variants:r.variants||[], category:r.category||'', createdAt:r.created_at }
}

const BLANK_HABIT = { name:'', freq:'daily', trackType:'simple', variants:[], category:'' }

const CATEGORY_LIST = ['Health','Mind','Creativity','Learning','Relationships','Finance','Spirituality','Work','Other']

function CategoryIcon({ cat, className = 'w-4 h-4' }) {
  const p = { className, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2, strokeLinecap:'round', strokeLinejoin:'round' }
  switch(cat) {
    case 'Health':        return <svg {...p}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
    case 'Mind':          return <svg {...p}><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2z"/></svg>
    case 'Creativity':    return <svg {...p}><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>
    case 'Learning':      return <svg {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
    case 'Relationships': return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    case 'Finance':       return <svg {...p}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
    case 'Spirituality':  return <svg {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
    case 'Work':          return <svg {...p}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
    default:              return <svg {...p}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
  }
}

export default function Habits() {
  const toast = useToast()
  const [habits, setHabits]       = useState([])
  const [logs, setLogs]           = useState({}) // { habitId: [{date, variant}] }
  const [writingLogs, setWritingLogs] = useState([]) // [{id,date,chapters,word_count}]
  const [writingForm, setWritingForm] = useState({ chapters:'', wordCount:'' })
  const [savingWriting, setSavingWriting] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(false)
  const [form, setForm]           = useState(BLANK_HABIT)
  const [variantInput, setVariantInput] = useState('')
  const [confirm, setConfirm]     = useState(null)
  const [variantPicker, setVariantPicker] = useState(null) // { hid, date, variants }
  const [timeInputs, setTimeInputs] = useState({}) // { hid: minutesString }
  const [showTimeFor, setShowTimeFor] = useState(null) // hid

  useEffect(() => {
    Promise.all([
      sb.from('habits').select('*'),
      sb.from('habit_logs').select('*'),
      sb.from('writing_logs').select('*').order('date', { ascending: false }),
    ]).then(([{ data: hData }, { data: lData }, { data: wData }]) => {
      setHabits((hData||[]).map(rowToHabit))
      const logMap = {}
      ;(lData||[]).forEach(l => {
        if (!logMap[l.habit_id]) logMap[l.habit_id] = []
        logMap[l.habit_id].push({ date: l.date, variant: l.variant })
      })
      setLogs(logMap)
      setWritingLogs(wData||[])
      setLoading(false)
    })
  }, [])

  async function saveWritingToday() {
    const ch = parseInt(writingForm.chapters) || 0
    const wc = parseInt(writingForm.wordCount) || 0
    if (!ch && !wc) return
    setSavingWriting(true)
    const date = today()
    const existing = writingLogs.find(l => l.date === date)
    const entry = {
      id: existing?.id || uid(),
      date,
      chapters: ch,
      word_count: wc,
      created_at: existing?.created_at || date,
      updated_at: date,
    }
    try {
      await dbRun('Save writing', () => sb.from('writing_logs').upsert(entry))
      setWritingLogs(prev => [entry, ...prev.filter(l => l.date !== date)])
      setWritingForm({ chapters:'', wordCount:'' })
      toast('Writing logged ✓')
    } catch { toast('Save failed','error') }
    setSavingWriting(false)
  }

  async function saveHabit() {
    if (!form.name.trim()) return
    if (form.trackType==='variants' && form.variants.length===0) { toast('Add at least one variant','warn'); return }
    const h = { id:uid(), ...form, createdAt:today() }
    try {
      await dbRun('Save habit', () => sb.from('habits').upsert(habitToRow(h)))
      setHabits(p => [...p, h])
      setLogs(p => ({ ...p, [h.id]:[] }))
      toast('Habit added ✓')
      setModal(false); setForm(BLANK_HABIT); setVariantInput('')
    } catch { toast('Save failed','error') }
  }

  async function doDelete() {
    const id = confirm.id
    setHabits(p => p.filter(h => h.id!==id))
    setLogs(p => { const n={...p}; delete n[id]; return n })
    setConfirm(null)
    try { await dbRun('Delete', () => sb.from('habits').delete().eq('id',id)); toast('Habit deleted ✓') }
    catch { toast('Delete failed','error') }
  }

  async function mark(hid, date, variant) {
    const entries = logs[hid]||[]
    const idx = entries.findIndex(e=>e.date===date)
    let newEntries
    if (idx>=0) {
      const existDuration = entries[idx].duration_min || null
      if (variant && entries[idx].variant===variant) {
        newEntries = entries.filter((_,i)=>i!==idx)
        await dbRun('Clear log', ()=>sb.from('habit_logs').delete().eq('habit_id',hid).eq('date',date))
      } else if (variant) {
        newEntries = entries.map((e,i)=>i===idx?{...e,variant}:e)
        await dbRun('Update log', ()=>sb.from('habit_logs').upsert({habit_id:hid,date,variant,duration_min:existDuration}))
      } else {
        newEntries = entries.filter((_,i)=>i!==idx)
        await dbRun('Clear log', ()=>sb.from('habit_logs').delete().eq('habit_id',hid).eq('date',date))
      }
    } else {
      newEntries = [...entries, { date, variant:variant||null, duration_min:null }]
      await dbRun('Add log', ()=>sb.from('habit_logs').upsert({habit_id:hid,date,variant:variant||null,duration_min:null}))
    }
    setLogs(p => ({ ...p, [hid]:newEntries }))
  }

  async function saveHabitTime(hid) {
    const mins = parseInt(timeInputs[hid])
    setShowTimeFor(null)
    if (!mins || mins <= 0) return
    const date = today()
    const existing = (logs[hid]||[]).find(e=>e.date===date)
    if (!existing) return
    try {
      await dbRun('Save time', ()=>sb.from('habit_logs').upsert({
        habit_id:hid, date, variant:existing.variant||null, duration_min:mins
      }))
      setLogs(p => ({ ...p, [hid]: p[hid].map(e=>e.date===date?{...e,duration_min:mins}:e) }))
      const h = Math.floor(mins/60), m = mins%60
      const label = h===0?`${m}m`:m===0?`${h}h`:`${h}h ${m}m`
      toast(`${label} logged ✓`)
    } catch { toast('Save failed','error') }
  }

  function fmtTime(mins) {
    if (!mins) return null
    const h = Math.floor(mins/60), m = mins%60
    return h===0?`${m}m`:m===0?`${h}h`:`${h}h ${m}m`
  }

  function getStreak(hid) {
    const s = new Set((logs[hid]||[]).map(e=>e.date))
    let streak = 0
    const d = new Date(today())
    // If today isn't logged yet, start counting from yesterday
    if (!s.has(d.toISOString().slice(0,10))) d.setDate(d.getDate()-1)
    while (s.has(d.toISOString().slice(0,10))) { streak++; d.setDate(d.getDate()-1) }
    return streak
  }
  function isDone(hid,d) { return (logs[hid]||[]).some(e=>e.date===d) }
  function getVariant(hid,d) { return (logs[hid]||[]).find(e=>e.date===d)?.variant||null }

  // Build last 56 days
  const days = Array.from({length:56},(_,i)=>{
    const d=new Date(); d.setDate(d.getDate()-(55-i)); return d.toISOString().slice(0,10)
  })

  if (loading) return <div className="flex items-center justify-center h-64 text-muted text-[13px]">Loading…</div>

  // Group habits by category for display
  const habitsByCategory = {}
  habits.forEach(h => {
    const cat = h.category || 'Uncategorised'
    if (!habitsByCategory[cat]) habitsByCategory[cat] = []
    habitsByCategory[cat].push(h)
  })
  const categoryOrder = Object.keys(habitsByCategory).sort((a, b) => a === 'Uncategorised' ? 1 : b === 'Uncategorised' ? -1 : a.localeCompare(b))

  return (
    <div className="p-9 max-w-[860px]">
      <div className="flex items-end justify-between mb-7">
        <div>
          <h1 className="page-title">Habits</h1>
          <p className="page-sub">Build streaks, build yourself</p>
        </div>
        <button className="btn btn-primary" onClick={()=>setModal(true)}>
          <PlusIcon className="w-3.5 h-3.5"/> Add habit
        </button>
      </div>

      {habits.length===0
        ? <Empty icon={<ClockIcon/>} title="No habits yet" sub="Track daily habits and build streaks"
            action={<button className="btn btn-primary" onClick={()=>setModal(true)}><PlusIcon className="w-3.5 h-3.5"/>Add first habit</button>}/>
        : <div className="flex flex-col gap-6">
            {categoryOrder.map(cat => (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-3">
                  <CategoryIcon cat={cat} className="w-3.5 h-3.5" style={{ color: 'var(--c-faint)' }} />
                  <h3 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--c-faint)' }}>{cat}</h3>
                  <div className="flex-1 h-px" style={{ background: 'var(--c-border)' }}/>
                  <span className="text-[11px]" style={{ color: 'var(--c-faint)' }}>{habitsByCategory[cat].length}</span>
                </div>
                <div className="flex flex-col gap-4">
            {habitsByCategory[cat].map(h => {
              const isVariant = h.trackType==='variants'
              const isWriting = h.trackType==='writing'

              // Writing habit uses writing_logs for its data
              if (isWriting) {
                const writingDateSet = new Set(writingLogs.map(l => l.date))
                const writingStreak = (() => {
                  let s = 0; const d = new Date(today())
                  if (!writingDateSet.has(today())) d.setDate(d.getDate()-1)
                  while (writingDateSet.has(d.toISOString().slice(0,10))) { s++; d.setDate(d.getDate()-1) }
                  return s
                })()
                const totalWords    = writingLogs.reduce((a,l)=>a+(l.word_count||0),0)
                const totalChapters = writingLogs.reduce((a,l)=>a+(l.chapters||0),0)
                const writingToday  = writingLogs.find(l=>l.date===today())
                return (
                  <div key={h.id} className="bg-surface border border-border rounded-card p-5">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-[8px] flex items-center justify-center flex-shrink-0" style={{ background: 'var(--c-warn-light)' }}>
                        <PenIcon className="w-4 h-4" style={{ color: 'var(--c-warn)' }} />
                      </div>
                        <div>
                          <p className="font-medium text-[15px]">{h.name}</p>
                          <p className="text-[11px] text-muted flex gap-2 mt-0.5 items-center">
                            <span>{h.freq}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide font-medium" style={{ background: 'var(--c-warn-light)', color: 'var(--c-warn)' }}>writing</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold" style={{ background: 'var(--c-warn-light)', color: 'var(--c-warn)' }}>
                          <FlameIcon className="w-3.5 h-3.5" /> {writingStreak} day{writingStreak!==1?'s':''}
                        </div>
                        <button onClick={()=>setConfirm({id:h.id,name:h.name})} className="btn btn-ghost btn-sm btn-icon">
                          <TrashIcon className="w-3.5 h-3.5"/>
                        </button>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      {[
                        { label:'Total words', value: totalWords>=1000?`${(totalWords/1000).toFixed(1)}k`:totalWords.toLocaleString() },
                        { label:'Total chapters', value: totalChapters },
                        { label:'Writing days', value: writingLogs.length },
                      ].map(s=>(
                        <div key={s.label} className="bg-border-light rounded-[7px] px-3 py-2.5 text-center">
                          <p className="font-serif text-[20px] text-accent">{s.value}</p>
                          <p className="text-[10px] text-muted mt-0.5">{s.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Heatmap (from writing_logs) */}
                    <div className="flex gap-0.5 flex-wrap mb-4">
                      {days.map(d => {
                        const hasEntry = writingDateSet.has(d)
                        const isToday  = d===today()
                        const wl = writingLogs.find(l=>l.date===d)
                        const label = new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'})
                          + (wl ? ` · ${wl.chapters}ch ${(wl.word_count||0).toLocaleString()}w` : '')
                        return (
                          <div key={d} className="relative group/cell">
                            <div
                              className={`w-[18px] h-[18px] rounded-[3px]
                                ${hasEntry ? 'bg-warn' : 'bg-border-light'}
                                ${isToday ? 'ring-2 ring-warn ring-offset-1' : ''}`}
                            />
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-text text-white text-[10px] px-2 py-1 rounded-[4px] whitespace-nowrap opacity-0 group-hover/cell:opacity-100 pointer-events-none z-10 transition-opacity">
                              {label}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Log today */}
                    {writingToday ? (
                      <div className="flex items-center gap-3 bg-warn-light border border-warn/30 rounded-[8px] px-4 py-3">
                        <span className="text-[13px] text-warn font-medium flex-1">
                          ✓ {writingToday.chapters} chapter{writingToday.chapters!==1?'s':''} · {(writingToday.word_count||0).toLocaleString()} words logged today
                        </span>
                        <button onClick={()=>setWritingForm({chapters:String(writingToday.chapters),wordCount:String(writingToday.word_count)})}
                          className="text-[11px] text-warn hover:underline flex-shrink-0">Edit</button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2 items-end">
                        <div>
                          <p className="text-[10px] text-muted mb-1">Chapters released</p>
                          <input type="number" min="0" placeholder="0" className="form-input w-[100px] text-center"
                            value={writingForm.chapters} onChange={e=>setWritingForm(p=>({...p,chapters:e.target.value}))}/>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted mb-1">Words written</p>
                          <input type="number" min="0" placeholder="0" className="form-input w-[130px] text-center"
                            value={writingForm.wordCount} onChange={e=>setWritingForm(p=>({...p,wordCount:e.target.value}))}
                            onKeyDown={e=>e.key==='Enter'&&saveWritingToday()}/>
                        </div>
                        <button onClick={saveWritingToday} disabled={savingWriting||(!writingForm.chapters&&!writingForm.wordCount)}
                          className="btn btn-primary disabled:opacity-40">
                          {savingWriting?'Saving…':'Log today'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              }

              const streak = getStreak(h.id)
              const doneToday = isDone(h.id, today())
              const variantToday = getVariant(h.id, today())
              return (
                <div key={h.id} className="bg-surface border border-border rounded-card p-5">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-[8px] bg-accent-light flex items-center justify-center flex-shrink-0">
                        <ClockIcon className="w-4 h-4 text-accent"/>
                      </div>
                      <div>
                        <p className="font-medium text-[15px]">{h.name}</p>
                        <p className="text-[11px] text-muted flex gap-2 mt-0.5 items-center">
                          <span>{h.freq}</span>
                          <span className="bg-border-light px-1.5 rounded text-[10px] uppercase tracking-wide">{isVariant?'variants':'simple'}</span>
                          {h.category && <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: 'var(--c-faint)' }}><CategoryIcon cat={h.category} className="w-3 h-3" /> {h.category}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const totalMin = (logs[h.id]||[]).reduce((a,e)=>a+(e.duration_min||0),0)
                        return totalMin > 0 ? (
                          <span className="text-[11px] text-muted bg-border-light px-2.5 py-1 rounded-full">⏱ {fmtTime(totalMin)}</span>
                        ) : null
                      })()}
                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold" style={{ background: 'var(--c-accent-light)', color: 'var(--c-accent)' }}>
                        <FlameIcon className="w-3.5 h-3.5"/>
                        {streak} day{streak!==1?'s':''}
                      </div>
                      <button onClick={()=>setConfirm({id:h.id,name:h.name})} className="btn btn-ghost btn-sm btn-icon">
                        <TrashIcon className="w-3.5 h-3.5"/>
                      </button>
                    </div>
                  </div>

                  {/* Heatmap */}
                  <div className="flex gap-0.5 flex-wrap mb-3">
                    {days.map(d => {
                      const done=isDone(h.id,d); const isToday=d===today()
                      const v=getVariant(h.id,d)
                      const label=new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'})+(v?` · ${v}`:'')
                      const pickerOpen = variantPicker?.hid===h.id && variantPicker?.date===d
                      return (
                        <div key={d} className="relative group/cell">
                          <button
                            onClick={()=> isVariant
                              ? setVariantPicker(pickerOpen ? null : {hid:h.id, date:d, variants:h.variants})
                              : mark(h.id,d)}
                            className={`w-[18px] h-[18px] rounded-[3px] transition-all hover:scale-125
                              ${done ? 'bg-accent' : 'bg-border-light'}
                              ${isToday ? 'ring-2 ring-accent ring-offset-1' : ''}
                              ${pickerOpen ? 'ring-2 ring-warn ring-offset-1' : ''}`}
                          />
                          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-text text-white text-[10px] px-2 py-1 rounded-[4px] whitespace-nowrap opacity-0 group-hover/cell:opacity-100 pointer-events-none z-10 transition-opacity">
                            {label}
                          </div>
                          {pickerOpen && (
                            <div className="absolute bottom-7 left-1/2 -translate-x-1/2 z-20 bg-surface border border-border rounded-[8px] shadow-md p-2 flex flex-col gap-1 min-w-[110px]">
                              <p className="text-[10px] text-muted px-1 pb-1 border-b border-border-light whitespace-nowrap">{label}</p>
                              {h.variants.map(vv=>(
                                <button key={vv} onClick={()=>{ mark(h.id,d,vv); setVariantPicker(null) }}
                                  className={`text-[11px] px-2 py-1 rounded-[5px] text-left transition-colors
                                    ${v===vv ? 'bg-accent text-white' : 'hover:bg-accent-light hover:text-accent text-muted'}`}>
                                  {vv}
                                </button>
                              ))}
                              {done && (
                                <button onClick={()=>{ mark(h.id,d); setVariantPicker(null) }}
                                  className="text-[11px] px-2 py-1 rounded-[5px] text-left text-danger hover:bg-danger-light transition-colors mt-0.5 border-t border-border-light pt-1">
                                  Clear
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Today action */}
                  {isVariant ? (
                    <div>
                      <div className="flex gap-2 flex-wrap mb-2">
                        {h.variants.map(v => (
                          <button key={v} onClick={()=>mark(h.id,today(),v)}
                            className={`px-3 py-1.5 rounded-full border text-[12px] transition-all
                              ${variantToday===v ? 'bg-accent border-accent text-white font-medium' : 'border-border text-muted hover:border-accent hover:text-accent hover:bg-accent-light'}`}>
                            {v}
                          </button>
                        ))}
                      </div>
                      {doneToday
                        ? <button onClick={()=>mark(h.id,today())}
                            className="w-full py-2 border border-solid border-accent bg-accent-light text-accent rounded-[7px] text-[13px] font-medium flex items-center justify-center gap-2">
                            ✓ {variantToday||'Done'} today — tap to clear
                          </button>
                        : <p className="text-[12px] text-faint text-center py-1">Select a variant above to log today</p>
                      }
                    </div>
                  ) : (
                    <button onClick={()=>mark(h.id,today())}
                      className={`w-full py-2 rounded-[7px] text-[13px] flex items-center justify-center gap-2 transition-all
                        ${doneToday
                          ? 'border border-solid border-accent bg-accent-light text-accent font-medium'
                          : 'border border-dashed border-border text-muted hover:border-accent hover:text-accent hover:bg-accent-light'}`}>
                      {doneToday ? '✓ Done today — tap to undo' : '+ Mark today as done'}
                    </button>
                  )}

                  {/* Time tracking */}
                  {doneToday && (() => {
                    const todayEntry = (logs[h.id]||[]).find(e=>e.date===today())
                    const loggedMin  = todayEntry?.duration_min || 0
                    const totalMin   = (logs[h.id]||[]).reduce((a,e)=>a+(e.duration_min||0),0)
                    const timeOpen   = showTimeFor===h.id
                    return (
                      <div className="mt-2 pt-2 border-t border-border-light">
                        <div className="flex items-center gap-2 flex-wrap">
                          {loggedMin > 0
                            ? <span className="text-[12px] text-muted">⏱ <span className="text-accent font-medium">{fmtTime(loggedMin)}</span> today
                                {totalMin > 0 && <span className="text-faint ml-1">· {fmtTime(totalMin)} total</span>}
                              </span>
                            : <span className="text-[11px] text-faint">How long did you work on this?</span>
                          }
                          <button
                            onClick={()=>{ setShowTimeFor(timeOpen?null:h.id); setTimeInputs(p=>({...p,[h.id]:loggedMin?String(loggedMin):''})) }}
                            className="text-[11px] text-accent hover:underline">
                            {loggedMin?'Edit time':'+ Log time'}
                          </button>
                        </div>
                        {timeOpen && (
                          <div className="flex items-center gap-2 mt-2">
                            <input autoFocus type="number" min="1" placeholder="minutes"
                              className="form-input w-[100px] text-center text-[12px]"
                              value={timeInputs[h.id]||''}
                              onChange={e=>setTimeInputs(p=>({...p,[h.id]:e.target.value}))}
                              onKeyDown={e=>e.key==='Enter'&&saveHabitTime(h.id)}
                            />
                            <span className="text-[11px] text-muted">min</span>
                            <button onClick={()=>saveHabitTime(h.id)} className="btn btn-primary btn-sm px-3 py-1 text-[12px]">Save</button>
                            <button onClick={()=>setShowTimeFor(null)} className="text-[12px] text-muted hover:text-text">✕</button>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )
            })}
                </div>
              </div>
            ))}
          </div>
      }

      {/* Add habit modal */}
      <Modal open={modal} onClose={()=>{setModal(false);setForm(BLANK_HABIT);setVariantInput('')}} title="New habit">
        <div className="space-y-4">
          <div>
            <label className="form-label">Habit name *</label>
            <input className="form-input" placeholder="e.g. Morning run, Read 20 pages…"
              value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Category</label>
              <select className="form-select" value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))}>
                <option value="">— None —</option>
                {CATEGORY_LIST.map(k=><option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Frequency</label>
              <select className="form-select" value={form.freq} onChange={e=>setForm(p=>({...p,freq:e.target.value}))}>
                <option value="daily">Daily</option>
                <option value="weekdays">Weekdays only</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">Tracking type</label>
            <select className="form-select" value={form.trackType} onChange={e=>setForm(p=>({...p,trackType:e.target.value,variants:[]}))}>
              <option value="simple">Simple — mark done</option>
              <option value="variants">Variants — choose type</option>
              <option value="writing">Writing — chapters & words</option>
            </select>
          </div>
          {form.trackType==='writing' && (
            <div className="bg-warn-light border border-warn/30 rounded-[8px] p-3">
              <p className="text-[12px] font-medium flex items-center gap-1.5" style={{ color: 'var(--c-warn)' }}>Writing tracker</p>
              <p className="text-[11px] text-muted mt-0.5">Each day you'll log chapters released and words written. Stats appear on the Dashboard.</p>
            </div>
          )}
          {form.trackType==='variants' && (
            <div>
              <label className="form-label">Variants</label>
              <div className="flex gap-2 mb-2">
                <input className="form-input flex-1" placeholder="e.g. Push, Pull, Legs…"
                  value={variantInput} onChange={e=>setVariantInput(e.target.value)}
                  onKeyDown={e=>{
                    if (e.key==='Enter'&&variantInput.trim()) {
                      setForm(p=>({...p,variants:[...p.variants,variantInput.trim()]}))
                      setVariantInput('')
                    }
                  }}/>
                <button className="btn btn-ghost btn-sm" onClick={()=>{
                  if (variantInput.trim()) { setForm(p=>({...p,variants:[...p.variants,variantInput.trim()]})); setVariantInput('') }
                }}>Add</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {form.variants.map(v=>(
                  <span key={v} className="inline-flex items-center gap-1 bg-border-light text-muted text-[12px] px-2.5 py-1 rounded-full">
                    {v}
                    <button onClick={()=>setForm(p=>({...p,variants:p.variants.filter(x=>x!==v)}))} className="text-faint hover:text-danger">×</button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <button className="btn btn-ghost" onClick={()=>{setModal(false);setForm(BLANK_HABIT);setVariantInput('')}}>Cancel</button>
            <button className="btn btn-primary" onClick={saveHabit}>Save habit</button>
          </div>
        </div>
      </Modal>

      <Confirm open={!!confirm} title="Delete habit?"
        body={`"${confirm?.name}" and all tracking history will be permanently removed.`}
        onOk={doDelete} onCancel={()=>setConfirm(null)}/>
    </div>
  )
}

function ClockIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> }
function FlameIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"/></svg> }
function PenIcon(p)   { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> }
