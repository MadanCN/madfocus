import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Minus, Target, Trash2, CheckCircle2, RotateCcw, ChevronDown, X, Pause } from 'lucide-react'
import { Dialog, Sheet, Empty, PageLoader, SaveState, Seg, Check2, Menu, useToast, useConfirm } from '../components/ui'
import { sb, dbRun } from '../lib/supabase'
import { useAutosave } from '../lib/useAutosave'
import { uid, today, nowIso, daysBetween, fmtDay, plural, parseYmd } from '../lib/utils'

const HORIZONS = { monthly: 'This month', quarterly: 'This quarter', yearly: 'This year' }
const STATUS = { active: 'Active', paused: 'Paused', done: 'Achieved' }

function pctOf(g) { return g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0 }

// Compare progress against time elapsed between creation and due date
function pace(g) {
  if (!g.due || !g.created_at || g.status !== 'active') return null
  const start = String(g.created_at).slice(0, 10)
  const total = daysBetween(start, g.due)
  if (total <= 0) return null
  const elapsed = Math.min(total, Math.max(0, daysBetween(start, today())))
  const expected = Math.round((elapsed / total) * 100)
  const p = pctOf(g)
  if (p >= 100) return null
  if (p + 10 < expected) return { tone: 'warn', text: 'Behind pace' }
  if (p > expected + 10) return { tone: 'good', text: 'Ahead of pace' }
  return { tone: 'muted', text: 'On pace' }
}

function dueText(due) {
  if (!due) return null
  const n = daysBetween(today(), due)
  if (n < 0) return { text: `${plural(-n, 'day')} past due`, danger: true }
  if (n === 0) return { text: 'Due today', danger: true }
  if (n <= 45) return { text: `${plural(n, 'day')} left` }
  return { text: `Due ${fmtDay(due, { day: 'numeric', month: 'short', year: 'numeric' })}` }
}

export default function Goals() {
  const [params, setParams] = useSearchParams()
  const [goals, setGoals] = useState(null)
  const [ms, setMs] = useState({})
  const [horizon, setHorizon] = useState('all')
  const [creating, setCreating] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const toast = useToast()
  const confirm = useConfirm()
  const openId = params.get('id')

  async function reload() {
    const [g, m] = await Promise.all([
      sb.from('goals').select('*').order('created_at', { ascending: false }),
      sb.from('goal_milestones').select('*').order('sort_order', { ascending: true }),
    ])
    if (g.error) toast('Couldn’t load goals.', 'error')
    setGoals(g.data || [])
    const map = {}
    ;(m.data || []).forEach(x => { (map[x.goal_id] ||= []).push(x) })
    setMs(map)
  }
  useEffect(() => { reload() }, [])

  const save = useAutosave((id, p) => dbRun('Update goal', () => sb.from('goals').update({ ...p, updated_at: nowIso() }).eq('id', id)), 500)

  function patch(id, p) {
    setGoals(gs => gs.map(g => g.id === id ? { ...g, ...p } : g))
    save.queue(id, p)
  }

  function step(g, delta) {
    const current = Math.max(0, Math.min(g.target, (g.current || 0) + delta))
    patch(g.id, { current })
    if (current >= g.target && g.current < g.target) {
      toast(`You hit the target for “${g.title}”`, { action: { label: 'Mark achieved', onClick: () => patch(g.id, { status: 'done' }) } })
    }
  }

  async function remove(g) {
    const n = (ms[g.id] || []).length
    const ok = await confirm({
      title: `Delete “${g.title}”?`,
      body: n ? `Its ${plural(n, 'milestone')} will be deleted too. This can’t be undone.` : 'This can’t be undone.',
      confirmLabel: 'Delete goal',
    })
    if (!ok) return
    setParams({})
    setGoals(gs => gs.filter(x => x.id !== g.id))
    try { await dbRun('Delete goal', () => sb.from('goals').delete().eq('id', g.id)); toast('Goal deleted') }
    catch { reload(); toast('Couldn’t delete the goal.', 'error') }
  }

  const list = useMemo(() => (goals || []).filter(g => horizon === 'all' || g.horizon === horizon), [goals, horizon])
  if (!goals) return <PageLoader />
  const active = list.filter(g => g.status !== 'done')
  const done = list.filter(g => g.status === 'done')
  const openGoal = goals.find(g => g.id === openId)

  return (
    <div className="max-w-[1040px] mx-auto px-4 md:px-8 pt-8 md:pt-12">
      <header className="flex flex-wrap items-end gap-4 mb-6">
        <div className="mr-auto">
          <h1 className="h-page">Goals</h1>
          <p className="text-[14px] text-muted mt-1">{goals.filter(g => g.status === 'active').length} active, {goals.filter(g => g.status === 'done').length} achieved</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn btn-primary"><Plus size={16} /> New goal</button>
      </header>

      {goals.length > 0 && (
        <div className="mb-6 overflow-x-auto">
          <Seg label="Horizon" value={horizon} onChange={setHorizon}
            options={[{ value: 'all', label: 'All' }, { value: 'monthly', label: 'Month' }, { value: 'quarterly', label: 'Quarter' }, { value: 'yearly', label: 'Year' }]} />
        </div>
      )}

      {goals.length === 0 ? (
        <Empty icon={Target} title="No goals yet" body="Pick one outcome for this quarter. Give it a number and a date, and break it into milestones."
          action={<button onClick={() => setCreating(true)} className="btn btn-primary"><Plus size={16} /> New goal</button>} />
      ) : (
        <>
          {active.length === 0 && <p className="text-[15px] text-muted">No open goals for this horizon.</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {active.map(g => <GoalCard key={g.id} g={g} milestones={ms[g.id] || []} onOpen={() => setParams({ id: g.id })} onStep={step} />)}
          </div>
          {done.length > 0 && (
            <section className="mt-10">
              <button onClick={() => setShowDone(s => !s)} aria-expanded={showDone} className="flex items-center gap-1.5 px-1 text-[14px] text-muted hover:text-ink">
                <ChevronDown size={16} style={{ transform: showDone ? 'rotate(180deg)' : 'none', transition: 'transform 200ms var(--ease-out)' }} />
                Achieved <span className="text-faint tnum">{done.length}</span>
              </button>
              {showDone && (
                <div className="panel p-1.5 mt-2">
                  {done.map(g => (
                    <div key={g.id} className="row row-hover cursor-pointer" onClick={() => setParams({ id: g.id })}>
                      <CheckCircle2 size={18} className="text-good flex-shrink-0" />
                      <span className="flex-1 text-[14.5px] truncate">{g.title}</span>
                      <span className="text-[12.5px] text-faint hidden sm:inline">{HORIZONS[g.horizon]}</span>
                      <Menu items={[
                        { label: 'Reopen', icon: <RotateCcw size={15} />, onClick: () => patch(g.id, { status: 'active' }) },
                        { divider: true },
                        { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: () => remove(g) },
                      ]} />
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      <CreateGoal open={creating} onClose={() => setCreating(false)}
        onCreated={g => { setGoals(gs => [g, ...gs]); setCreating(false); setParams({ id: g.id }) }} />

      <GoalSheet goal={openGoal} milestones={openGoal ? ms[openGoal.id] || [] : []} setMs={setMs}
        status={save.status} retry={save.retry}
        onPatch={p => patch(openGoal.id, p)} onClose={async () => { await save.flush(); setParams({}) }} onDelete={() => remove(openGoal)} />
    </div>
  )
}

function GoalCard({ g, milestones, onOpen, onStep }) {
  const pct = pctOf(g)
  const p = pace(g)
  const due = dueText(g.due)
  const msDone = milestones.filter(m => m.done).length
  const nextMs = milestones.find(m => !m.done)
  return (
    <article className="panel p-5 flex flex-col gap-4 cursor-pointer transition-shadow hover:shadow-[inset_0_0_0_1px_var(--c-line)]" onClick={onOpen}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] text-muted mb-1">
            {HORIZONS[g.horizon] || 'Goal'}{g.status === 'paused' && <span className="ml-2 inline-flex items-center gap-1"><Pause size={11} /> Paused</span>}
          </p>
          <h2 className="font-serif text-[20px] leading-snug font-medium" style={{ textWrap: 'balance' }}>{g.title}</h2>
          {g.description && <p className="text-[13.5px] text-muted mt-1 line-clamp-2">{g.description}</p>}
        </div>
        <span className="font-serif text-[28px] leading-none tnum" style={{ color: 'var(--m-goals)' }}>{pct}%</span>
      </div>
      <div>
        <div className="h-1.5 rounded-full bg-line overflow-hidden">
          <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${pct}%`, background: 'var(--m-goals)' }} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[12.5px]">
          {p && <span style={{ color: p.tone === 'warn' ? 'var(--c-warn)' : p.tone === 'good' ? 'var(--c-good)' : 'var(--c-muted)' }}>{p.text}</span>}
          {due && <span style={{ color: due.danger ? 'var(--c-danger)' : 'var(--c-muted)' }}>{due.text}</span>}
          {milestones.length > 0 && <span className="text-muted">{msDone} of {milestones.length} milestones</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center rounded-[10px] shadow-[inset_0_0_0_1px_var(--c-line)]">
          <button onClick={() => onStep(g, -1)} className="w-9 h-9 flex items-center justify-center text-muted hover:text-ink" aria-label="Decrease progress"><Minus size={15} /></button>
          <span className="px-1 text-[13.5px] tnum min-w-[64px] text-center">{g.current} / {g.target}</span>
          <button onClick={() => onStep(g, 1)} className="w-9 h-9 flex items-center justify-center text-muted hover:text-ink" aria-label="Increase progress"><Plus size={15} /></button>
        </div>
        {nextMs && <span className="text-[12.5px] text-muted truncate">Next: {nextMs.title}</span>}
      </div>
    </article>
  )
}

function CreateGoal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ title: '', horizon: 'quarterly', target: 100, due: '' })
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  useEffect(() => { if (open) setForm({ title: '', horizon: 'quarterly', target: 100, due: defaultDue('quarterly') }) }, [open])

  async function submit(e) {
    e.preventDefault()
    if (!form.title.trim() || busy) return
    setBusy(true)
    const g = { id: uid(), title: form.title.trim(), description: '', horizon: form.horizon, status: 'active',
      target: Math.max(1, +form.target || 100), current: 0, due: form.due || null, created_at: today(), updated_at: nowIso() }
    try { await dbRun('Create goal', () => sb.from('goals').insert(g)); onCreated(g) }
    catch { toast('Couldn’t create the goal.', 'error') }
    finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New goal" width={480}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label className="label" htmlFor="gt">What do you want to achieve?</label>
          <input id="gt" data-autofocus className="input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Publish book two, run a half marathon…" />
        </div>
        <div>
          <span className="label">Horizon</span>
          <Seg value={form.horizon} onChange={v => setForm(p => ({ ...p, horizon: v, due: defaultDue(v) }))}
            options={[{ value: 'monthly', label: 'Month' }, { value: 'quarterly', label: 'Quarter' }, { value: 'yearly', label: 'Year' }]} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="gn">Target number</label>
            <input id="gn" type="number" min="1" className="input tnum" value={form.target} onChange={e => setForm(p => ({ ...p, target: e.target.value }))} />
          </div>
          <div>
            <label className="label" htmlFor="gd">Due</label>
            <input id="gd" type="date" className="input" value={form.due} onChange={e => setForm(p => ({ ...p, due: e.target.value }))} />
          </div>
        </div>
        <p className="text-[12.5px] text-faint -mt-1">Use 100 for a percentage, or a real count like 12 chapters.</p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn btn-outline">Cancel</button>
          <button type="submit" disabled={!form.title.trim() || busy} className="btn btn-primary">Create goal</button>
        </div>
      </form>
    </Dialog>
  )
}

function defaultDue(h) {
  const d = new Date()
  if (h === 'monthly') return fmtIso(new Date(d.getFullYear(), d.getMonth() + 1, 0))
  if (h === 'yearly') return fmtIso(new Date(d.getFullYear(), 11, 31))
  const q = Math.floor(d.getMonth() / 3)
  return fmtIso(new Date(d.getFullYear(), q * 3 + 3, 0))
}
function fmtIso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

// ── Detail sheet (autosaves) ───────────────────────────────────
function GoalSheet({ goal, milestones, setMs, status, retry, onPatch, onClose, onDelete }) {
  const [newMs, setNewMs] = useState('')
  const toast = useToast()
  const confirm = useConfirm()
  const msSave = useAutosave((id, p) => dbRun('Update milestone', () => sb.from('goal_milestones').update(p).eq('id', id)), 500)

  function patchMs(m, p) {
    setMs(s => ({ ...s, [m.goal_id]: s[m.goal_id].map(x => x.id === m.id ? { ...x, ...p } : x) }))
    msSave.queue(m.id, p)
  }

  async function addMs(e) {
    e.preventDefault()
    if (!newMs.trim()) return
    const m = { id: uid(), goal_id: goal.id, title: newMs.trim(), due: null, done: false, sort_order: milestones.length, created_at: today() }
    setMs(s => ({ ...s, [goal.id]: [...(s[goal.id] || []), m] }))
    setNewMs('')
    try { await dbRun('Add milestone', () => sb.from('goal_milestones').insert(m)) }
    catch { setMs(s => ({ ...s, [goal.id]: s[goal.id].filter(x => x.id !== m.id) })); toast('Couldn’t add the milestone.', 'error') }
  }

  async function removeMs(m) {
    const ok = await confirm({ title: 'Delete this milestone?', body: `“${m.title}” will be removed from the goal.`, confirmLabel: 'Delete milestone' })
    if (!ok) return
    setMs(s => ({ ...s, [m.goal_id]: s[m.goal_id].filter(x => x.id !== m.id) }))
    try { await dbRun('Delete milestone', () => sb.from('goal_milestones').delete().eq('id', m.id)) }
    catch { toast('Couldn’t delete the milestone.', 'error') }
  }

  const combined = status === 'error' || msSave.status === 'error' ? 'error'
    : [status, msSave.status].includes('saving') ? 'saving'
    : [status, msSave.status].includes('pending') ? 'pending'
    : [status, msSave.status].includes('saved') ? 'saved' : 'idle'

  return (
    <Sheet open={!!goal} onClose={async () => { await msSave.flush(); onClose() }} label="Goal details" width={520}
      title={<SaveState status={combined} onRetry={() => { retry(); msSave.retry() }} />}
      footer={goal && (
        <div className="flex gap-2">
          {goal.status === 'done'
            ? <button onClick={() => onPatch({ status: 'active' })} className="btn btn-outline btn-sm"><RotateCcw size={15} /> Reopen</button>
            : <button onClick={() => onPatch({ status: 'done' })} className="btn btn-primary btn-sm"><CheckCircle2 size={15} /> Mark achieved</button>}
          <button onClick={onDelete} className="btn btn-quiet btn-sm text-danger ml-auto"><Trash2 size={15} /> Delete</button>
        </div>
      )}>
      {goal && (
        <div className="flex flex-col gap-7">
          <div>
            <textarea value={goal.title} rows={1} onChange={e => { onPatch({ title: e.target.value }); grow(e.target) }} ref={grow}
              className="w-full bg-transparent outline-none resize-none font-serif text-[26px] leading-[1.25] font-medium" aria-label="Goal title" />
            <textarea value={goal.description || ''} rows={2} placeholder="Why does this matter?"
              onChange={e => { onPatch({ description: e.target.value }); grow(e.target) }} ref={grow}
              className="w-full bg-transparent outline-none resize-none text-[14.5px] text-muted mt-2 placeholder:text-faint" aria-label="Why it matters" />
          </div>

          <div>
            <div className="flex items-baseline mb-2">
              <span className="label mb-0">Progress</span>
              <span className="ml-auto font-serif text-[22px] tnum" style={{ color: 'var(--m-goals)' }}>{pctOf(goal)}%</span>
            </div>
            <input type="range" min="0" max={goal.target} value={goal.current} onChange={e => onPatch({ current: +e.target.value })}
              className="w-full accent-[var(--m-goals)]" aria-label="Progress" />
            <div className="grid grid-cols-2 gap-3 mt-3">
              <label><span className="block text-[12.5px] text-muted mb-1">Current</span>
                <input type="number" min="0" className="input tnum" value={goal.current} onChange={e => onPatch({ current: Math.max(0, +e.target.value || 0) })} /></label>
              <label><span className="block text-[12.5px] text-muted mb-1">Target</span>
                <input type="number" min="1" className="input tnum" value={goal.target} onChange={e => onPatch({ target: Math.max(1, +e.target.value || 1) })} /></label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label><span className="label">Horizon</span>
              <select className="input" value={goal.horizon} onChange={e => onPatch({ horizon: e.target.value })}>
                {Object.entries(HORIZONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
            <label><span className="label">Due</span>
              <input type="date" className="input" value={goal.due || ''} onChange={e => onPatch({ due: e.target.value || null })} /></label>
            <label className="col-span-2"><span className="label">Status</span>
              <Seg value={goal.status} onChange={v => onPatch({ status: v })} options={Object.entries(STATUS).map(([value, label]) => ({ value, label }))} /></label>
          </div>

          <div>
            <p className="label">Milestones {milestones.length > 0 && <span className="text-faint font-normal">· {milestones.filter(m => m.done).length} of {milestones.length}</span>}</p>
            <div className="flex flex-col">
              {milestones.map(m => (
                <div key={m.id} className="flex items-center gap-3 min-h-[44px] border-b border-line-soft group">
                  <Check2 checked={m.done} onChange={() => patchMs(m, { done: !m.done })} label={m.done ? 'Mark not done' : 'Mark done'} />
                  <input value={m.title} onChange={e => patchMs(m, { title: e.target.value })}
                    className={`inline-edit flex-1 text-[14px] ${m.done ? 'line-through text-muted' : ''}`} aria-label="Milestone" />
                  <input type="date" value={m.due || ''} onChange={e => patchMs(m, { due: e.target.value || null })}
                    className="bg-transparent text-[12.5px] text-muted w-[124px] outline-none" aria-label="Milestone due date" />
                  <button onClick={() => removeMs(m)} className="btn btn-quiet btn-sm btn-icon md:opacity-0 md:group-hover:opacity-100 focus:opacity-100" aria-label="Delete milestone"><X size={15} /></button>
                </div>
              ))}
            </div>
            <form onSubmit={addMs} className="flex items-center gap-3 min-h-[44px]">
              <Plus size={17} className="text-faint ml-0.5" />
              <input value={newMs} onChange={e => setNewMs(e.target.value)} placeholder="Add a milestone…" className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-faint" aria-label="New milestone" />
            </form>
          </div>
          <p className="text-[12px] text-faint">Created {goal.created_at ? fmtDay(String(goal.created_at).slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</p>
        </div>
      )}
    </Sheet>
  )
}

function grow(el) { if (!el) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }
