import React, { useState, useEffect } from 'react'
import { sb, dbRun } from '../lib/supabase'
import { Modal, Confirm, Empty, useToast, PlusIcon, EditIcon, TrashIcon, Ring } from '../components/ui'

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6) }
function today() { return new Date().toISOString().slice(0,10) }

const BLANK = { title:'', description:'', horizon:'quarterly', target:100, current:0, due:'' }
const HORIZONS = { quarterly:'Quarterly', monthly:'Monthly', yearly:'Yearly' }
const HORIZON_COLORS = { quarterly:'#2d5a3d', monthly:'#b8860b', yearly:'#2563eb' }

function goalToRow(g) {
  return { id:g.id, title:g.title, description:g.description||'', horizon:g.horizon,
           status:g.status||'active', target:g.target, current:g.current,
           due:g.due||null, created_at:g.createdAt, updated_at:new Date().toISOString() }
}

export default function Goals() {
  const toast = useToast()
  const [goals, setGoals]     = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(BLANK)
  const [editId, setEditId]   = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    sb.from('goals').select('*').order('created_at',{ascending:false}).then(({data,error}) => {
      if (error) toast('Failed to load goals','error')
      else setGoals(data||[])
      setLoading(false)
    })
  }, [])

  async function saveGoal() {
    if (!form.title.trim()) return
    setSaving(true)
    const g = { id:editId||uid(), ...form,
      status: editId ? goals.find(g=>g.id===editId)?.status||'active' : 'active',
      createdAt: editId ? goals.find(g=>g.id===editId)?.created_at : today() }
    try {
      await dbRun('Save goal', ()=>sb.from('goals').upsert(goalToRow(g)))
      setGoals(p => editId ? p.map(x=>x.id===editId?goalToRow(g):x) : [goalToRow(g),...p])
      toast(editId ? 'Goal updated ✓' : 'Goal added ✓')
      closeModal()
    } catch { toast('Save failed','error') }
    finally { setSaving(false) }
  }

  async function updateProgress(id, newCurrent) {
    const g = goals.find(x=>x.id===id); if (!g) return
    const updated = { ...g, current: Math.max(0, Math.min(g.target, newCurrent)) }
    setGoals(p => p.map(x=>x.id===id ? updated : x))
    try { await dbRun('Update progress', ()=>sb.from('goals').upsert({...updated,updated_at:new Date().toISOString()})) }
    catch { setGoals(p=>p.map(x=>x.id===id?g:x)); toast('Update failed','error') }
  }

  async function toggleStatus(id) {
    const g = goals.find(x=>x.id===id); if (!g) return
    const updated = { ...g, status: g.status==='active' ? 'done' : 'active' }
    setGoals(p=>p.map(x=>x.id===id?updated:x))
    try { await dbRun('Toggle status', ()=>sb.from('goals').upsert({...updated,updated_at:new Date().toISOString()})) }
    catch { setGoals(p=>p.map(x=>x.id===id?g:x)) }
  }

  async function doDelete() {
    const id = confirm.id
    setGoals(p=>p.filter(g=>g.id!==id)); setConfirm(null)
    try { await dbRun('Delete', ()=>sb.from('goals').delete().eq('id',id)); toast('Goal deleted ✓') }
    catch { toast('Delete failed','error') }
  }

  function openEdit(g) {
    setForm({ title:g.title, description:g.description||'', horizon:g.horizon,
              target:g.target, current:g.current, due:g.due||'' })
    setEditId(g.id); setModal(true)
  }
  function closeModal() { setModal(false); setForm(BLANK); setEditId(null) }
  const f = (k,v) => setForm(p=>({...p,[k]:v}))

  const active = goals.filter(g=>g.status==='active')
  const done   = goals.filter(g=>g.status==='done')

  if (loading) return <div className="flex items-center justify-center h-64 text-muted text-[13px]">Loading…</div>

  return (
    <div className="p-9 max-w-[860px]">
      <div className="flex items-end justify-between mb-7">
        <div>
          <h1 className="page-title">Goals</h1>
          <p className="page-sub">{active.length} active · {done.length} completed</p>
        </div>
        <button className="btn btn-primary" onClick={()=>setModal(true)}>
          <PlusIcon className="w-3.5 h-3.5"/> Add goal
        </button>
      </div>

      {goals.length===0
        ? <Empty icon={<TargetIcon className="w-9 h-9 mx-auto"/>} title="No goals yet"
            sub="Set quarterly, monthly or yearly goals and track progress"
            action={<button className="btn btn-primary" onClick={()=>setModal(true)}><PlusIcon className="w-3.5 h-3.5"/>Add first goal</button>}/>
        : <>
            {active.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {active.map(g => {
                  const pct = g.target > 0 ? Math.round((g.current/g.target)*100) : 0
                  const color = HORIZON_COLORS[g.horizon]
                  return (
                    <div key={g.id} className="bg-surface border border-border rounded-card p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1 min-w-0 pr-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded" style={{background:`${color}18`,color}}>
                              {HORIZONS[g.horizon]}
                            </span>
                          </div>
                          <h3 className="font-medium text-[15px] leading-snug">{g.title}</h3>
                          {g.description && <p className="text-[12px] text-muted mt-1">{g.description}</p>}
                        </div>
                        <Ring pct={pct} size={56} stroke={5} color={color}>
                          <span className="text-[11px] font-semibold" style={{color}}>{pct}%</span>
                        </Ring>
                      </div>

                      {/* Progress bar */}
                      <div className="mb-3">
                        <div className="flex justify-between text-[11px] text-muted mb-1">
                          <span>{g.current} / {g.target}</span>
                          {g.due && <span>Due {new Date(g.due).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>}
                        </div>
                        <div className="h-1.5 bg-border-light rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{width:`${Math.min(pct,100)}%`, background:color}}/>
                        </div>
                      </div>

                      {/* Progress stepper */}
                      <div className="flex items-center gap-2 mb-3">
                        <button onClick={()=>updateProgress(g.id,g.current-1)} className="btn btn-ghost btn-sm btn-icon text-[16px]">−</button>
                        <input type="number" className="form-input text-center text-[13px] py-1"
                          value={g.current} min={0} max={g.target}
                          onChange={e=>updateProgress(g.id,parseInt(e.target.value)||0)}/>
                        <button onClick={()=>updateProgress(g.id,g.current+1)} className="btn btn-ghost btn-sm btn-icon text-[16px]">+</button>
                      </div>

                      <div className="flex gap-1.5">
                        <button onClick={()=>openEdit(g)} className="btn btn-ghost btn-sm flex-1"><EditIcon className="w-3 h-3"/> Edit</button>
                        <button onClick={()=>toggleStatus(g.id)} className="btn btn-ghost btn-sm flex-1">✓ Complete</button>
                        <button onClick={()=>setConfirm({id:g.id,title:g.title})} className="btn btn-ghost btn-sm btn-icon"><TrashIcon className="w-3.5 h-3.5"/></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {done.length > 0 && (
              <div>
                <h3 className="text-[12px] font-medium text-muted uppercase tracking-wide mb-3">Completed</h3>
                <div className="flex flex-col gap-1.5">
                  {done.map(g => (
                    <div key={g.id} className="flex items-center gap-3 bg-surface border border-border rounded-[8px] px-4 py-3 opacity-60">
                      <div className="w-5 h-5 rounded-full bg-accent-light flex items-center justify-center flex-shrink-0">
                        <svg className="w-3 h-3 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                      <span className="text-[13px] font-medium flex-1 line-through">{g.title}</span>
                      <span className="text-[10px] text-muted uppercase tracking-wide">{HORIZONS[g.horizon]}</span>
                      <button onClick={()=>toggleStatus(g.id)} className="text-[12px] text-accent hover:underline">Reopen</button>
                      <button onClick={()=>setConfirm({id:g.id,title:g.title})} className="btn btn-ghost btn-sm btn-icon"><TrashIcon className="w-3 h-3"/></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
      }

      <Modal open={modal} onClose={closeModal} title={editId?'Edit goal':'New goal'}>
        <div className="space-y-4">
          <div>
            <label className="form-label">Title *</label>
            <input className="form-input" placeholder="What do you want to achieve?"
              value={form.title} onChange={e=>f('title',e.target.value)} autoFocus />
          </div>
          <div>
            <label className="form-label">Description</label>
            <textarea className="form-textarea" rows={2} placeholder="Why does this matter?"
              value={form.description} onChange={e=>f('description',e.target.value)}/>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="form-label">Horizon</label>
              <select className="form-select" value={form.horizon} onChange={e=>f('horizon',e.target.value)}>
                {Object.entries(HORIZONS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Target</label>
              <input className="form-input" type="number" min="1" value={form.target} onChange={e=>f('target',parseInt(e.target.value)||1)}/>
            </div>
            <div>
              <label className="form-label">Current</label>
              <input className="form-input" type="number" min="0" value={form.current} onChange={e=>f('current',parseInt(e.target.value)||0)}/>
            </div>
          </div>
          <div>
            <label className="form-label">Due date</label>
            <input className="form-input" type="date" value={form.due} onChange={e=>f('due',e.target.value)}/>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
            <button className="btn btn-primary" onClick={saveGoal} disabled={saving||!form.title.trim()}>
              {saving?'Saving…':editId?'Update goal':'Add goal'}
            </button>
          </div>
        </div>
      </Modal>

      <Confirm open={!!confirm} title="Delete goal?"
        body={`"${confirm?.title}" will be permanently removed.`}
        onOk={doDelete} onCancel={()=>setConfirm(null)}/>
    </div>
  )
}

function TargetIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> }
