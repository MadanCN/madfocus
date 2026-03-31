import React, { useState, useEffect } from 'react'
import { sb, dbRun } from '../lib/supabase'
import { Modal, Confirm, Empty, useToast, PlusIcon, TrashIcon } from '../components/ui'

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6) }
function today() { return new Date().toISOString().slice(0,10) }

function habitToRow(h) {
  return { id:h.id, name:h.name, freq:h.freq, track_type:h.trackType, variants:h.variants||[], created_at:h.createdAt }
}
function rowToHabit(r) {
  return { id:r.id, name:r.name, freq:r.freq, trackType:r.track_type, variants:r.variants||[], createdAt:r.created_at }
}

const BLANK_HABIT = { name:'', freq:'daily', trackType:'simple', variants:[] }

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
        : <div className="flex flex-col gap-4">
            {habits.map(h => {
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
                        <div className="w-9 h-9 rounded-[8px] bg-warn-light flex items-center justify-center flex-shrink-0 text-[18px]">✍️</div>
                        <div>
                          <p className="font-medium text-[15px]">{h.name}</p>
                          <p className="text-[11px] text-muted flex gap-2 mt-0.5">
                            <span>{h.freq}</span>
                            <span className="bg-warn-light text-warn px-1.5 rounded text-[10px] uppercase tracking-wide">writing</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 bg-warn-light text-warn px-3 py-1 rounded-full text-[12px] font-semibold">
                          🔥 {writingStreak} day{writingStreak!==1?'s':''}
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
                        <p className="text-[11px] text-muted flex gap-2 mt-0.5">
                          <span>{h.freq}</span>
                          <span className="bg-border-light px-1.5 rounded text-[10px] uppercase tracking-wide">{isVariant?'variants':'simple'}</span>
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
                      <div className="flex items-center gap-1.5 bg-accent-light text-accent px-3 py-1 rounded-full text-[12px] font-semibold">
                        <TrendIcon className="w-3 h-3"/>
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
              <label className="form-label">Frequency</label>
              <select className="form-select" value={form.freq} onChange={e=>setForm(p=>({...p,freq:e.target.value}))}>
                <option value="daily">Daily</option>
                <option value="weekdays">Weekdays only</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <div>
              <label className="form-label">Tracking type</label>
              <select className="form-select" value={form.trackType} onChange={e=>setForm(p=>({...p,trackType:e.target.value,variants:[]}))}>
                <option value="simple">Simple — mark done</option>
                <option value="variants">Variants — choose type</option>
                <option value="writing">Writing — chapters & words</option>
              </select>
            </div>
          </div>
          {form.trackType==='writing' && (
            <div className="bg-warn-light border border-warn/30 rounded-[8px] p-3">
              <p className="text-[12px] text-warn font-medium">✍️ Writing habit</p>
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
function TrendIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> }
