import React, { useState, useEffect } from 'react'
import { sb, dbRun } from '../lib/supabase'
import { Modal, Confirm, Empty, useToast, PlusIcon, EditIcon, TrashIcon } from '../components/ui'

const PRIORITY_META = {
  P1: { label: 'Critical', cls: 'tag-p1' },
  P2: { label: 'High',     cls: 'tag-p2' },
  P3: { label: 'Normal',   cls: 'tag-p3' },
  P4: { label: 'Low',      cls: 'tag-p4'  },
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6) }
function today() { return new Date().toISOString().slice(0,10) }
function dateLabel(d) {
  if (!d) return ''
  const diff = Math.round((new Date(d) - new Date(today())) / 86400000)
  if (diff < 0)  return `${Math.abs(diff)}d overdue`
  if (diff === 0) return 'Due today'
  if (diff === 1) return 'Due tomorrow'
  return `Due ${new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`
}
function taskToRow(t) {
  return { id:t.id, title:t.title, notes:t.notes||'', priority:t.priority, due:t.due||null,
           project:t.project||null, type:t.type||null, done:t.done,
           completed_at:t.completedAt||null, dep_ids:t.depIds||[],
           created_at:t.createdAt, kanban_status:t.kanbanStatus||'todo' }
}
function rowToTask(r) {
  return { id:r.id, title:r.title, notes:r.notes||'', priority:r.priority, due:r.due,
           project:r.project, type:r.type, done:r.done, completedAt:r.completed_at,
           depIds:r.dep_ids||[], createdAt:r.created_at, kanbanStatus:r.kanban_status||'todo' }
}
const BLANK = { title:'', notes:'', priority:'P3', due:'', project:'', type:'', depIds:[] }

export default function Tasks() {
  const toast = useToast()
  const [tasks, setTasks]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ status:'all', priority:'', project:'' })
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(BLANK)
  const [editId, setEditId] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [depQ, setDepQ]     = useState('')

  useEffect(() => {
    sb.from('tasks').select('*').then(({ data, error }) => {
      if (error) toast('Failed to load tasks', 'error')
      else setTasks((data||[]).map(rowToTask))
      setLoading(false)
    })
  }, [])

  async function saveTask() {
    if (!form.title.trim()) return
    setSaving(true)
    const existing = editId ? tasks.find(t => t.id === editId) : null
    const task = { id:editId||uid(), ...form,
      done: existing?.done ?? false, completedAt: existing?.completedAt ?? null,
      createdAt: existing?.createdAt ?? today(), kanbanStatus: existing?.kanbanStatus ?? 'todo' }
    try {
      await dbRun('Save task', () => sb.from('tasks').upsert(taskToRow(task)))
      setTasks(p => editId ? p.map(t => t.id===editId ? task : t) : [task,...p])
      toast(editId ? 'Task updated ✓' : 'Task added ✓')
      closeModal()
    } catch { toast('Save failed','error') }
    finally { setSaving(false) }
  }

  async function toggleDone(id) {
    const t = tasks.find(t => t.id===id); if (!t) return
    const updated = { ...t, done:!t.done, completedAt:!t.done ? today() : null }
    setTasks(p => p.map(x => x.id===id ? updated : x))
    try { await dbRun('Toggle', () => sb.from('tasks').upsert(taskToRow(updated))) }
    catch { setTasks(p => p.map(x => x.id===id ? t : x)); toast('Update failed','error') }
  }

  async function doDelete() {
    const id = confirm.id
    setTasks(p => p.filter(t => t.id!==id).map(t => ({ ...t, depIds:(t.depIds||[]).filter(d=>d!==id) })))
    setConfirm(null)
    try { await dbRun('Delete', () => sb.from('tasks').delete().eq('id',id)); toast('Task deleted ✓') }
    catch { toast('Delete failed','error') }
  }

  function openEdit(t) {
    setForm({ title:t.title, notes:t.notes||'', priority:t.priority,
              due:t.due||'', project:t.project||'', type:t.type||'', depIds:t.depIds||[] })
    setEditId(t.id); setModal(true)
  }
  function closeModal() { setModal(false); setForm(BLANK); setEditId(null); setDepQ('') }
  const f = (k,v) => setForm(p => ({ ...p, [k]:v }))

  const projects = [...new Set(tasks.map(t=>t.project).filter(Boolean))]
  const filtered = tasks
    .filter(t => {
      if (filter.status==='active' && t.done) return false
      if (filter.status==='done' && !t.done) return false
      if (filter.priority && t.priority!==filter.priority) return false
      if (filter.project  && t.project !==filter.project)  return false
      return true
    })
    .sort((a,b) => {
      if (a.done!==b.done) return a.done?1:-1
      const po={P1:0,P2:1,P3:2,P4:3}
      if (po[a.priority]!==po[b.priority]) return po[a.priority]-po[b.priority]
      if (a.due&&b.due) return new Date(a.due)-new Date(b.due)
      return a.due?-1:b.due?1:0
    })

  const depResults = depQ.length>1
    ? tasks.filter(t => t.id!==editId && !(form.depIds||[]).includes(t.id)
        && t.title.toLowerCase().includes(depQ.toLowerCase())).slice(0,6)
    : []

  if (loading) return <Loader />
  return (
    <div className="p-9 max-w-[860px]">
      <div className="flex items-end justify-between mb-7">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-sub">{tasks.filter(t=>!t.done).length} active · {tasks.filter(t=>t.done).length} done</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal(true)}>
          <PlusIcon className="w-3.5 h-3.5" /> Add task
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center mb-5">
        {['all','active','done'].map(s => (
          <button key={s} onClick={() => setFilter(p=>({...p,status:s}))}
            className={`px-3 py-1.5 rounded-full border text-[12px] transition-all
              ${filter.status===s ? 'bg-text text-white border-text' : 'border-border text-muted hover:border-muted hover:text-text'}`}>
            {s[0].toUpperCase()+s.slice(1)}
          </button>
        ))}
        <select className="form-select text-[12px] py-1.5 w-auto"
          value={filter.priority} onChange={e=>setFilter(p=>({...p,priority:e.target.value}))}>
          <option value="">All priorities</option>
          {Object.entries(PRIORITY_META).map(([k,v])=><option key={k} value={k}>{k} – {v.label}</option>)}
        </select>
        <select className="form-select text-[12px] py-1.5 w-auto"
          value={filter.project} onChange={e=>setFilter(p=>({...p,project:e.target.value}))}>
          <option value="">All projects</option>
          {projects.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* List */}
      {filtered.length===0
        ? <Empty icon={<TaskEmptyIcon />} title="No tasks here" sub="Click 'Add task' to get started" />
        : <div className="flex flex-col gap-1.5">
            {filtered.map(t => {
              const overdue = !t.done && t.due && new Date(t.due)<new Date(today())
              const deps = (t.depIds||[]).map(did=>tasks.find(x=>x.id===did)?.title).filter(Boolean)
              return (
                <div key={t.id}
                  className={`bg-surface border border-border rounded-card px-4 py-3.5 flex items-start gap-3 group hover:border-faint hover:shadow-card transition-all ${t.done?'opacity-50':''}`}>
                  <button onClick={()=>toggleDone(t.id)}
                    className={`w-[18px] h-[18px] rounded-[5px] border flex-shrink-0 mt-0.5 flex items-center justify-center transition-all
                      ${t.done ? 'bg-accent border-accent' : 'border-border hover:border-accent'}`}>
                    {t.done && <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[14px] font-medium mb-1 ${t.done?'line-through text-muted':''}`}>{t.title}</p>
                    <div className="flex gap-1.5 flex-wrap items-center">
                      <span className={`tag ${PRIORITY_META[t.priority]?.cls}`}>{t.priority}</span>
                      {t.project && <span className="tag bg-border-light text-muted">{t.project}</span>}
                      {t.type    && <span className="tag bg-border-light text-muted">{t.type}</span>}
                      {t.due && <span className={`tag ${overdue?'bg-danger-light text-danger':'bg-border-light text-muted'}`}>{dateLabel(t.due)}</span>}
                      {deps.map(d=><span key={d} className="inline-flex items-center gap-1 bg-border-light text-muted text-[11px] px-2 py-0.5 rounded border border-border">↳ {d}</span>)}
                    </div>
                    {t.notes && <p className="text-[12px] text-muted mt-1.5">{t.notes}</p>}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={()=>openEdit(t)} className="btn btn-ghost btn-sm btn-icon"><EditIcon className="w-3.5 h-3.5"/></button>
                    <button onClick={()=>setConfirm({id:t.id,title:t.title})} className="btn btn-ghost btn-sm btn-icon"><TrashIcon className="w-3.5 h-3.5"/></button>
                  </div>
                </div>
              )
            })}
          </div>
      }

      <Modal open={modal} onClose={closeModal} title={editId?'Edit task':'New task'}>
        <div className="space-y-4">
          <div>
            <label className="form-label">Title *</label>
            <input className="form-input" placeholder="What needs to be done?"
              value={form.title} onChange={e=>f('title',e.target.value)} autoFocus
              onKeyDown={e=>e.key==='Enter'&&saveTask()} />
          </div>
          <div>
            <label className="form-label">Notes</label>
            <textarea className="form-textarea" rows={3} placeholder="Any context…"
              value={form.notes} onChange={e=>f('notes',e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Priority</label>
              <select className="form-select" value={form.priority} onChange={e=>f('priority',e.target.value)}>
                {Object.entries(PRIORITY_META).map(([k,v])=><option key={k} value={k}>{k} – {v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Due date</label>
              <input className="form-input" type="date" value={form.due} onChange={e=>f('due',e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Project</label>
              <input className="form-input" placeholder="e.g. Work, Personal"
                list="proj-list" value={form.project} onChange={e=>f('project',e.target.value)} />
              <datalist id="proj-list">{projects.map(p=><option key={p} value={p}/>)}</datalist>
            </div>
            <div>
              <label className="form-label">Type</label>
              <input className="form-input" placeholder="e.g. Bug, Meeting"
                value={form.type} onChange={e=>f('type',e.target.value)} />
            </div>
          </div>
          <div>
            <label className="form-label">Depends on</label>
            <input className="form-input" placeholder="Search tasks to link…"
              value={depQ} onChange={e=>setDepQ(e.target.value)} />
            {depResults.length>0 && (
              <div className="border border-border rounded-[8px] mt-1 overflow-hidden shadow-md">
                {depResults.map(t=>(
                  <button key={t.id} onClick={()=>{f('depIds',[...(form.depIds||[]),t.id]);setDepQ('')}}
                    className="w-full text-left px-3 py-2 text-[13px] hover:bg-accent-light hover:text-accent border-b border-border-light last:border-0">
                    {t.title} <span className="text-[11px] text-muted ml-1">{t.priority}</span>
                  </button>
                ))}
              </div>
            )}
            {(form.depIds||[]).length>0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.depIds.map(did=>{
                  const dt=tasks.find(t=>t.id===did)
                  return <span key={did} className="inline-flex items-center gap-1 bg-border-light text-muted text-[11px] px-2 py-1 rounded border border-border">
                    ↳ {dt?.title||did}
                    <button onClick={()=>f('depIds',form.depIds.filter(d=>d!==did))} className="text-faint hover:text-danger ml-1">×</button>
                  </span>
                })}
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
            <button className="btn btn-primary" onClick={saveTask} disabled={saving||!form.title.trim()}>
              {saving?'Saving…':editId?'Update task':'Add task'}
            </button>
          </div>
        </div>
      </Modal>

      <Confirm open={!!confirm} title="Delete task?"
        body={`"${confirm?.title}" will be permanently removed.`}
        onOk={doDelete} onCancel={()=>setConfirm(null)} />
    </div>
  )
}

function Loader() { return <div className="flex items-center justify-center h-64 text-muted text-[13px]">Loading…</div> }
function TaskEmptyIcon() { return <svg className="w-9 h-9 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg> }
