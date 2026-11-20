import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Dumbbell, ChevronLeft, ChevronRight, Plus, Trash2, Timer, Footprints, ArrowUp, ArrowDown, Flame, Scale, Trophy, X, Pencil } from 'lucide-react'
import { Dialog, Empty, PageLoader, Seg, Check2, Ring, useToast } from '../components/ui'
import { sb, dbRun } from '../lib/supabase'
import { uid, today, addDays, fmtDay, relDay, fmtNum, plural, nowIso, parseYmd } from '../lib/utils'
import DEMOS from '../lib/exercise-demos.json'
import {
  EXERCISES, DAYS, CYCLE, warmupFor, cooldownFor, nextDay, suggest, setLabel, sessionStats, supportiveMessage,
  MEALS, FOOD_PRESETS, DEFAULT_TARGETS,
} from '../lib/fitness'

const HUE = 'var(--m-fitness)'
const mondayOf = d => { const x = parseYmd(d); const off = (x.getDay() + 6) % 7; return addDays(d, -off) }

export default function Fitness() {
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get('tab') || 'workout')
  return (
    <div className="max-w-[880px] mx-auto px-4 md:px-8 pt-8 md:pt-12 pb-28">
      <header className="flex flex-wrap items-end gap-4 mb-6">
        <div className="mr-auto">
          <h1 className="h-page">Fitness</h1>
          <p className="text-[14px] text-muted mt-1">Lift, walk, eat well. Just open today’s plan and begin.</p>
        </div>
        <Seg label="Section" value={tab} onChange={setTab}
          options={[{ value: 'workout', label: 'Workout' }, { value: 'food', label: 'Food' }, { value: 'progress', label: 'Progress' }]} />
      </header>
      {tab === 'workout' && <Workout />}
      {tab === 'food' && <Food />}
      {tab === 'progress' && <Progress />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  Workout
// ════════════════════════════════════════════════════════════════
function Workout() {
  const toast = useToast()
  const d = today()
  const [sessions, setSessions] = useState(null)
  const [override, setOverride] = useState(null)
  const [allSets, setAllSets] = useState([])
  const [timer, setTimer] = useState(null) // { ends, total, label }
  const [celebrate, setCelebrate] = useState(null)
  const creating = useRef(null)

  async function loadSessions() {
    const { data, error } = await sb.from('workout_sessions').select('*').gte('date', addDays(d, -180)).order('date', { ascending: false })
    if (error) { toast('Couldn’t load workouts. Has the fitness migration been run?', 'error'); setSessions([]); return }
    setSessions(data || [])
  }
  useEffect(() => { loadSessions() }, [])

  const todays = sessions?.find(s => s.date === d) || null
  const dayType = todays?.day_type || override || (sessions ? nextDay(sessions) : null)
  const day = dayType ? DAYS[dayType] : null
  const ids = useMemo(() => day ? [...day.lifts, ...day.abs, ...(day.posture || [])] : [], [dayType])

  useEffect(() => {
    if (!ids.length) { setAllSets([]); return }
    sb.from('workout_sets').select('*').in('exercise_id', ids).order('created_at', { ascending: false }).limit(1000)
      .then(({ data, error }) => { if (error) toast('Couldn’t load your sets.', 'error'); setAllSets(data || []) })
  }, [ids.join(','), todays?.id])

  // History per exercise from earlier sessions, newest first
  const history = useMemo(() => {
    const byId = Object.fromEntries((sessions || []).map(s => [s.id, s]))
    const out = {}
    for (const id of ids) {
      const groups = {}
      for (const s of allSets) {
        if (s.exercise_id !== id || !s.done || s.session_id === todays?.id || !byId[s.session_id]) continue
        ;(groups[s.session_id] ||= []).push(s)
      }
      out[id] = Object.entries(groups)
        .map(([sid, sets]) => ({ date: byId[sid].date, sets: sets.sort((a, b) => a.set_no - b.set_no).map(x => ({ weight: Number(x.weight), reps: x.reps })) }))
        .sort((a, b) => b.date.localeCompare(a.date))
    }
    return out
  }, [allSets, sessions, ids, todays?.id])

  const prevBest = useMemo(() => {
    const out = {}
    for (const [id, hist] of Object.entries(history)) {
      for (const h of hist) for (const s of h.sets) {
        const b = out[id]
        if (!b || s.weight > b.weight || (s.weight === b.weight && s.reps > b.reps)) out[id] = { weight: s.weight, reps: s.reps }
      }
    }
    return out
  }, [history])

  const current = useMemo(() => allSets.filter(s => todays && s.session_id === todays.id), [allSets, todays?.id])

  async function ensureSession() {
    if (todays) return todays
    if (creating.current) return creating.current
    creating.current = (async () => {
      const row = { id: uid(), date: d, day_type: dayType, started_at: nowIso(), cardio_kind: day.cardio.kind }
      await dbRun('Start workout', () => sb.from('workout_sessions').insert(row))
      const full = { ...row, finished_at: null, cardio_min: null, cardio_km: null, warmup_done: false, cooldown_done: false, stats: {} }
      setSessions(s => [full, ...(s || [])])
      return full
    })()
    try { return await creating.current } finally { creating.current = null }
  }

  async function patchSession(p) {
    try {
      const s = await ensureSession()
      setSessions(list => list.map(x => x.id === s.id ? { ...x, ...p } : x))
      await dbRun('Save workout', () => sb.from('workout_sessions').update(p).eq('id', s.id))
    } catch { toast('Couldn’t save. Check your connection.', 'error') }
  }

  async function saveSet(ex, setNo, weight, reps, done) {
    try {
      const s = await ensureSession()
      if (!done) {
        setAllSets(all => all.filter(x => !(x.session_id === s.id && x.exercise_id === ex.id && x.set_no === setNo)))
        await dbRun('Undo set', () => sb.from('workout_sets').delete().eq('session_id', s.id).eq('exercise_id', ex.id).eq('set_no', setNo))
        return
      }
      const existing = allSets.find(x => x.session_id === s.id && x.exercise_id === ex.id && x.set_no === setNo)
      const row = { id: existing?.id || uid(), session_id: s.id, exercise_id: ex.id, set_no: setNo, weight: Number(weight) || 0, reps: Number(reps) || 0, done: true }
      setAllSets(all => [row, ...all.filter(x => x.id !== row.id)])
      await dbRun('Save set', () => sb.from('workout_sets').upsert(row, { onConflict: 'session_id,exercise_id,set_no' }))
      if (ex.rest) setTimer({ ends: Date.now() + ex.rest * 1000, total: ex.rest, label: ex.name })
    } catch { toast('Couldn’t save that set. Try again.', 'error') }
  }

  async function finish() {
    const s = await ensureSession().catch(() => null)
    if (!s) return toast('Couldn’t save. Check your connection.', 'error')
    const cardio = { minutes: s.cardio_min, km: s.cardio_km, target: cardioTarget }
    const stats = sessionStats(dayType, current, prevBest, cardio)
    const weekStart = mondayOf(d)
    const weekCount = (sessions || []).filter(x => x.date >= weekStart && x.finished_at && x.id !== s.id && x.day_type !== 'rest').length + (dayType === 'rest' ? 0 : 1)
    const msg = supportiveMessage(stats, dayType, weekCount)
    await patchSession({ finished_at: nowIso(), stats: { ...stats, message: msg } })
    logGymHabit(dayType, d)
    setTimer(null)
    setCelebrate({ msg, stats })
  }

  // Last cardio of the same kind: if the target was met, add 2 minutes (up to the cap)
  const cardioTarget = useMemo(() => {
    if (!day) return 0
    const prev = (sessions || []).find(s => s.id !== todays?.id && s.finished_at && DAYS[s.day_type]?.cardio.kind === day.cardio.kind && DAYS[s.day_type]?.cardio.name === day.cardio.name)
    if (!prev) return day.cardio.minutes
    const prevTarget = prev.stats?.cardioTarget || DAYS[prev.day_type].cardio.minutes
    if ((Number(prev.cardio_min) || 0) >= prevTarget) return Math.min(day.cardio.cap, prevTarget + 2)
    return prevTarget
  }, [sessions, dayType, todays?.id])

  if (!sessions) return <PageLoader />
  const finished = !!todays?.finished_at
  const nextAfter = CYCLE[(CYCLE.indexOf(dayType) + 1) % CYCLE.length]

  return (
    <div className="flex flex-col gap-5">
      {/* Day header */}
      <section className="panel p-5">
        <div className="flex flex-wrap items-start gap-4">
          <span className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--c-sunken)', color: HUE }}>
            {dayType === 'rest' ? <Footprints size={20} /> : <Dumbbell size={20} />}
          </span>
          <div className="flex-1 min-w-[200px]">
            <p className="text-[12.5px] text-muted">{relDay(d)} · {fmtDay(d, { weekday: 'long', day: 'numeric', month: 'short' })}</p>
            <h2 className="font-serif text-[24px] leading-tight font-medium">{day.label}</h2>
            {dayType !== 'rest' && <p className="text-[14px] text-muted">{day.focus}</p>}
            <p className="text-[13px] text-muted mt-1">
              {dayType === 'rest' ? 'No gym today. A long, easy walk and the posture routine at home.' : `About 75 min: warm-up 8, lifting ~35, abs 6, posture 4, ${day.cardio.name.toLowerCase()} ${cardioTarget}, cool-down 5.`}
            </p>
          </div>
          {!todays && (
            <label className="text-[12.5px] text-muted flex flex-col gap-1">
              Doing a different day?
              <select className="input py-1.5 text-[13.5px]" value={dayType} onChange={e => setOverride(e.target.value)}>
                {CYCLE.map(c => <option key={c} value={c}>{DAYS[c].label}</option>)}
              </select>
            </label>
          )}
        </div>
        {finished && (
          <div className="mt-4 rounded-[12px] p-4 bg-good-soft">
            <p className="text-[14.5px] font-semibold text-good">{todays.stats?.message?.title || 'Done for today'}</p>
            <p className="text-[13.5px] mt-1">{todays.stats?.message?.body}</p>
            <p className="text-[12.5px] text-muted mt-2">Next session: <b>{DAYS[nextAfter].label}</b>. You can still edit today’s sets below.</p>
          </div>
        )}
      </section>

      <Block title="Warm-up" sub="8 min" done={!!todays?.warmup_done} onToggle={() => patchSession({ warmup_done: !todays?.warmup_done })}>
        <StepList steps={warmupFor(dayType)} />
      </Block>

      {day.lifts.length > 0 && <h3 className="h-section px-1 mt-2">Lifting</h3>}
      {day.lifts.map(id => (
        <ExerciseCard key={id} ex={EXERCISES[id]} history={history[id] || []} current={current.filter(s => s.exercise_id === id)} onSave={saveSet} />
      ))}

      {day.abs.length > 0 && <h3 className="h-section px-1 mt-2">Abs</h3>}
      {day.abs.map(id => (
        <ExerciseCard key={id} ex={EXERCISES[id]} history={history[id] || []} current={current.filter(s => s.exercise_id === id)} onSave={saveSet} />
      ))}

      {day.posture?.length > 0 && <>
        <h3 className="h-section px-1 mt-2">Posture</h3>
        <p className="text-[13px] text-muted px-1 -mt-3">For a rounded upper back: open the chest, strengthen the upper back. Light and slow.</p>
      </>}
      {(day.posture || []).map(id => (
        <ExerciseCard key={id} ex={EXERCISES[id]} history={history[id] || []} current={current.filter(s => s.exercise_id === id)} onSave={saveSet} />
      ))}

      <Cardio day={day} target={cardioTarget} session={todays} onSave={patchSession} />

      <Block title="Cool-down" sub="5 min" done={!!todays?.cooldown_done} onToggle={() => patchSession({ cooldown_done: !todays?.cooldown_done })}>
        <StepList steps={cooldownFor(dayType)} />
      </Block>

      <button onClick={finish} className="btn btn-primary btn-lg self-stretch md:self-end">
        <Trophy size={17} /> {finished ? 'Update finished workout' : dayType === 'rest' ? 'Log rest day' : 'Finish workout'}
      </button>

      {timer && <RestTimer timer={timer} onDone={() => setTimer(null)} />}

      <Dialog open={!!celebrate} onClose={() => setCelebrate(null)} title={celebrate?.msg.title || ''} width={440}>
        {celebrate && (
          <div className="flex flex-col gap-3">
            <p className="text-[15px] leading-relaxed">{celebrate.msg.body}</p>
            {celebrate.stats.prs.length > 0 && (
              <div className="rounded-[12px] p-3 bg-sunken">
                <p className="text-[12.5px] text-muted mb-1">New personal bests</p>
                {celebrate.stats.prs.map(p => <p key={p} className="text-[14px] font-medium flex items-center gap-2"><Trophy size={14} style={{ color: HUE }} /> {p}</p>)}
              </div>
            )}
            {celebrate.msg.extras.map(e => <p key={e} className="text-[14px] text-muted">{e}</p>)}
            <div className="grid grid-cols-3 gap-2 mt-1 text-center">
              <Stat label="Sets" value={`${celebrate.stats.done}/${celebrate.stats.planned}`} />
              <Stat label="Volume" value={`${fmtNum(celebrate.stats.volume)} kg`} />
              <Stat label="Cardio" value={`${celebrate.stats.cardioMin || 0} min`} />
            </div>
            <button onClick={() => setCelebrate(null)} className="btn btn-primary mt-2">Nice</button>
          </div>
        )}
      </Dialog>
    </div>
  )
}

async function logGymHabit(dayType, date) {
  try {
    const group = DAYS[dayType].group
    if (group === 'rest') return
    const { data } = await sb.from('habits').select('id,name,track_type,variants,archived')
    const h = (data || []).find(x => !x.archived && /gym/i.test(x.name))
    if (!h) return
    const map = { push: 'Push', pull: 'Pull', legs: 'Legs' }
    const variant = h.track_type === 'variants' && (h.variants || []).includes(map[group]) ? map[group] : null
    await sb.from('habit_logs').upsert({ habit_id: h.id, date, variant })
  } catch { /* the workout itself is saved; the habit tick is a bonus */ }
}

function Stat({ label, value }) {
  return (
    <div className="rounded-[10px] bg-sunken py-2">
      <p className="text-[15px] font-semibold tnum">{value}</p>
      <p className="text-[11.5px] text-muted">{label}</p>
    </div>
  )
}

function Block({ title, sub, done, onToggle, children }) {
  return (
    <section className="panel p-5">
      <div className="flex items-center gap-3 mb-3">
        <Check2 checked={done} onChange={onToggle} label={`${title} done`} />
        <h3 className="h-section">{title}</h3>
        <span className="text-[12.5px] text-faint">{sub}</span>
      </div>
      <div className={done ? 'opacity-60' : ''}>{children}</div>
    </section>
  )
}

function ExerciseCard({ ex, history, current, onSave }) {
  const sug = useMemo(() => suggest(ex, history), [ex.id, history])
  const last = history[0]
  const savedCount = current.reduce((m, s) => Math.max(m, s.set_no), 0)
  const [count, setCount] = useState(Math.max(ex.sets, savedCount))
  useEffect(() => { setCount(c => Math.max(c, savedCount)) }, [savedCount])
  const unitShort = ex.type === 'time' ? 'sec' : 'reps'
  const allDone = current.filter(s => s.done).length >= ex.sets

  return (
    <article className="panel p-4 md:p-5" style={allDone ? { boxShadow: 'inset 0 0 0 1.5px var(--c-good)' } : undefined}>
      <div className="flex items-start gap-3">
        <Demo id={ex.id} title={ex.name} cue={ex.cue} />
        <div className="flex-1 min-w-0">
          <h4 className="text-[16px] font-semibold leading-snug">{ex.name}</h4>
          <p className="text-[12.5px] text-muted">{ex.muscle} · {ex.sets} × {ex.repMin}–{ex.repMax} {unitShort}{ex.type === 'weight' ? ` · ${ex.unit}` : ''}</p>
        </div>
        {sug.up && <span className="chip text-good inline-flex items-center gap-1"><ArrowUp size={12} /> Go up</span>}
        {sug.down && <span className="chip text-warn inline-flex items-center gap-1"><ArrowDown size={12} /> Reset</span>}
      </div>
      <p className="text-[13px] mt-2">{sug.note}</p>
      <p className="text-[12.5px] text-faint mt-1">
        {last ? <>Last did {relDay(last.date).toLowerCase() === 'yesterday' ? 'yesterday' : fmtDay(last.date, { weekday: 'short', day: 'numeric', month: 'short' })}: <span className="tnum text-muted">{last.sets.map(s => setLabel(ex, s)).join(', ')}</span></> : 'First time doing this one'}
      </p>
      <p className="text-[12.5px] text-faint mt-0.5 italic">{ex.cue}</p>

      <div className="mt-3 flex flex-col gap-1.5">
        {Array.from({ length: count }, (_, i) => (
          <SetRow key={i} n={i + 1} ex={ex} sug={sug} saved={current.find(s => s.set_no === i + 1)} onSave={onSave} />
        ))}
      </div>
      {count < 6 && <button onClick={() => setCount(c => c + 1)} className="btn btn-quiet btn-sm mt-2"><Plus size={14} /> Add set</button>}
    </article>
  )
}

// Two-frame demo (start and end position), alternating like a slow animation. Tap for a large view and steps.
function Demo({ id, title, cue, small }) {
  const demo = DEMOS[id]
  const [frame, setFrame] = useState(0)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!demo || demo.frames.length < 2) return
    const t = setInterval(() => setFrame(f => 1 - f), 1100)
    return () => clearInterval(t)
  }, [demo])
  if (!demo) return null
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`How to do ${title}`}
        className={`${small ? 'w-[52px] h-[52px]' : 'w-[76px] h-[76px] md:w-[88px] md:h-[88px]'} rounded-[10px] overflow-hidden flex-shrink-0 bg-white shadow-[inset_0_0_0_1px_var(--c-line)]`}>
        <img src={demo.frames[frame]} alt="" className="w-full h-full object-cover" loading="lazy" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} width={520}>
        <div className="grid grid-cols-2 gap-2">
          {demo.frames.map((src, i) => (
            <figure key={src} className="rounded-[10px] overflow-hidden bg-white shadow-[inset_0_0_0_1px_var(--c-line)]">
              <img src={src} alt={`${title}, ${i === 0 ? 'start' : 'end'} position`} className="w-full aspect-square object-cover" />
              <figcaption className="text-[12px] text-muted text-center py-1">{i === 0 ? 'Start' : 'End'}</figcaption>
            </figure>
          ))}
        </div>
        {cue && <p className="text-[14px] font-medium mt-4">{cue}</p>}
        <ol className="list-decimal pl-5 mt-2 flex flex-col gap-1.5 text-[13.5px] text-muted">
          {demo.steps.map(s => <li key={s}>{s}</li>)}
        </ol>
        <p className="text-[11.5px] text-faint mt-3">Images and steps from the public-domain Free Exercise DB.</p>
      </Dialog>
    </>
  )
}

function StepList({ steps }) {
  return (
    <ul className="flex flex-col gap-2">
      {steps.map(s => (
        <li key={s.text} className="flex items-center gap-3 text-[14px]">
          {s.img ? <Demo id={s.img} title={s.text} small /> : <span className="w-[52px] h-[52px] rounded-[10px] bg-sunken flex-shrink-0" aria-hidden="true" />}
          <span>{s.text}</span>
        </li>
      ))}
    </ul>
  )
}

function SetRow({ n, ex, sug, saved, onSave }) {
  const [w, setW] = useState(saved ? String(Number(saved.weight)) : String(sug.weight || ''))
  const [r, setR] = useState(saved ? String(saved.reps) : '')
  const touched = useRef(false)
  useEffect(() => { if (saved) { setW(String(Number(saved.weight))); setR(String(saved.reps)) } }, [saved?.id])
  // History loads after first paint: follow the suggestion until the user edits the weight
  useEffect(() => { if (!saved && !touched.current) setW(String(sug.weight || '')) }, [sug.weight])
  const done = !!saved?.done
  const weighted = ex.type === 'weight'

  function toggle() {
    if (done) return onSave(ex, n, w, r, false)
    const reps = r === '' ? sug.target : r
    setR(String(reps))
    onSave(ex, n, weighted ? w : 0, reps, true)
  }
  function blurSave() { if (done) onSave(ex, n, weighted ? w : 0, r, true) }

  return (
    <div className={`flex items-center gap-2 rounded-[10px] px-2 py-1.5 ${done ? 'bg-good-soft' : 'bg-sunken'}`}>
      <span className="w-12 text-[12.5px] text-muted tnum">Set {n}</span>
      {weighted && (
        <label className="flex items-center gap-1">
          <input type="number" inputMode="decimal" step="0.5" min="0" value={w} onChange={e => { touched.current = true; setW(e.target.value) }} onBlur={blurSave}
            className="input w-[76px] py-1.5 text-center tnum text-[15px] font-semibold" aria-label={`Set ${n} weight in kg`} />
          <span className="text-[12px] text-muted">kg</span>
        </label>
      )}
      <label className="flex items-center gap-1">
        <input type="number" inputMode="numeric" min="0" value={r} placeholder={String(sug.target)} onChange={e => setR(e.target.value)} onBlur={blurSave}
          className="input w-[64px] py-1.5 text-center tnum text-[15px] font-semibold" aria-label={`Set ${n} ${ex.type === 'time' ? 'seconds' : 'reps'}`} />
        <span className="text-[12px] text-muted">{ex.type === 'time' ? 's' : 'reps'}</span>
      </label>
      <div className="ml-auto"><Check2 checked={done} onChange={toggle} label={`Set ${n} done`} size={26} /></div>
    </div>
  )
}

function Cardio({ day, target, session, onSave }) {
  const [min, setMin] = useState(session?.cardio_min != null ? String(Number(session.cardio_min)) : '')
  const [km, setKm] = useState(session?.cardio_km != null ? String(Number(session.cardio_km)) : '')
  useEffect(() => {
    setMin(session?.cardio_min != null ? String(Number(session.cardio_min)) : '')
    setKm(session?.cardio_km != null ? String(Number(session.cardio_km)) : '')
  }, [session?.id])
  const hit = Number(min) >= target
  const save = () => onSave({ cardio_kind: day.cardio.kind, cardio_min: min === '' ? null : Number(min), cardio_km: km === '' ? null : Number(km) })
  return (
    <section className="panel p-5" style={hit ? { boxShadow: 'inset 0 0 0 1.5px var(--c-good)' } : undefined}>
      <div className="flex items-baseline gap-3 mb-1">
        <h3 className="h-section flex items-center gap-2"><Footprints size={16} style={{ color: HUE }} /> {day.cardio.name}</h3>
        <span className="text-[12.5px] text-faint">{target} min</span>
      </div>
      <p className="text-[13px] text-muted">{day.cardio.how}{target > day.cardio.minutes ? ` Target is up from ${day.cardio.minutes} min because you hit it last time.` : ''}</p>
      <div className="flex gap-3 mt-3">
        <label className="flex-1">
          <span className="block text-[12.5px] text-muted mb-1">Minutes</span>
          <input type="number" inputMode="decimal" min="0" value={min} placeholder={String(target)} onChange={e => setMin(e.target.value)} onBlur={save} className="input tnum text-[16px] font-semibold" />
        </label>
        <label className="flex-1">
          <span className="block text-[12.5px] text-muted mb-1">Distance (km)</span>
          <input type="number" inputMode="decimal" step="0.01" min="0" value={km} placeholder="optional" onChange={e => setKm(e.target.value)} onBlur={save} className="input tnum text-[16px] font-semibold" />
        </label>
      </div>
    </section>
  )
}

function RestTimer({ timer, onDone }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t) }, [timer.ends])
  const left = Math.max(0, Math.ceil((timer.ends - now) / 1000))
  useEffect(() => { if (left === 0) { try { navigator.vibrate?.(300) } catch {} } }, [left === 0])
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-[calc(var(--dock-h,64px)+16px)] md:bottom-6 z-40 h-11 pl-4 pr-1.5 rounded-full shadow-float inline-flex items-center gap-3 text-[14px] font-semibold tnum"
      style={{ background: left ? 'var(--c-ink)' : 'var(--c-good)', color: 'var(--c-surface)' }} role="timer" aria-live="polite">
      <Timer size={16} /> {left ? `Rest ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Go! Next set'}
      <button onClick={onDone} className="w-8 h-8 rounded-full flex items-center justify-center opacity-80 hover:opacity-100" aria-label="Close timer"><X size={15} /></button>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  Food
// ════════════════════════════════════════════════════════════════
function defaultMeal() { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 19 ? 'snack' : 'dinner' }

function Food() {
  const toast = useToast()
  const [date, setDate] = useState(today())
  const [items, setItems] = useState(null)
  const [targets, setTargets] = useState(DEFAULT_TARGETS)
  const [recent, setRecent] = useState([])
  const [editTargets, setEditTargets] = useState(false)
  const [form, setForm] = useState({ meal: defaultMeal(), name: '', qty: '', servings: '1', kcal: '', protein: '' })
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    sb.from('fitness_settings').select('*').maybeSingle().then(({ data }) => { if (data) setTargets({ kcal_target: data.kcal_target, protein_target: data.protein_target }) })
    sb.from('food_logs').select('name,qty,kcal,protein,created_at').gte('date', addDays(today(), -30)).order('created_at', { ascending: false }).limit(300)
      .then(({ data }) => {
        const seen = new Set(), out = []
        for (const x of data || []) { const k = x.name.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(x) } }
        setRecent(out.slice(0, 12))
      })
  }, [])
  useEffect(() => {
    setItems(null)
    sb.from('food_logs').select('*').eq('date', date).order('created_at', { ascending: true })
      .then(({ data, error }) => { if (error) toast('Couldn’t load your food log. Has the fitness migration been run?', 'error'); setItems(data || []) })
  }, [date])

  const totals = useMemo(() => (items || []).reduce((a, x) => ({ kcal: a.kcal + (x.kcal || 0), protein: a.protein + Number(x.protein || 0) }), { kcal: 0, protein: 0 }), [items])
  const q = form.name.trim().toLowerCase()
  const suggestions = useMemo(() => {
    const pool = [...recent.map(r => ({ ...r, recent: true })), ...FOOD_PRESETS.filter(p => !recent.some(r => r.name.toLowerCase() === p.name.toLowerCase()))]
    return (q ? pool.filter(p => p.name.toLowerCase().includes(q)) : pool).slice(0, 10)
  }, [q, recent])

  function applyPreset(p) { setForm(s => ({ ...s, name: p.name, qty: p.qty || '', kcal: String(p.kcal), protein: String(Number(p.protein)) })) }

  async function add(e) {
    e.preventDefault()
    const name = form.name.trim()
    if (!name) return toast('Add what you ate first.', 'error')
    const n = Math.max(0.25, Number(form.servings) || 1)
    const row = {
      id: uid(), date, meal: form.meal, name: name.slice(0, 120),
      qty: (n !== 1 ? `${n} × ${form.qty || 'serving'}` : form.qty).slice(0, 60),
      kcal: Math.round((Number(form.kcal) || 0) * n), protein: Math.round((Number(form.protein) || 0) * n * 10) / 10,
    }
    setItems(list => [...(list || []), row])
    setForm(s => ({ ...s, name: '', qty: '', servings: '1', kcal: '', protein: '' }))
    try { await dbRun('Log food', () => sb.from('food_logs').insert(row)) }
    catch { setItems(list => list.filter(x => x.id !== row.id)); toast('Couldn’t save that. Try again.', 'error') }
  }
  async function remove(x) {
    setItems(list => list.filter(i => i.id !== x.id))
    try { await dbRun('Delete food', () => sb.from('food_logs').delete().eq('id', x.id)) }
    catch { setItems(list => [...list, x]); toast('Couldn’t delete that.', 'error') }
  }
  async function saveTargets(t) {
    setTargets(t); setEditTargets(false)
    try { await dbRun('Save targets', () => sb.from('fitness_settings').upsert({ ...t, updated_at: nowIso() }, { onConflict: 'user_id' })); toast('Targets saved') }
    catch { toast('Couldn’t save targets.', 'error') }
  }

  const kcalLeft = targets.kcal_target - totals.kcal
  const proteinLeft = Math.max(0, targets.protein_target - totals.protein)

  return (
    <div className="flex flex-col gap-5">
      <section className="panel p-5">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setDate(addDays(date, -1))} className="btn btn-quiet btn-sm btn-icon" aria-label="Previous day"><ChevronLeft size={16} /></button>
          <p className="font-medium text-[15px] min-w-[150px] text-center">{relDay(date)}{date !== today() && ` · ${fmtDay(date)}`}</p>
          <button onClick={() => setDate(addDays(date, 1))} disabled={date >= today()} className="btn btn-quiet btn-sm btn-icon" aria-label="Next day"><ChevronRight size={16} /></button>
          <button onClick={() => setEditTargets(true)} className="btn btn-quiet btn-sm ml-auto"><Pencil size={14} /> Targets</button>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <Ring pct={(totals.kcal / targets.kcal_target) * 100} size={76} stroke={7} color={kcalLeft < 0 ? 'var(--c-danger)' : HUE} label="Calories">
              <Flame size={18} style={{ color: HUE }} />
            </Ring>
            <div>
              <p className="text-[22px] font-semibold tnum leading-none">{fmtNum(totals.kcal)} <span className="text-[14px] text-muted font-normal">/ {fmtNum(targets.kcal_target)} kcal</span></p>
              <p className="text-[13px] mt-1" style={{ color: kcalLeft < 0 ? 'var(--c-danger)' : 'var(--c-muted)' }}>{kcalLeft >= 0 ? `${fmtNum(kcalLeft)} left` : `${fmtNum(-kcalLeft)} over`}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Ring pct={(totals.protein / targets.protein_target) * 100} size={76} stroke={7} color="var(--c-good)" label="Protein">
              <span className="text-[13px] font-semibold">P</span>
            </Ring>
            <div>
              <p className="text-[22px] font-semibold tnum leading-none">{Math.round(totals.protein)} <span className="text-[14px] text-muted font-normal">/ {targets.protein_target} g protein</span></p>
              <p className="text-[13px] text-muted mt-1">{proteinLeft ? `${Math.round(proteinLeft)} g to go` : 'Protein target hit'}</p>
            </div>
          </div>
        </div>
      </section>

      <form onSubmit={add} className="panel p-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="h-section mr-auto">Add food</h3>
          <Seg label="Meal" value={form.meal} onChange={v => f('meal', v)} options={MEALS.map(m => ({ value: m.id, label: m.label }))} />
        </div>
        <input value={form.name} onChange={e => f('name', e.target.value)} placeholder="What did you eat? e.g. chapati, dal, eggs" className="input text-[15px]" aria-label="Food" />
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map(p => (
              <button type="button" key={(p.recent ? 'r-' : 'p-') + p.name} onClick={() => applyPreset(p)} className="chip hover:text-ink">
                {p.name} <span className="text-faint">· {p.kcal}</span>
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <label><span className="block text-[12px] text-muted mb-1">Portion</span><input value={form.qty} onChange={e => f('qty', e.target.value)} placeholder="1 katori" className="input" /></label>
          <label><span className="block text-[12px] text-muted mb-1">How many</span><input type="number" inputMode="decimal" step="0.25" min="0.25" value={form.servings} onChange={e => f('servings', e.target.value)} className="input tnum" /></label>
          <label><span className="block text-[12px] text-muted mb-1">kcal each</span><input type="number" inputMode="numeric" min="0" value={form.kcal} onChange={e => f('kcal', e.target.value)} className="input tnum" /></label>
          <label><span className="block text-[12px] text-muted mb-1">Protein g each</span><input type="number" inputMode="decimal" step="0.5" min="0" value={form.protein} onChange={e => f('protein', e.target.value)} className="input tnum" /></label>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-[12px] text-faint mr-auto">Preset values are approximate. Change them to match your portion or the label.</p>
          <button className="btn btn-primary"><Plus size={16} /> Add</button>
        </div>
      </form>

      {!items ? <PageLoader /> : items.length === 0 ? (
        <Empty compact icon={Flame} title="Nothing logged yet" body="Log meals as you eat them. It takes 10 seconds and keeps the day honest." />
      ) : MEALS.map(m => {
        const list = items.filter(x => x.meal === m.id)
        if (!list.length) return null
        const sum = list.reduce((a, x) => a + x.kcal, 0)
        return (
          <section key={m.id} className="panel p-1.5">
            <div className="flex items-baseline gap-2 px-3 pt-2.5 pb-1">
              <h3 className="text-[14px] font-semibold">{m.label}</h3>
              <span className="text-[12.5px] text-faint tnum">{fmtNum(sum)} kcal</span>
            </div>
            {list.map(x => (
              <div key={x.id} className="row">
                <div className="flex-1 min-w-0">
                  <p className="text-[14.5px] truncate">{x.name}</p>
                  {x.qty && <p className="text-[12px] text-faint truncate">{x.qty}</p>}
                </div>
                <span className="text-[13px] tnum text-muted w-[70px] text-right">{x.kcal} kcal</span>
                <span className="text-[13px] tnum text-muted w-[48px] text-right">{Number(x.protein)} g</span>
                <button onClick={() => remove(x)} className="btn btn-quiet btn-sm btn-icon" aria-label={`Delete ${x.name}`}><Trash2 size={14} /></button>
              </div>
            ))}
          </section>
        )
      })}

      <TargetsDialog open={editTargets} targets={targets} onClose={() => setEditTargets(false)} onSave={saveTargets} />
    </div>
  )
}

function TargetsDialog({ open, targets, onClose, onSave }) {
  const [k, setK] = useState(''); const [p, setP] = useState('')
  useEffect(() => { if (open) { setK(String(targets.kcal_target)); setP(String(targets.protein_target)) } }, [open])
  return (
    <Dialog open={open} onClose={onClose} title="Daily targets" width={420}>
      <form onSubmit={e => { e.preventDefault(); onSave({ kcal_target: Math.min(6000, Math.max(800, Number(k) || 2000)), protein_target: Math.min(400, Math.max(20, Number(p) || 140)) }) }} className="flex flex-col gap-3">
        <label><span className="label">Calories (kcal)</span><input type="number" value={k} onChange={e => setK(e.target.value)} className="input tnum" /></label>
        <label><span className="label">Protein (g)</span><input type="number" value={p} onChange={e => setP(e.target.value)} className="input tnum" /></label>
        <p className="text-[12.5px] text-muted">For fat loss: about 500 kcal under maintenance, and 1.8–2 g of protein per kg of body weight.</p>
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="btn btn-quiet">Cancel</button><button className="btn btn-primary">Save</button></div>
      </form>
    </Dialog>
  )
}

// ════════════════════════════════════════════════════════════════
//  Progress
// ════════════════════════════════════════════════════════════════
function Progress() {
  const toast = useToast()
  const d = today()
  const [sessions, setSessions] = useState(null)
  const [weights, setWeights] = useState([])
  const [food, setFood] = useState([])
  const [kg, setKg] = useState('')

  useEffect(() => {
    Promise.all([
      sb.from('workout_sessions').select('*').gte('date', addDays(d, -60)).order('date', { ascending: false }),
      sb.from('body_weights').select('*').gte('date', addDays(d, -180)).order('date', { ascending: true }),
      sb.from('food_logs').select('date,kcal,protein').gte('date', addDays(d, -6)),
    ]).then(([s, w, f]) => {
      if (s.error) toast('Couldn’t load progress. Has the fitness migration been run?', 'error')
      setSessions(s.data || []); setWeights(w.data || []); setFood(f.data || [])
      const t = (w.data || []).find(x => x.date === d); if (t) setKg(String(Number(t.kg)))
    })
  }, [])

  async function saveWeight(e) {
    e.preventDefault()
    const v = Number(kg)
    if (!(v >= 20 && v <= 400)) return toast('Enter your weight in kg.', 'error')
    const existing = weights.find(x => x.date === d)
    const row = { id: existing?.id || uid(), date: d, kg: v }
    try {
      await dbRun('Save weight', () => sb.from('body_weights').upsert(row, { onConflict: 'user_id,date' }))
      setWeights(ws => [...ws.filter(x => x.date !== d), row].sort((a, b) => a.date.localeCompare(b.date)))
      syncWeightGoal(v)
      toast('Weight saved')
    } catch { toast('Couldn’t save your weight.', 'error') }
  }

  if (!sessions) return <PageLoader />
  const weekStart = mondayOf(d)
  const week = sessions.filter(s => s.date >= weekStart && s.finished_at)
  const lifts = week.filter(s => s.day_type !== 'rest')
  const cardioMin = week.reduce((a, s) => a + (Number(s.cardio_min) || 0), 0)
  const cardioKm = week.reduce((a, s) => a + (Number(s.cardio_km) || 0), 0)
  const volume = week.reduce((a, s) => a + (s.stats?.volume || 0), 0)
  const first = weights[0], latest = weights[weights.length - 1]
  const days = [...new Set(food.map(x => x.date))]
  const avgKcal = days.length ? Math.round(food.reduce((a, x) => a + x.kcal, 0) / days.length) : 0
  const avgProtein = days.length ? Math.round(food.reduce((a, x) => a + Number(x.protein), 0) / days.length) : 0

  return (
    <div className="flex flex-col gap-5">
      <section className="panel p-5">
        <h3 className="h-section mb-3">This week</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
          <Stat label="Workouts" value={lifts.length} />
          <Stat label="Cardio" value={`${Math.round(cardioMin)} min`} />
          <Stat label="Distance" value={`${cardioKm.toFixed(1)} km`} />
          <Stat label="Volume lifted" value={`${fmtNum(volume)} kg`} />
        </div>
        <p className="text-[12.5px] text-muted mt-3">Food, last 7 days: {days.length ? `${fmtNum(avgKcal)} kcal and ${avgProtein} g protein a day on average (${plural(days.length, 'day')} logged)` : 'nothing logged yet'}.</p>
      </section>

      <section className="panel p-5">
        <div className="flex items-baseline gap-3 mb-3">
          <h3 className="h-section flex items-center gap-2"><Scale size={16} style={{ color: HUE }} /> Body weight</h3>
          {first && latest && first.date !== latest.date && (
            <span className="text-[12.5px] tnum" style={{ color: Number(latest.kg) <= Number(first.kg) ? 'var(--c-good)' : 'var(--c-warn)' }}>
              {(Number(latest.kg) - Number(first.kg) > 0 ? '+' : '') + (Number(latest.kg) - Number(first.kg)).toFixed(1)} kg since {fmtDay(first.date)}
            </span>
          )}
        </div>
        <form onSubmit={saveWeight} className="flex gap-2">
          <input type="number" inputMode="decimal" step="0.1" value={kg} onChange={e => setKg(e.target.value)} placeholder="Today’s weight, kg" className="input tnum flex-1" aria-label="Today’s weight in kg" />
          <button className="btn btn-primary">Save</button>
        </form>
        <p className="text-[12px] text-faint mt-2">Weigh in the morning, after the toilet, before food. Daily weights jump around; watch the weekly trend.</p>
        {weights.length > 1 && <WeightChart weights={weights} />}
      </section>

      <section className="panel p-1.5">
        <h3 className="h-section px-3.5 pt-3 pb-1">Recent sessions</h3>
        {sessions.filter(s => s.finished_at).length === 0 && <Empty compact icon={Dumbbell} title="No workouts yet" body="Finish your first session and it shows up here." />}
        {sessions.filter(s => s.finished_at).slice(0, 20).map(s => (
          <div key={s.id} className="row">
            <span className="w-[90px] text-[12.5px] text-muted">{fmtDay(s.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            <span className="flex-1 text-[14.5px] font-medium">{DAYS[s.day_type]?.label || s.day_type}</span>
            {s.stats?.prs?.length > 0 && <Trophy size={14} style={{ color: HUE }} aria-label="Personal best" />}
            <span className="text-[12.5px] text-muted tnum hidden sm:inline">{s.stats?.done ?? 0}/{s.stats?.planned ?? 0} sets</span>
            <span className="text-[12.5px] text-muted tnum w-[70px] text-right">{s.cardio_min ? `${Number(s.cardio_min)} min` : '–'}</span>
          </div>
        ))}
      </section>
    </div>
  )
}

function WeightChart({ weights }) {
  const w = 600, h = 120, pad = 8
  const vals = weights.map(x => Number(x.kg))
  const min = Math.min(...vals) - 0.5, max = Math.max(...vals) + 0.5
  const pts = weights.map((x, i) => [pad + (i / Math.max(1, weights.length - 1)) * (w - pad * 2), pad + (1 - (Number(x.kg) - min) / (max - min)) * (h - pad * 2)])
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[120px] mt-3" role="img" aria-label={`Body weight from ${vals[0]} to ${vals[vals.length - 1]} kg`}>
      <polyline points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke={HUE} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={HUE}><title>{`${fmtDay(weights[i].date)}: ${vals[i]} kg`}</title></circle>)}
    </svg>
  )
}

// Keeps a goal like "Lose 7 kg (72 → 65 kg)" in step with the latest weigh-in
async function syncWeightGoal(latestKg) {
  try {
    const { data } = await sb.from('goals').select('id,title,target,current,status')
    const g = (data || []).find(x => x.status !== 'done' && /lose/i.test(x.title) && /(\d+(?:\.\d+)?)\s*(?:→|->|to)\s*(\d+(?:\.\d+)?)\s*kg/i.test(x.title))
    if (!g) return
    const [, from] = g.title.match(/(\d+(?:\.\d+)?)\s*(?:→|->|to)\s*(\d+(?:\.\d+)?)\s*kg/i).map(Number)
    const lost = Math.max(0, Math.min(g.target, Math.round(from - latestKg)))
    if (lost !== g.current) await sb.from('goals').update({ current: lost, updated_at: nowIso() }).eq('id', g.id)
  } catch {}
}
