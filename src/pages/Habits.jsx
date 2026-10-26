import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Flame, Archive, ArchiveRestore, Trash2, PenLine, X, ChevronDown, Check } from 'lucide-react'
import { Dialog, Sheet, Menu, Empty, PageLoader, SaveState, useToast, useConfirm } from '../components/ui'
import { useBus, emit } from '../lib/bus'
import { useAutosave } from '../lib/useAutosave'
import { loadHabitData, createHabit, updateHabit, deleteHabit, setLog, saveWriting, CATEGORIES } from '../lib/habits'
import { sb, dbRun } from '../lib/supabase'
import { today, addDays, parseYmd, fmtDay, relDay, fmtMinutes, fmtNum, streakFrom, plural, weekOffset } from '../lib/utils'
import { useAuth } from '../contexts/AuthContext'

const FREQ = { daily: 'Every day', weekdays: 'Weekdays', weekly: 'Weekly' }
const TYPES = { simple: 'Done or not', variants: 'Pick a variant', writing: 'Writing (words & chapters)' }

function bestStreak(dates) {
  const s = [...new Set(dates)].sort()
  let best = 0, cur = 0, prev = null
  for (const d of s) { cur = prev && addDays(prev, 1) === d ? cur + 1 : 1; best = Math.max(best, cur); prev = d }
  return best
}

export default function Habits() {
  const [data, setData] = useState(null)
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [showArchived, setShowArchived] = useState(false)
  const toast = useToast()
  const confirm = useConfirm()

  const reload = () => loadHabitData().then(setData).catch(() => { setData({ habits: [], logs: {}, writing: [] }); toast('Couldn’t load habits.', 'error') })
  useEffect(() => { reload() }, [])
  useBus('habits', reload)
  useBus('writing', reload)

  const d = today()
  const week = Array.from({ length: 7 }, (_, i) => addDays(d, i - 6))

  async function toggleDay(h, date, entry) {
    const prev = (data.logs[h.id] || []).find(l => l.date === date) || null
    setData(s => ({ ...s, logs: { ...s.logs, [h.id]: [...(s.logs[h.id] || []).filter(l => l.date !== date), ...(entry ? [{ date, ...entry }] : [])] } }))
    try {
      await setLog(h.id, date, entry)
      if (!entry && prev) toast(`${h.name}: ${relDay(date).toLowerCase()} unmarked`, { action: { label: 'Undo', onClick: () => toggleDay(h, date, prev) } })
    } catch { reload(); toast('Couldn’t save that.', 'error') }
  }

  async function archive(h, archived) {
    setData(s => ({ ...s, habits: s.habits.map(x => x.id === h.id ? { ...x, archived } : x) }))
    try {
      await updateHabit(h.id, { archived })
      toast(archived ? `${h.name} archived` : `${h.name} restored`, { action: { label: 'Undo', onClick: () => archive(h, !archived) } })
    } catch { reload(); toast('Couldn’t update the habit.', 'error') }
  }

  async function remove(h) {
    const days = (data.logs[h.id] || []).length
    const ok = await confirm({
      title: `Delete “${h.name}”?`,
      body: days ? `This also deletes ${plural(days, 'logged day')}. Archive it instead if you might come back to it.` : 'This can’t be undone.',
      confirmLabel: 'Delete habit',
    })
    if (!ok) return
    setOpenId(null)
    setData(s => ({ ...s, habits: s.habits.filter(x => x.id !== h.id) }))
    try { await deleteHabit(h.id); toast('Habit deleted') } catch { reload(); toast('Couldn’t delete the habit.', 'error') }
  }

  if (!data) return <PageLoader />
  const active = data.habits.filter(h => !h.archived)
  const archived = data.habits.filter(h => h.archived)
  const doneToday = active.filter(h => h.trackType === 'writing' ? data.writing.some(w => w.date === d) : (data.logs[h.id] || []).some(l => l.date === d)).length
  const groups = groupByCategory(active)
  const openHabit = data.habits.find(h => h.id === openId)

  return (
    <div className="max-w-[920px] mx-auto px-4 md:px-8 pt-8 md:pt-12">
      <header className="flex flex-wrap items-end gap-4 mb-8">
        <div className="mr-auto">
          <h1 className="h-page">Habits</h1>
          <p className="text-[14px] text-muted mt-1">{active.length ? `${doneToday} of ${active.length} done today` : 'Small things, every day'}</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn btn-primary"><Plus size={16} /> New habit</button>
      </header>

      {active.length === 0 ? (
        <Empty icon={Flame} title="No habits yet" body="Start with one you can do in two minutes. You can log time against it later."
          action={<button onClick={() => setCreating(true)} className="btn btn-primary"><Plus size={16} /> New habit</button>} />
      ) : (
        <div className="panel overflow-x-auto">
          <div className="min-w-[520px] pb-1">
            <div className="grid grid-cols-[minmax(0,1fr)_repeat(7,40px)_44px] items-end px-3 pt-3 pb-2 text-[11.5px] text-faint sticky top-0">
              <span />
              {week.map(day => (
                <span key={day} className={`text-center ${day === d ? 'text-ink font-semibold' : ''}`}>
                  {parseYmd(day).toLocaleDateString('en-GB', { weekday: 'narrow' })}<br />
                  <span className="tnum">{parseYmd(day).getDate()}</span>
                </span>
              ))}
              <span />
            </div>
            {groups.map(([cat, list]) => (
              <section key={cat || 'none'} aria-label={cat || 'Habits'}>
                {groups.length > 1 && <h2 className="px-3 pt-4 pb-1.5 text-[12.5px] font-semibold text-muted border-t border-line-soft">{cat || 'Other'}</h2>}
                {list.map(h => (
                  <HabitRow key={h.id} h={h} week={week} logs={data.logs[h.id] || []} writing={data.writing}
                    onToggle={toggleDay} onOpen={() => setOpenId(h.id)}
                    onArchive={() => archive(h, true)} onDelete={() => remove(h)} />
                ))}
              </section>
            ))}
          </div>
        </div>
      )}

      {archived.length > 0 && (
        <section className="mt-10">
          <button onClick={() => setShowArchived(s => !s)} aria-expanded={showArchived} className="flex items-center gap-1.5 px-1 text-[14px] text-muted hover:text-ink">
            <ChevronDown size={16} style={{ transform: showArchived ? 'rotate(180deg)' : 'none', transition: 'transform 200ms var(--ease-out)' }} />
            Archived <span className="text-faint tnum">{archived.length}</span>
          </button>
          {showArchived && (
            <div className="panel p-1.5 mt-2">
              {archived.map(h => (
                <div key={h.id} className="row">
                  <span className="flex-1 text-[14px] text-muted">{h.name}</span>
                  <button onClick={() => archive(h, false)} className="btn btn-quiet btn-sm"><ArchiveRestore size={15} /> Restore</button>
                  <button onClick={() => remove(h)} className="btn btn-quiet btn-sm btn-icon" aria-label={`Delete ${h.name}`}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <CreateHabit open={creating} onClose={() => setCreating(false)}
        onCreated={h => { setData(s => ({ ...s, habits: [...s.habits, h] })); setCreating(false); setOpenId(h.trackType === 'variants' ? h.id : null) }} />

      <HabitSheet habit={openHabit} logs={openHabit ? data.logs[openHabit.id] || [] : []} writing={data.writing}
        onClose={() => setOpenId(null)} setData={setData} onToggle={toggleDay}
        onArchive={() => { archive(openHabit, !openHabit.archived); setOpenId(null) }} onDelete={() => remove(openHabit)} />
    </div>
  )
}

function groupByCategory(list) {
  const map = new Map()
  list.forEach(h => { const k = h.category || ''; if (!map.has(k)) map.set(k, []); map.get(k).push(h) })
  return [...map.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
}

// ── One habit row with a 7-day strip ───────────────────────────
function HabitRow({ h, week, logs, writing, onToggle, onOpen, onArchive, onDelete }) {
  const isWriting = h.trackType === 'writing'
  const dates = isWriting ? writing.map(w => w.date) : logs.map(l => l.date)
  const streak = streakFrom(dates)
  const [pick, setPick] = useState(null)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_repeat(7,40px)_44px] items-center px-3 min-h-[52px] border-t border-line-soft">
      <button onClick={onOpen} className="text-left min-w-0 pr-3 py-2 group">
        <span className="block text-[14.5px] font-medium truncate group-hover:underline underline-offset-2">{h.name}</span>
        <span className="block text-[12px] text-faint">
          {streak > 0 ? <span className="inline-flex items-center gap-1"><Flame size={12} style={{ color: 'var(--m-habits)' }} />{streak}-day streak</span> : FREQ[h.freq] || 'Every day'}
        </span>
      </button>
      {week.map(day => {
        const entry = isWriting ? null : logs.find(l => l.date === day)
        const w = isWriting ? writing.find(x => x.date === day) : null
        const done = isWriting ? !!w : !!entry
        const isVar = h.trackType === 'variants' && h.variants.length > 0
        const label = `${h.name}, ${fmtDay(day, { weekday: 'long', day: 'numeric', month: 'short' })}: ${done ? (entry?.variant || (w ? `${fmtNum(w.word_count)} words` : 'done')) : 'not done'}`
        return (
          <div key={day} className="relative flex justify-center">
            <button aria-label={label} aria-pressed={done}
              onClick={() => isWriting ? onOpen() : isVar ? setPick(p => p === day ? null : day) : onToggle(h, day, done ? null : { variant: null, duration_min: null })}
              className="w-[30px] h-[30px] rounded-full flex items-center justify-center transition-[background-color,box-shadow,transform] duration-150 active:scale-90"
              style={{
                background: done ? 'var(--m-habits)' : 'transparent',
                boxShadow: done ? 'none' : `inset 0 0 0 1.5px ${day === today() ? 'var(--c-faint)' : 'var(--c-line)'}`,
                color: '#fff',
              }}>
              {done && (entry?.variant ? <span className="text-[10px] font-bold">{entry.variant.slice(0, 1).toUpperCase()}</span> : <Check size={14} strokeWidth={3} />)}
            </button>
            {pick === day && (
              <VariantPop variants={h.variants} current={entry?.variant} onClose={() => setPick(null)}
                onPick={v => { onToggle(h, day, v === null ? null : { variant: v, duration_min: entry?.duration_min || null }); setPick(null) }} />
            )}
          </div>
        )
      })}
      <div className="flex justify-end">
        <Menu items={[
          { label: 'Edit', icon: <PenLine size={15} />, onClick: onOpen },
          { label: 'Archive', icon: <Archive size={15} />, onClick: onArchive },
          { divider: true },
          { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: onDelete },
        ]} />
      </div>
    </div>
  )
}

function VariantPop({ variants, current, onPick, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (!ref.current?.contains(e.target)) onClose() }
    const k = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', h); document.addEventListener('keydown', k)
    ref.current?.querySelector('button')?.focus()
    return () => { document.removeEventListener('pointerdown', h); document.removeEventListener('keydown', k) }
  }, [])
  return (
    <div ref={ref} role="menu" className="absolute top-[calc(100%+4px)] z-30 min-w-[150px] bg-surface rounded-[12px] shadow-pop py-1.5">
      {variants.map(v => (
        <button key={v} role="menuitem" onClick={() => onPick(v)} className="w-full flex items-center gap-2 px-3 h-9 text-[13.5px] text-left hover:bg-sunken">
          <span className="flex-1">{v}</span>{current === v && <Check size={14} className="text-accent" />}
        </button>
      ))}
      {current && <>
        <div className="my-1 h-px bg-line-soft" />
        <button role="menuitem" onClick={() => onPick(null)} className="w-full px-3 h-9 text-[13.5px] text-left hover:bg-sunken text-muted">Clear day</button>
      </>}
    </div>
  )
}

// ── Create ─────────────────────────────────────────────────────
function CreateHabit({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', trackType: 'simple', category: '', freq: 'daily', variants: [] })
  const [variant, setVariant] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  useEffect(() => { if (open) { setForm({ name: '', trackType: 'simple', category: '', freq: 'daily', variants: [] }); setVariant('') } }, [open])
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim() || busy) return
    setBusy(true)
    const variants = variant.trim() ? [...form.variants, variant.trim()] : form.variants
    try { const h = await createHabit({ ...form, variants }); toast(`“${h.name}” added`); onCreated(h) }
    catch { toast('Couldn’t create the habit.', 'error') }
    finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New habit" width={480}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label className="label" htmlFor="hn">Name</label>
          <input id="hn" className="input" value={form.name} onChange={e => f('name', e.target.value)} placeholder="Morning walk, read 20 pages…" data-autofocus />
        </div>
        <div>
          <span className="label">How do you track it?</span>
          <div className="flex flex-col gap-1.5">
            {Object.entries(TYPES).map(([k, v]) => (
              <label key={k} className="flex items-center gap-3 h-10 px-3 rounded-[10px] cursor-pointer"
                style={{ boxShadow: `inset 0 0 0 ${form.trackType === k ? '1.5px var(--c-accent)' : '1px var(--c-line)'}`, background: form.trackType === k ? 'var(--c-accent-soft)' : undefined }}>
                <input type="radio" name="tt" value={k} checked={form.trackType === k} onChange={() => f('trackType', k)} className="accent-[var(--c-accent)]" />
                <span className="text-[14px]">{v}</span>
              </label>
            ))}
          </div>
        </div>
        {form.trackType === 'variants' && (
          <div>
            <span className="label">Variants</span>
            <VariantEditor variants={form.variants} onChange={v => f('variants', v)} value={variant} setValue={setVariant} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="hc">Category</label>
            <select id="hc" className="input" value={form.category} onChange={e => f('category', e.target.value)}>
              <option value="">None</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="hf">How often</label>
            <select id="hf" className="input" value={form.freq} onChange={e => f('freq', e.target.value)}>
              {Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn btn-outline">Cancel</button>
          <button type="submit" disabled={!form.name.trim() || busy} className="btn btn-primary">Add habit</button>
        </div>
      </form>
    </Dialog>
  )
}

function VariantEditor({ variants, onChange, value, setValue, onRemove }) {
  function add() { const v = value.trim(); if (v && !variants.includes(v)) onChange([...variants, v]); setValue('') }
  return (
    <div>
      <div className="flex gap-2">
        <input className="input" value={value} onChange={e => setValue(e.target.value)} placeholder="Push, Pull, Legs…"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} aria-label="New variant" />
        <button type="button" onClick={add} className="btn btn-outline">Add</button>
      </div>
      {variants.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {variants.map(v => (
            <span key={v} className="chip h-7 pr-1">
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onRemove ? onRemove(v) : onChange(variants.filter(x => x !== v))}
                className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-line"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Detail / edit sheet (autosaves) ────────────────────────────
function HabitSheet({ habit, logs, writing, onClose, setData, onToggle, onArchive, onDelete }) {
  const [h, setH] = useState(habit)
  const [variant, setVariant] = useState('')
  const confirm = useConfirm()
  const { queue, flush, status, retry } = useAutosave((id, p) => updateHabit(id, p), 600)
  useEffect(() => { if (habit && habit.id !== h?.id) setH(habit); if (!habit) setH(null) }, [habit])
  useEffect(() => { if (habit) setH(x => x && x.id === habit.id ? { ...x, archived: habit.archived } : habit) }, [habit?.archived])

  function set(patch) {
    setH(x => ({ ...x, ...patch }))
    setData(s => ({ ...s, habits: s.habits.map(x => x.id === h.id ? { ...x, ...patch } : x) }))
    queue(h.id, patch)
  }

  async function removeVariant(v) {
    const used = logs.filter(l => l.variant === v).length
    if (used) {
      const ok = await confirm({ title: `Remove “${v}”?`, body: `It’s on ${plural(used, 'logged day')}. Those days keep their label; it just won’t be offered again.`, confirmLabel: 'Remove variant' })
      if (!ok) return
    }
    set({ variants: h.variants.filter(x => x !== v) })
  }

  const isWriting = h?.trackType === 'writing'
  const dates = h ? (isWriting ? writing.map(w => w.date) : logs.map(l => l.date)) : []
  const totalMin = logs.reduce((a, l) => a + (l.duration_min || 0), 0)

  return (
    <Sheet open={!!habit} onClose={async () => { await flush(); onClose() }} label="Habit details"
      title={<SaveState status={status} onRetry={retry} />}
      footer={h && (
        <div className="flex gap-2">
          <button onClick={onArchive} className="btn btn-outline btn-sm">{h.archived ? <><ArchiveRestore size={15} /> Restore</> : <><Archive size={15} /> Archive</>}</button>
          <button onClick={onDelete} className="btn btn-quiet btn-sm text-danger ml-auto"><Trash2 size={15} /> Delete</button>
        </div>
      )}>
      {h && (
        <div className="flex flex-col gap-7">
          <input value={h.name} onChange={e => set({ name: e.target.value })} aria-label="Habit name"
            className="inline-edit text-[22px] font-semibold tracking-[-0.01em]" placeholder="Habit name" />

          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              ['Streak', streakFrom(dates) + 'd'],
              ['Best', bestStreak(dates) + 'd'],
              [isWriting ? 'Days written' : 'Days done', dates.length],
              isWriting ? ['Words', fmtNum(writing.reduce((a, w) => a + (w.word_count || 0), 0))] : ['Time', totalMin ? fmtMinutes(totalMin) : '—'],
            ].map(([l, v]) => (
              <div key={l} className="rounded-[12px] bg-sunken py-3">
                <p className="text-[18px] font-semibold tnum">{v}</p>
                <p className="text-[12px] text-muted">{l}</p>
              </div>
            ))}
          </div>

          {isWriting ? <WritingLog writing={writing} /> : <Heatmap logs={logs} onToggle={(day, entry) => onToggle(h, day, entry)} variants={h.trackType === 'variants' ? h.variants : null} />}

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="ec">Category</label>
                <select id="ec" className="input" value={h.category} onChange={e => set({ category: e.target.value })}>
                  <option value="">None</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="ef">How often</label>
                <select id="ef" className="input" value={h.freq} onChange={e => set({ freq: e.target.value })}>
                  {Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="et">Tracking</label>
              <select id="et" className="input" value={h.trackType} onChange={e => set({ trackType: e.target.value })}>
                {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {h.trackType === 'variants' && (
              <div>
                <span className="label">Variants</span>
                <VariantEditor variants={h.variants} value={variant} setValue={setVariant}
                  onChange={v => set({ variants: v })} onRemove={removeVariant} />
              </div>
            )}
          </div>
        </div>
      )}
    </Sheet>
  )
}

function Heatmap({ logs, onToggle, variants }) {
  const mondayFirst = useAuth().profile?.week_starts_monday !== false
  const d = today()
  const weeks = 16
  const start = (() => { const s = parseYmd(addDays(d, -(weeks * 7 - 1))); const back = weekOffset(s, mondayFirst); return addDays(addDays(d, -(weeks * 7 - 1)), -back) })()
  const days = []
  for (let x = start; x <= d; x = addDays(x, 1)) days.push(x)
  const set = new Map(logs.map(l => [l.date, l]))
  const cols = []
  for (let i = 0; i < days.length; i += 7) cols.push(days.slice(i, i + 7))
  return (
    <div>
      <p className="label">Last {weeks} weeks</p>
      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {cols.map((c, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {c.map(day => {
              const e = set.get(day)
              return (
                <button key={day} aria-label={`${fmtDay(day, { weekday: 'short', day: 'numeric', month: 'short' })}: ${e ? (e.variant || 'done') : 'not done'}`}
                  title={`${fmtDay(day, { weekday: 'short', day: 'numeric', month: 'short' })}${e?.variant ? ` · ${e.variant}` : ''}${e?.duration_min ? ` · ${fmtMinutes(e.duration_min)}` : ''}`}
                  onClick={() => variants ? null : onToggle(day, e ? null : { variant: null, duration_min: null })}
                  disabled={!!variants}
                  className="w-[18px] h-[18px] rounded-[4px] disabled:cursor-default"
                  style={{ background: e ? 'var(--m-habits)' : 'var(--c-line-soft)', outline: day === d ? '1.5px solid var(--c-faint)' : 'none', outlineOffset: 1 }} />
              )
            })}
          </div>
        ))}
      </div>
      {!variants && <p className="text-[12px] text-faint mt-2">Tap a square to fix a missed day.</p>}
    </div>
  )
}

function WritingLog({ writing }) {
  const confirm = useConfirm()
  const toast = useToast()
  const d = today()
  const existing = writing.find(w => w.date === d)
  const [wc, setWc] = useState(existing?.word_count ? String(existing.word_count) : '')
  const [ch, setCh] = useState(existing?.chapters ? String(existing.chapters) : '')
  const rowRef = useRef(existing)
  const { queue, status, retry } = useAutosave(async (_k, p) => { rowRef.current = await saveWriting(rowRef.current, d, p.ch, p.wc) }, 800)
  const change = (c, w) => { setCh(c); setWc(w); queue(d, { ch: parseInt(c, 10) || 0, wc: parseInt(w, 10) || 0 }) }

  async function removeDay(w) {
    const ok = await confirm({ title: `Delete the log for ${relDay(w.date).toLowerCase()}?`, body: `${fmtNum(w.word_count)} words and ${plural(w.chapters || 0, 'chapter')} will be removed from your writing history.`, confirmLabel: 'Delete log' })
    if (!ok) return
    try { await dbRun('Delete writing log', () => sb.from('writing_logs').delete().eq('id', w.id)); emit('writing'); toast('Log deleted') }
    catch { toast('Couldn’t delete that log.', 'error') }
  }

  return (
    <div>
      <div className="flex items-baseline mb-2"><p className="label mb-0">Today</p><SaveState status={status} onRetry={retry} className="ml-auto" /></div>
      <div className="flex gap-3 mb-6">
        <label className="flex-1"><span className="block text-[12.5px] text-muted mb-1">Words</span>
          <input type="number" min="0" inputMode="numeric" className="input tnum" value={wc} placeholder="0" onChange={e => change(ch, e.target.value)} /></label>
        <label className="w-[120px]"><span className="block text-[12.5px] text-muted mb-1">Chapters</span>
          <input type="number" min="0" inputMode="numeric" className="input tnum" value={ch} placeholder="0" onChange={e => change(e.target.value, wc)} /></label>
      </div>
      <p className="label">History</p>
      <div className="flex flex-col">
        {writing.filter(w => w.date !== d).slice(0, 30).map(w => (
          <div key={w.id} className="row px-0 min-h-[40px] border-b border-line-soft">
            <span className="w-28 text-[13px] text-muted">{fmtDay(w.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            <span className="flex-1 text-[13.5px] tnum">{fmtNum(w.word_count)} words{w.chapters ? ` · ${plural(w.chapters, 'chapter')}` : ''}</span>
            <button onClick={() => removeDay(w)} className="btn btn-quiet btn-sm btn-icon" aria-label="Delete this log"><Trash2 size={14} /></button>
          </div>
        ))}
        {writing.filter(w => w.date !== d).length === 0 && <p className="text-[13px] text-muted">Past days will show up here.</p>}
      </div>
    </div>
  )
}
