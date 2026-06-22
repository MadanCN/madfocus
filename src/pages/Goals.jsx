import React, { useState, useEffect } from 'react'
import { sb, dbRun } from '../lib/supabase'
import { Modal, Confirm, Empty, useToast, PlusIcon, EditIcon, TrashIcon, Ring } from '../components/ui'

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function today() { return new Date().toISOString().slice(0, 10) }

const BLANK = { title: '', description: '', horizon: 'quarterly', target: 100, current: 0, due: '' }
const HORIZONS = { quarterly: 'Quarterly', monthly: 'Monthly', yearly: 'Yearly' }
const HORIZON_COLORS = { quarterly: 'var(--c-accent)', monthly: 'var(--c-warn)', yearly: '#2563eb' }

function goalToRow(g) {
  return {
    id: g.id, title: g.title, description: g.description || '', horizon: g.horizon,
    status: g.status || 'active', target: g.target, current: g.current,
    due: g.due || null, created_at: g.createdAt, updated_at: new Date().toISOString(),
  }
}

export default function Goals() {
  const toast = useToast()
  const [goals, setGoals]         = useState([])
  const [milestones, setMilestones] = useState({}) // { goalId: [milestone,...] }
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(false)
  const [form, setForm]           = useState(BLANK)
  const [editId, setEditId]       = useState(null)
  const [confirm, setConfirm]     = useState(null)
  const [saving, setSaving]       = useState(false)
  const [expandedGoal, setExpandedGoal] = useState(null) // goal id with milestones shown
  const [newMilestone, setNewMilestone] = useState({}) // { [goalId]: { title, due } }

  useEffect(() => {
    Promise.all([
      sb.from('goals').select('*').order('created_at', { ascending: false }),
      sb.from('goal_milestones').select('*').order('sort_order', { ascending: true }),
    ]).then(([{ data: g, error: ge }, { data: m }]) => {
      if (ge) toast('Failed to load goals', 'error')
      setGoals(g || [])
      const map = {}
      ;(m || []).forEach(ms => {
        if (!map[ms.goal_id]) map[ms.goal_id] = []
        map[ms.goal_id].push(ms)
      })
      setMilestones(map)
      setLoading(false)
    })
  }, [])

  async function saveGoal() {
    if (!form.title.trim()) return
    setSaving(true)
    const g = {
      id: editId || uid(),
      ...form,
      status: editId ? goals.find(g => g.id === editId)?.status || 'active' : 'active',
      createdAt: editId ? goals.find(g => g.id === editId)?.created_at : today(),
    }
    try {
      await dbRun('Save goal', () => sb.from('goals').upsert(goalToRow(g)))
      setGoals(p => editId ? p.map(x => x.id === editId ? goalToRow(g) : x) : [goalToRow(g), ...p])
      toast(editId ? 'Goal updated ✓' : 'Goal added ✓')
      closeModal()
    } catch { toast('Save failed', 'error') }
    finally { setSaving(false) }
  }

  async function updateProgress(id, newCurrent) {
    const g = goals.find(x => x.id === id); if (!g) return
    const updated = { ...g, current: Math.max(0, Math.min(g.target, newCurrent)) }
    setGoals(p => p.map(x => x.id === id ? updated : x))
    try { await dbRun('Progress', () => sb.from('goals').upsert({ ...updated, updated_at: new Date().toISOString() })) }
    catch { setGoals(p => p.map(x => x.id === id ? g : x)); toast('Update failed', 'error') }
  }

  async function toggleStatus(id) {
    const g = goals.find(x => x.id === id); if (!g) return
    const updated = { ...g, status: g.status === 'active' ? 'done' : 'active' }
    setGoals(p => p.map(x => x.id === id ? updated : x))
    try { await dbRun('Status', () => sb.from('goals').upsert({ ...updated, updated_at: new Date().toISOString() })) }
    catch { setGoals(p => p.map(x => x.id === id ? g : x)) }
  }

  async function doDelete() {
    const id = confirm.id
    setGoals(p => p.filter(g => g.id !== id)); setConfirm(null)
    try { await dbRun('Delete', () => sb.from('goals').delete().eq('id', id)); toast('Goal deleted ✓') }
    catch { toast('Delete failed', 'error') }
  }

  // ── Milestones ─────────────────────────────────────────────
  async function addMilestone(goalId) {
    const nm = newMilestone[goalId]
    if (!nm?.title?.trim()) return
    const ms = {
      id: uid(),
      goal_id: goalId,
      title: nm.title.trim(),
      due: nm.due || null,
      done: false,
      sort_order: (milestones[goalId] || []).length,
      created_at: today(),
    }
    setMilestones(p => ({ ...p, [goalId]: [...(p[goalId] || []), ms] }))
    setNewMilestone(p => ({ ...p, [goalId]: { title: '', due: '' } }))
    try { await dbRun('Add milestone', () => sb.from('goal_milestones').insert(ms)) }
    catch { toast('Failed to add milestone', 'error') }
  }

  async function toggleMilestone(goalId, msId) {
    const ms = (milestones[goalId] || []).find(m => m.id === msId)
    if (!ms) return
    const updated = { ...ms, done: !ms.done }
    setMilestones(p => ({
      ...p,
      [goalId]: p[goalId].map(m => m.id === msId ? updated : m),
    }))
    try { await dbRun('Toggle milestone', () => sb.from('goal_milestones').upsert(updated)) }
    catch { toast('Update failed', 'error') }
  }

  async function deleteMilestone(goalId, msId) {
    setMilestones(p => ({ ...p, [goalId]: (p[goalId] || []).filter(m => m.id !== msId) }))
    try { await dbRun('Delete milestone', () => sb.from('goal_milestones').delete().eq('id', msId)) }
    catch { toast('Delete failed', 'error') }
  }

  function openEdit(g) {
    setForm({ title: g.title, description: g.description || '', horizon: g.horizon, target: g.target, current: g.current, due: g.due || '' })
    setEditId(g.id); setModal(true)
  }
  function closeModal() { setModal(false); setForm(BLANK); setEditId(null) }
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const active = goals.filter(g => g.status === 'active')
  const done   = goals.filter(g => g.status === 'done')

  if (loading) return <div className="flex items-center justify-center h-64 text-[13px]" style={{ color: 'var(--c-muted)' }}>Loading…</div>

  return (
    <div className="p-9 max-w-[900px]">
      <div className="flex items-end justify-between mb-7">
        <div>
          <h1 className="page-title">Goals</h1>
          <p className="page-sub">{active.length} active · {done.length} completed</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal(true)}>
          <PlusIcon className="w-3.5 h-3.5"/> Add goal
        </button>
      </div>

      {goals.length === 0
        ? <Empty icon={<TargetIcon className="w-9 h-9 mx-auto"/>} title="No goals yet"
            sub="Set quarterly, monthly or yearly goals and track progress"
            action={<button className="btn btn-primary" onClick={() => setModal(true)}><PlusIcon className="w-3.5 h-3.5"/>Add first goal</button>}/>
        : <>
            {active.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {active.map(g => {
                  const pct = g.target > 0 ? Math.round((g.current / g.target) * 100) : 0
                  const color = HORIZON_COLORS[g.horizon]
                  const gMilestones = milestones[g.id] || []
                  const msTotal = gMilestones.length
                  const msDone  = gMilestones.filter(m => m.done).length
                  const isExpanded = expandedGoal === g.id
                  const nm = newMilestone[g.id] || { title: '', due: '' }

                  return (
                    <div key={g.id} className="rounded-card p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                      {/* Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1 min-w-0 pr-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
                              {HORIZONS[g.horizon]}
                            </span>
                          </div>
                          <h3 className="font-medium text-[15px] leading-snug" style={{ color: 'var(--c-text)' }}>{g.title}</h3>
                          {g.description && <p className="text-[12px] mt-1" style={{ color: 'var(--c-muted)' }}>{g.description}</p>}
                        </div>
                        <Ring pct={pct} size={56} stroke={5} color={color}>
                          <span className="text-[11px] font-semibold" style={{ color }}>{pct}%</span>
                        </Ring>
                      </div>

                      {/* Progress bar */}
                      <div className="mb-3">
                        <div className="flex justify-between text-[11px] mb-1" style={{ color: 'var(--c-muted)' }}>
                          <span>{g.current} / {g.target}</span>
                          {g.due && <span>Due {new Date(g.due).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--c-border-light)' }}>
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%`, background: color }}/>
                        </div>
                      </div>

                      {/* Progress stepper */}
                      <div className="flex items-center gap-2 mb-3">
                        <button onClick={() => updateProgress(g.id, g.current - 1)} className="btn btn-ghost btn-sm btn-icon text-[16px]">−</button>
                        <input type="number" className="form-input text-center text-[13px] py-1"
                          value={g.current} min={0} max={g.target}
                          onChange={e => updateProgress(g.id, parseInt(e.target.value) || 0)}/>
                        <button onClick={() => updateProgress(g.id, g.current + 1)} className="btn btn-ghost btn-sm btn-icon text-[16px]">+</button>
                      </div>

                      {/* Milestones section */}
                      {msTotal > 0 && (
                        <div className="mb-3 rounded-[8px] p-3" style={{ background: 'var(--c-border-light)' }}>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--c-faint)' }}>
                              Milestones · {msDone}/{msTotal}
                            </p>
                            <div className="flex-1 mx-3 h-1 rounded-full overflow-hidden" style={{ background: 'var(--c-border)' }}>
                              <div className="h-full rounded-full transition-all" style={{ width: `${msTotal > 0 ? Math.round((msDone / msTotal) * 100) : 0}%`, background: color }} />
                            </div>
                          </div>
                          {gMilestones.map(ms => (
                            <div key={ms.id} className="flex items-center gap-2 py-1 group">
                              <button
                                onClick={() => toggleMilestone(g.id, ms.id)}
                                className="w-4 h-4 rounded-[4px] border flex-shrink-0 flex items-center justify-center transition-all"
                                style={{ background: ms.done ? color : 'transparent', borderColor: ms.done ? color : 'var(--c-border)' }}
                              >
                                {ms.done && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                              </button>
                              <span className="text-[12px] flex-1" style={{ color: ms.done ? 'var(--c-faint)' : 'var(--c-text)', textDecoration: ms.done ? 'line-through' : 'none' }}>
                                {ms.title}
                              </span>
                              {ms.due && <span className="text-[10px]" style={{ color: 'var(--c-faint)' }}>{ms.due}</span>}
                              <button onClick={() => deleteMilestone(g.id, ms.id)} className="opacity-0 group-hover:opacity-100 text-[11px] transition-opacity" style={{ color: 'var(--c-faint)' }}
                                onMouseEnter={e => e.currentTarget.style.color = 'var(--c-danger)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--c-faint)'}>×</button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add milestone */}
                      {isExpanded && (
                        <div className="mb-3 flex gap-2">
                          <input
                            autoFocus
                            className="form-input flex-1 text-[12px] py-1.5"
                            placeholder="Milestone title…"
                            value={nm.title}
                            onChange={e => setNewMilestone(p => ({ ...p, [g.id]: { ...nm, title: e.target.value } }))}
                            onKeyDown={e => e.key === 'Enter' && addMilestone(g.id)}
                          />
                          <input
                            type="date"
                            className="form-input w-[130px] text-[12px] py-1.5"
                            value={nm.due}
                            onChange={e => setNewMilestone(p => ({ ...p, [g.id]: { ...nm, due: e.target.value } }))}
                          />
                          <button onClick={() => addMilestone(g.id)} className="btn btn-primary btn-sm px-3">Add</button>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-1.5">
                        <button onClick={() => openEdit(g)} className="btn btn-ghost btn-sm flex-1"><EditIcon className="w-3 h-3"/> Edit</button>
                        <button
                          onClick={() => { setExpandedGoal(isExpanded ? null : g.id); setNewMilestone(p => ({ ...p, [g.id]: { title: '', due: '' } })) }}
                          className="btn btn-ghost btn-sm flex-1"
                        >
                          + Milestone
                        </button>
                        <button onClick={() => toggleStatus(g.id)} className="btn btn-ghost btn-sm flex-1">✓ Done</button>
                        <button onClick={() => setConfirm({ id: g.id, title: g.title })} className="btn btn-ghost btn-sm btn-icon"><TrashIcon className="w-3.5 h-3.5"/></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {done.length > 0 && (
              <div>
                <h3 className="text-[12px] font-medium uppercase tracking-wide mb-3" style={{ color: 'var(--c-muted)' }}>Completed</h3>
                <div className="flex flex-col gap-1.5">
                  {done.map(g => (
                    <div key={g.id} className="flex items-center gap-3 rounded-[8px] px-4 py-3" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', opacity: 0.6 }}>
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--c-accent-light)' }}>
                        <svg className="w-3 h-3" style={{ color: 'var(--c-accent)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                      <span className="text-[13px] font-medium flex-1" style={{ color: 'var(--c-text)', textDecoration: 'line-through' }}>{g.title}</span>
                      <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--c-muted)' }}>{HORIZONS[g.horizon]}</span>
                      <button onClick={() => toggleStatus(g.id)} className="text-[12px] hover:underline" style={{ color: 'var(--c-accent)' }}>Reopen</button>
                      <button onClick={() => setConfirm({ id: g.id, title: g.title })} className="btn btn-ghost btn-sm btn-icon"><TrashIcon className="w-3 h-3"/></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
      }

      <Modal open={modal} onClose={closeModal} title={editId ? 'Edit goal' : 'New goal'}>
        <div className="space-y-4">
          <div>
            <label className="form-label">Title *</label>
            <input className="form-input" placeholder="What do you want to achieve?"
              value={form.title} onChange={e => f('title', e.target.value)} autoFocus />
          </div>
          <div>
            <label className="form-label">Description</label>
            <textarea className="form-textarea" rows={2} placeholder="Why does this matter?"
              value={form.description} onChange={e => f('description', e.target.value)}/>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="form-label">Horizon</label>
              <select className="form-select" value={form.horizon} onChange={e => f('horizon', e.target.value)}>
                {Object.entries(HORIZONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Target</label>
              <input className="form-input" type="number" min="1" value={form.target} onChange={e => f('target', parseInt(e.target.value) || 1)}/>
            </div>
            <div>
              <label className="form-label">Current</label>
              <input className="form-input" type="number" min="0" value={form.current} onChange={e => f('current', parseInt(e.target.value) || 0)}/>
            </div>
          </div>
          <div>
            <label className="form-label">Due date</label>
            <input className="form-input" type="date" value={form.due} onChange={e => f('due', e.target.value)}/>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
            <button className="btn btn-primary" onClick={saveGoal} disabled={saving || !form.title.trim()}>
              {saving ? 'Saving…' : editId ? 'Update goal' : 'Add goal'}
            </button>
          </div>
        </div>
      </Modal>

      <Confirm open={!!confirm} title="Delete goal?"
        body={`"${confirm?.title}" will be permanently removed.`}
        onOk={doDelete} onCancel={() => setConfirm(null)}/>
    </div>
  )
}

function TargetIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> }
