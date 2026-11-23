import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Dumbbell, ChevronLeft, ChevronRight, Plus, Trash2, Timer, Footprints, ArrowUp, ArrowDown, Flame, Scale, Trophy, X, Pencil, Ruler, CalendarDays, Activity, Bell } from 'lucide-react'
import { Dialog, Empty, PageLoader, Seg, Check2, Ring, useToast, useConfirm } from '../components/ui'
import { sb, dbRun } from '../lib/supabase'
import { setLog } from '../lib/habits'
import { syncHabitTask } from '../lib/habitTasks'
import { uid, today, addDays, fmtDay, relDay, fmtNum, plural, nowIso, parseYmd } from '../lib/utils'
import DEMOS from '../lib/exercise-demos.json'
import {
  EXERCISES, DAYS, CYCLE, warmupFor, cooldownFor, nextDay, suggest, setLabel, sessionStats, supportiveMessage,
  MEALS, FOOD_PRESETS, DEFAULT_TARGETS,
  CUSTOM, isCustom, sessionLabel, parseActivity,
  BODY_GROUPS, BODY_METRICS, METRIC, MEASURE_EVERY, changeTone, fmtMetric,
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
          options={[{ value: 'workout', label: 'Workout' }, { value: 'food', label: 'Food' }, { value: 'history', label: 'History' }, { value: 'body', label: 'Body' }, { value: 'progress', label: 'Week' }]} />
      </header>
      {tab === 'workout' && <Workout />}
      {tab === 'food' && <Food />}
      {tab === 'history' && <History />}
      {tab === 'body' && <Body />}
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

  const todays = sessions?.find(s => s.date === d && !isCustom(s)) || null
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
    const weekCount = (sessions || []).filter(x => x.date >= weekStart && x.finished_at && x.id !== s.id && x.day_type !== 'rest' && !isCustom(x)).length + (dayType === 'rest' ? 0 : 1)
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
    const { data } = await sb.from('habits').select('*')
    const row = (data || []).find(x => !x.archived && (x.metric === 'workout' || /gym/i.test(x.name)))
    if (!row) return
    const group = DAYS[dayType].group
    if (group === 'rest') return syncHabitTask(row.id, date)
    const map = { push: 'Push', pull: 'Pull', legs: 'Legs' }
    const variant = row.track_type === 'variants' && (row.variants || []).includes(map[group]) ? map[group] : null
    await setLog(row.id, date, { variant, duration_min: null })
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
            <span className="flex-1 text-[14.5px] font-medium">{sessionLabel(s)}</span>
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

// ════════════════════════════════════════════════════════════════
//  Shared helpers for History and Body
// ════════════════════════════════════════════════════════════════
function useWidth(ref, fallback = 600) {
  const [w, setW] = useState(fallback)
  useEffect(() => {
    if (!ref.current) return
    setW(Math.round(ref.current.clientWidth) || fallback)
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return w
}

const TONE_COLOR = { good: 'var(--c-good)', bad: 'var(--c-danger)', flat: 'var(--c-muted)' }
const signed = (n, digits = 1) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('en-GB', { maximumFractionDigits: digits })}`

async function findGymHabit() {
  const { data } = await sb.from('habits').select('*')
  return (data || []).find(x => !x.archived && (x.metric === 'workout' || /gym/i.test(x.name))) || null
}

// One bar per day. Click a bar to open that day.
function DayBars({ days, field, target, unit, label, colorFor, onPick }) {
  const ref = useRef(null)
  const W = useWidth(ref)
  const [hover, setHover] = useState(null)
  const H = 150, padL = 40, padR = 6, padT = 12, padB = 22
  const max = Math.max(target || 0, ...days.map(x => x[field] || 0), 1) * 1.12
  const n = days.length
  const bw = (W - padL - padR) / Math.max(1, n)
  const y = v => padT + (1 - v / max) * (H - padT - padB)
  const every = n <= 14 ? 1 : n <= 31 ? 5 : 14
  const h = hover != null ? days[hover] : null
  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
      <svg width={W} height={H} role="img" aria-label={label} className="block">
        <text x={padL - 6} y={y(0)} textAnchor="end" dominantBaseline="middle" className="fill-[var(--c-faint)] text-[10.5px] tnum">0</text>
        {target ? <>
          <line x1={padL} x2={W - padR} y1={y(target)} y2={y(target)} stroke="var(--c-muted)" strokeDasharray="4 4" strokeWidth="1" />
          <text x={padL - 6} y={y(target)} textAnchor="end" dominantBaseline="middle" className="fill-[var(--c-muted)] text-[10.5px] tnum">{fmtNum(target)}</text>
        </> : null}
        <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="var(--c-line)" strokeWidth="1" />
        {days.map((d, i) => {
          const v = d[field] || 0
          const x = padL + i * bw
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onClick={() => onPick(d.date)} className="cursor-pointer">
              <rect x={x} y={padT} width={bw} height={H - padT - padB} fill="transparent" />
              {v > 0 && <rect x={x + bw * 0.16} y={y(v)} width={Math.max(2, bw * 0.68)} height={Math.max(1, y(0) - y(v))} rx={Math.min(4, bw * 0.2)}
                fill={colorFor(v)} opacity={hover == null || hover === i ? 1 : 0.55} />}
              {(i % every === 0 || i === n - 1) && (
                <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="fill-[var(--c-faint)] text-[10.5px] tnum">
                  {n <= 7 ? fmtDay(d.date, { weekday: 'narrow' }) : fmtDay(d.date, { day: 'numeric' })}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {h && (
        <div className="absolute top-0 pointer-events-none rounded-[8px] px-2.5 py-1.5 text-[12px] shadow-pop bg-surface whitespace-nowrap"
          style={{ left: Math.min(Math.max(0, padL + hover * bw + bw / 2 - 70), W - 140) }}>
          <b>{fmtDay(h.date, { weekday: 'short', day: 'numeric', month: 'short' })}</b> · <span className="tnum">{fmtNum(Math.round(h[field] || 0))} {unit}</span>
          {target ? <span className="text-muted"> / {fmtNum(target)}</span> : null}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  History: what you did and ate, day by day
// ════════════════════════════════════════════════════════════════
function History() {
  const toast = useToast()
  const d = today()
  const [range, setRange] = useState('14')
  const [data, setData] = useState(null)
  const [openDay, setOpenDay] = useState(null)
  const [editing, setEditing] = useState(null) // custom session or {} for new
  const [reload, setReload] = useState(0)
  const from = addDays(d, -(Number(range) - 1))

  useEffect(() => {
    let live = true
    Promise.all([
      sb.from('workout_sessions').select('*').gte('date', from).lte('date', d).order('date', { ascending: true }),
      sb.from('food_logs').select('*').gte('date', from).lte('date', d).order('created_at', { ascending: true }),
      sb.from('body_weights').select('date,kg').gte('date', from).lte('date', d),
      sb.from('fitness_settings').select('*').maybeSingle(),
    ]).then(async ([s, f, w, t]) => {
      if (s.error || f.error) toast('Couldn’t load your history. Has the fitness migration been run?', 'error')
      const sessions = s.data || []
      let sets = []
      if (sessions.length) {
        const r = await sb.from('workout_sets').select('*').in('session_id', sessions.map(x => x.id))
        sets = r.data || []
      }
      if (!live) return
      setData({
        sessions, sets, food: f.data || [], weights: w.data || [],
        targets: t.data ? { kcal_target: t.data.kcal_target, protein_target: t.data.protein_target } : DEFAULT_TARGETS,
      })
    })
    return () => { live = false }
  }, [range, reload])

  const days = useMemo(() => {
    if (!data) return []
    const out = []
    for (let x = from; x <= d; x = addDays(x, 1)) {
      const food = data.food.filter(f => f.date === x)
      out.push({
        date: x,
        sessions: data.sessions.filter(s => s.date === x && (s.finished_at || isCustom(s) || data.sets.some(z => z.session_id === s.id))),
        food,
        kcal: food.reduce((a, f) => a + (f.kcal || 0), 0),
        protein: food.reduce((a, f) => a + Number(f.protein || 0), 0),
        kg: data.weights.find(w => w.date === x)?.kg,
      })
    }
    return out
  }, [data])

  if (!data) return <PageLoader />
  const { targets } = data
  const logged = days.filter(x => x.food.length)
  const active = days.filter(x => x.sessions.length)
  const avgKcal = logged.length ? Math.round(logged.reduce((a, x) => a + x.kcal, 0) / logged.length) : 0
  const avgProtein = logged.length ? Math.round(logged.reduce((a, x) => a + x.protein, 0) / logged.length) : 0
  const proteinHit = logged.filter(x => x.protein >= targets.protein_target).length
  const day = openDay ? days.find(x => x.date === openDay) : null

  return (
    <div className="flex flex-col gap-5">
      <section className="panel p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h3 className="h-section flex items-center gap-2 mr-auto"><CalendarDays size={16} style={{ color: HUE }} /> Last {range} days</h3>
          <Seg label="Range" value={range} onChange={setRange} options={[{ value: '7', label: '7d' }, { value: '14', label: '14d' }, { value: '30', label: '30d' }, { value: '90', label: '90d' }]} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
          <Stat label="Active days" value={`${active.length}/${days.length}`} />
          <Stat label="Avg kcal (logged days)" value={logged.length ? fmtNum(avgKcal) : '–'} />
          <Stat label="Avg protein" value={logged.length ? `${avgProtein} g` : '–'} />
          <Stat label="Protein target hit" value={logged.length ? `${proteinHit}/${logged.length} days` : '–'} />
        </div>
        <ActivityStrip days={days} onPick={setOpenDay} />
      </section>

      <section className="panel p-5">
        <div className="flex items-baseline gap-2 mb-2">
          <h3 className="h-section flex items-center gap-2"><Flame size={16} style={{ color: HUE }} /> Calories</h3>
          <span className="text-[12.5px] text-faint">dashed line = {fmtNum(targets.kcal_target)} kcal target · tap a bar for that day</span>
        </div>
        <DayBars days={days} field="kcal" target={targets.kcal_target} unit="kcal" label="Calories eaten per day"
          colorFor={v => v > targets.kcal_target ? 'var(--c-danger)' : HUE} onPick={setOpenDay} />
        <div className="flex items-baseline gap-2 mt-5 mb-2">
          <h3 className="h-section">Protein</h3>
          <span className="text-[12.5px] text-faint">target {targets.protein_target} g · green = target hit</span>
        </div>
        <DayBars days={days} field="protein" target={targets.protein_target} unit="g" label="Protein eaten per day"
          colorFor={v => v >= targets.protein_target ? 'var(--c-good)' : 'var(--c-accent-mid)'} onPick={setOpenDay} />
      </section>

      <section className="panel p-1.5">
        <div className="flex items-center gap-2 px-3.5 pt-3 pb-1">
          <h3 className="h-section mr-auto">Day by day</h3>
          <button onClick={() => setEditing({})} className="btn btn-quiet btn-sm"><Plus size={14} /> Log other workout</button>
        </div>
        {[...days].reverse().map(x => (
          <button key={x.date} onClick={() => setOpenDay(x.date)} className="row row-hover w-full text-left items-start">
            <span className="w-[86px] flex-shrink-0 pt-0.5">
              <span className="block text-[13.5px] font-medium">{relDay(x.date) === 'Today' || relDay(x.date) === 'Yesterday' ? relDay(x.date) : fmtDay(x.date, { weekday: 'short', day: 'numeric' })}</span>
              <span className="block text-[11.5px] text-faint">{fmtDay(x.date, { month: 'short', year: '2-digit' })}</span>
            </span>
            <span className="flex-1 min-w-0 flex flex-wrap gap-1.5 pt-0.5">
              {x.sessions.length === 0 && <span className="text-[13px] text-faint">No workout</span>}
              {x.sessions.map(s => (
                <span key={s.id} className="chip inline-flex items-center gap-1" style={{ color: HUE }}>
                  {isCustom(s) ? <Activity size={12} /> : s.day_type === 'rest' ? <Footprints size={12} /> : <Dumbbell size={12} />}
                  <span className="text-ink truncate max-w-[180px]">{sessionLabel(s)}</span>
                </span>
              ))}
            </span>
            <span className="w-[112px] flex-shrink-0 text-right">
              {x.food.length ? <>
                <span className="block text-[13px] tnum" style={{ color: x.kcal > targets.kcal_target ? 'var(--c-danger)' : undefined }}>{fmtNum(x.kcal)} kcal</span>
                <span className="block text-[12px] tnum" style={{ color: x.protein >= targets.protein_target ? 'var(--c-good)' : 'var(--c-muted)' }}>{Math.round(x.protein)} g protein</span>
              </> : <span className="text-[12.5px] text-faint">No food logged</span>}
            </span>
          </button>
        ))}
      </section>

      <DayDialog day={day} sets={data.sets} targets={targets} onClose={() => setOpenDay(null)}
        onEdit={s => { setOpenDay(null); setEditing(s) }} onChanged={() => setReload(r => r + 1)} />
      <CustomWorkoutDialog session={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setReload(r => r + 1) }} />
    </div>
  )
}

// One square per day: filled when you trained
function ActivityStrip({ days, onPick }) {
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-[3px]" role="list" aria-label="Days with a workout">
        {days.map(x => {
          const on = x.sessions.length > 0
          return (
            <button key={x.date} role="listitem" onClick={() => onPick(x.date)} title={`${fmtDay(x.date, { weekday: 'short', day: 'numeric', month: 'short' })}: ${on ? x.sessions.map(sessionLabel).join(', ') : 'no workout'}`}
              aria-label={`${fmtDay(x.date, { day: 'numeric', month: 'short' })}, ${on ? 'trained' : 'no workout'}`}
              className="w-[18px] h-[18px] rounded-[4px]" style={{ background: on ? HUE : 'var(--c-sunken)', boxShadow: x.date === today() ? 'inset 0 0 0 1.5px var(--c-ink)' : undefined }} />
          )
        })}
      </div>
      <p className="text-[11.5px] text-faint mt-1.5">Each square is a day. Filled = you trained.</p>
    </div>
  )
}

function DayDialog({ day, sets, targets, onClose, onEdit, onChanged }) {
  const confirm = useConfirm()
  const toast = useToast()
  async function removeSession(s) {
    if (!(await confirm({ title: 'Delete this workout?', body: `“${sessionLabel(s)}” on ${fmtDay(s.date)} will be removed. This can’t be undone.`, confirmLabel: 'Delete workout' }))) return
    try { await dbRun('Delete workout', () => sb.from('workout_sessions').delete().eq('id', s.id)); onClose(); onChanged() }
    catch { toast('Couldn’t delete that workout.', 'error') }
  }
  return (
    <Dialog open={!!day} onClose={onClose} title={day ? fmtDay(day.date, { weekday: 'long', day: 'numeric', month: 'long' }) : ''} width={560}>
      {day && (
        <div className="flex flex-col gap-5">
          <section>
            <h3 className="h-section flex items-center gap-2 mb-2"><Dumbbell size={15} style={{ color: HUE }} /> Exercise</h3>
            {day.sessions.length === 0 && <p className="text-[13.5px] text-muted">No workout logged.</p>}
            {day.sessions.map(s => <SessionDetail key={s.id} s={s} sets={sets.filter(x => x.session_id === s.id && x.done)} onEdit={() => onEdit(s)} onDelete={() => removeSession(s)} />)}
          </section>

          <section>
            <div className="flex items-baseline gap-2 mb-2">
              <h3 className="h-section flex items-center gap-2"><Flame size={15} style={{ color: HUE }} /> Food</h3>
              {day.food.length > 0 && <span className="text-[12.5px] text-muted tnum ml-auto">
                <span style={{ color: day.kcal > targets.kcal_target ? 'var(--c-danger)' : undefined }}>{fmtNum(day.kcal)}</span> / {fmtNum(targets.kcal_target)} kcal ·{' '}
                <span style={{ color: day.protein >= targets.protein_target ? 'var(--c-good)' : undefined }}>{Math.round(day.protein)}</span> / {targets.protein_target} g protein
              </span>}
            </div>
            {day.food.length === 0 && <p className="text-[13.5px] text-muted">Nothing logged.</p>}
            {day.food.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                <MiniBar label="Calories" value={day.kcal} target={targets.kcal_target} color={day.kcal > targets.kcal_target ? 'var(--c-danger)' : HUE} unit="kcal" />
                <MiniBar label="Protein" value={day.protein} target={targets.protein_target} color="var(--c-good)" unit="g" />
              </div>
            )}
            {MEALS.map(m => {
              const list = day.food.filter(f => f.meal === m.id)
              if (!list.length) return null
              return (
                <div key={m.id} className="mb-2">
                  <p className="text-[12.5px] font-semibold text-muted px-1 flex">
                    <span className="mr-auto">{m.label}</span>
                    <span className="tnum font-normal">{fmtNum(list.reduce((a, f) => a + f.kcal, 0))} kcal · {Math.round(list.reduce((a, f) => a + Number(f.protein), 0))} g</span>
                  </p>
                  {list.map(f => (
                    <div key={f.id} className="flex items-baseline gap-2 px-1 py-1 text-[13.5px] border-b border-line-soft last:border-0">
                      <span className="flex-1 min-w-0 truncate">{f.name}{f.qty && <span className="text-faint"> · {f.qty}</span>}</span>
                      <span className="tnum text-muted w-[64px] text-right">{f.kcal} kcal</span>
                      <span className="tnum text-muted w-[44px] text-right">{Number(f.protein)} g</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </section>

          {day.kg && <p className="text-[13.5px] text-muted flex items-center gap-2"><Scale size={14} style={{ color: HUE }} /> Weighed in at <b className="text-ink tnum">{Number(day.kg)} kg</b></p>}
        </div>
      )}
    </Dialog>
  )
}

function MiniBar({ label, value, target, color, unit }) {
  const pct = Math.min(100, (value / Math.max(1, target)) * 100)
  return (
    <div className="rounded-[10px] bg-sunken p-2.5">
      <p className="text-[11.5px] text-muted">{label}</p>
      <p className="text-[15px] font-semibold tnum">{fmtNum(Math.round(value))} <span className="text-[12px] text-muted font-normal">/ {fmtNum(target)} {unit}</span></p>
      <div className="h-[5px] rounded-full bg-line mt-1.5 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  )
}

function SessionDetail({ s, sets, onEdit, onDelete }) {
  const custom = isCustom(s)
  const day = DAYS[s.day_type]
  const order = day ? [...day.lifts, ...day.abs, ...(day.posture || [])] : []
  const ids = [...new Set([...order.filter(id => sets.some(x => x.exercise_id === id)), ...sets.map(x => x.exercise_id)])]
  const groups = custom ? (s.activities || []).reduce((m, a) => { (m[a.group || ''] ||= []).push(a); return m }, {}) : null
  return (
    <div className="rounded-[12px] bg-sunken p-3.5 mb-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold">{sessionLabel(s)}</p>
          {!custom && day && <p className="text-[12.5px] text-muted">{day.focus}{s.stats?.done != null ? ` · ${s.stats.done}/${s.stats.planned} sets` : ''}{s.stats?.volume ? ` · ${fmtNum(s.stats.volume)} kg lifted` : ''}</p>}
        </div>
        {custom && <>
          <button onClick={onEdit} className="btn btn-quiet btn-sm btn-icon" aria-label="Edit workout"><Pencil size={14} /></button>
          <button onClick={onDelete} className="btn btn-quiet btn-sm btn-icon" aria-label="Delete workout"><Trash2 size={14} /></button>
        </>}
      </div>
      {!custom && (s.warmup_done || s.cooldown_done) && <p className="text-[12.5px] text-muted mt-1">{[s.warmup_done && 'Warm-up done', s.cooldown_done && 'Cool-down done'].filter(Boolean).join(' · ')}</p>}
      {!custom && ids.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {ids.map(id => {
            const ex = EXERCISES[id]
            const mine = sets.filter(x => x.exercise_id === id).sort((a, b) => a.set_no - b.set_no)
            return (
              <li key={id} className="flex items-baseline gap-2 text-[13.5px]">
                <span className="flex-1 min-w-0 truncate">{ex?.name || id}</span>
                <span className="tnum text-muted">{mine.map(x => ex ? setLabel(ex, { weight: Number(x.weight), reps: x.reps }) : x.reps).join(', ')}</span>
              </li>
            )
          })}
        </ul>
      )}
      {!custom && ids.length === 0 && s.day_type !== 'rest' && <p className="text-[13px] text-faint mt-1">No sets recorded.</p>}
      {custom && Object.entries(groups).map(([g, list]) => (
        <div key={g} className="mt-2">
          {g && <p className="text-[11.5px] uppercase tracking-wide text-faint font-semibold">{g}</p>}
          <ul className="flex flex-col gap-0.5">
            {list.map((a, i) => (
              <li key={i} className="flex items-baseline gap-2 text-[13.5px]">
                <span className="flex-1 min-w-0">{a.name}</span>
                {a.detail && <span className="tnum text-muted text-right">{a.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {s.cardio_min ? <p className="text-[13px] mt-2 flex items-center gap-1.5"><Footprints size={13} style={{ color: HUE }} /> {Number(s.cardio_min)} min {s.cardio_kind || 'cardio'}{s.cardio_km ? `, ${Number(s.cardio_km)} km` : ''}</p> : null}
      {s.notes && <p className="text-[12.5px] text-muted mt-2 whitespace-pre-line">{s.notes}</p>}
    </div>
  )
}

// Log a workout that isn't part of the Push/Pull/Legs program (mobility, bodyweight, a class…)
function CustomWorkoutDialog({ session, onClose, onSaved }) {
  const toast = useToast()
  const open = !!session
  const [f, setF] = useState({})
  const [habit, setHabit] = useState(null)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  useEffect(() => {
    if (!open) return
    const s = session || {}
    setF({
      date: s.date || today(), title: s.title || '',
      lines: (s.activities || []).map(a => a.detail ? `${a.name} — ${a.detail}` : a.name).join('\n'),
      cardio_min: s.cardio_min != null ? String(Number(s.cardio_min)) : '', cardio_kind: s.cardio_kind || 'walk',
      notes: s.notes || '', tick: !s.id, variant: '',
    })
    findGymHabit().then(setHabit).catch(() => {})
  }, [open])

  async function save(e) {
    e.preventDefault()
    const activities = String(f.lines || '').split('\n').map(parseActivity).filter(Boolean).slice(0, 60)
    const title = (f.title || '').trim() || 'Other workout'
    if (!activities.length && !Number(f.cardio_min)) return toast('Add at least one exercise or some cardio minutes.', 'error')
    const row = {
      id: session.id || uid(), date: f.date, day_type: CUSTOM, title: title.slice(0, 120), activities,
      started_at: session.started_at || nowIso(), finished_at: session.finished_at || nowIso(),
      cardio_kind: f.cardio_min ? f.cardio_kind : null, cardio_min: f.cardio_min === '' ? null : Number(f.cardio_min),
      notes: (f.notes || '').slice(0, 2000), stats: session.stats || {},
    }
    try {
      await dbRun('Save workout', () => sb.from('workout_sessions').upsert(row))
      if (f.tick && habit) {
        const variant = habit.track_type === 'variants' ? (f.variant || null) : null
        await setLog(habit.id, row.date, { variant, duration_min: null }).catch(() => {})
      }
      toast('Workout saved')
      onSaved()
    } catch { toast('Couldn’t save that workout. Has the latest migration been run?', 'error') }
  }

  return (
    <Dialog open={open} onClose={onClose} title={session?.id ? 'Edit workout' : 'Log other workout'} width={520}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="grid grid-cols-[1fr_150px] gap-2">
          <label><span className="label">Title</span><input value={f.title || ''} onChange={e => set('title', e.target.value)} placeholder="Mobility + bodyweight legs & core" className="input" /></label>
          <label><span className="label">Date</span><input type="date" value={f.date || ''} max={today()} onChange={e => set('date', e.target.value)} className="input" /></label>
        </div>
        <label>
          <span className="label">Exercises, one per line</span>
          <textarea value={f.lines || ''} onChange={e => set('lines', e.target.value)} rows={8} className="input font-mono text-[13px] leading-relaxed"
            placeholder={'Bicycle — 10 min\nSumo squats — 2 × 15\nWalking lunges — 2 × 15\nCat-cow\nCrunches — 2 × 15'} />
          <span className="text-[12px] text-faint">Put sets, reps or time after a dash: “Sumo squats — 2 × 15”.</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label><span className="label">Cardio minutes</span><input type="number" inputMode="decimal" min="0" value={f.cardio_min || ''} onChange={e => set('cardio_min', e.target.value)} className="input tnum" placeholder="optional" /></label>
          <label><span className="label">Cardio type</span>
            <select value={f.cardio_kind || 'walk'} onChange={e => set('cardio_kind', e.target.value)} className="input">
              <option value="walk">Walk</option><option value="run">Run</option><option value="cycle">Cycle</option><option value="other">Other</option>
            </select>
          </label>
        </div>
        <label><span className="label">Notes</span><input value={f.notes || ''} onChange={e => set('notes', e.target.value)} className="input" placeholder="How it felt, anything to remember" /></label>
        {habit && (
          <div className="flex flex-wrap items-center gap-3 text-[13.5px]">
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!f.tick} onChange={e => set('tick', e.target.checked)} /> Tick “{habit.name}”</label>
            {f.tick && habit.track_type === 'variants' && (
              <select value={f.variant || ''} onChange={e => set('variant', e.target.value)} className="input py-1 w-auto text-[13px]" aria-label="Habit variant">
                <option value="">No type</option>
                {(habit.variants || []).map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 mt-1"><button type="button" onClick={onClose} className="btn btn-quiet">Cancel</button><button className="btn btn-primary">Save workout</button></div>
      </form>
    </Dialog>
  )
}

// ════════════════════════════════════════════════════════════════
//  Body: measurements over time
// ════════════════════════════════════════════════════════════════
function Body() {
  const toast = useToast()
  const confirm = useConfirm()
  const [rows, setRows] = useState(null)
  const [weights, setWeights] = useState([])
  const [every, setEvery] = useState('monthly')
  const [metric, setMetric] = useState('weight')
  const [editing, setEditing] = useState(null) // row, or {} for a new one
  const [reload, setReload] = useState(0)

  useEffect(() => {
    Promise.all([
      sb.from('body_measurements').select('*').order('date', { ascending: true }),
      sb.from('body_weights').select('date,kg').order('date', { ascending: true }),
      sb.from('fitness_settings').select('*').maybeSingle(),
    ]).then(([m, w, s]) => {
      if (m.error) toast('Couldn’t load measurements. Run the 20261123_body_measurements migration first.', 'error')
      setRows(m.data || []); setWeights(w.data || [])
      if (s.data?.measure_every) setEvery(s.data.measure_every)
    })
  }, [reload])

  const series = useMemo(() => {
    const out = {}
    for (const m of BODY_METRICS) {
      const pts = (rows || []).filter(r => r.vals?.[m.id] != null && r.vals[m.id] !== '').map(r => ({ date: r.date, v: Number(r.vals[m.id]), src: 'sheet' }))
      if (m.id === 'weight') for (const w of weights) if (!pts.some(p => p.date === w.date)) pts.push({ date: w.date, v: Number(w.kg), src: 'scale' })
      out[m.id] = pts.sort((a, b) => a.date.localeCompare(b.date))
    }
    return out
  }, [rows, weights])

  async function saveEvery(v) {
    setEvery(v)
    try { await dbRun('Save cadence', () => sb.from('fitness_settings').upsert({ measure_every: v, updated_at: nowIso() }, { onConflict: 'user_id' })) }
    catch { toast('Couldn’t save that. Has the latest migration been run?', 'error') }
  }

  async function save(row, vals, date, notes) {
    const clash = (rows || []).find(r => r.date === date && r.id !== row?.id)
    if (clash) { toast(`There’s already an entry for ${fmtDay(date)}. Edit that one instead.`, 'error'); return false }
    const rec = { id: row?.id || uid(), date, vals, notes: (notes || '').slice(0, 1000), updated_at: nowIso() }
    try {
      await dbRun('Save measurements', () => sb.from('body_measurements').upsert(rec))
      if (vals.weight) {
        const existing = weights.find(w => w.date === date)
        await sb.from('body_weights').upsert({ id: existing?.id || uid(), date, kg: vals.weight }, { onConflict: 'user_id,date' })
        const latest = [...weights.map(w => w.date), date].sort().pop()
        if (latest === date) syncWeightGoal(vals.weight)
      }
      toast('Measurements saved')
      setEditing(null); setReload(r => r + 1)
      return true
    } catch { toast('Couldn’t save. Has the latest migration been run?', 'error'); return false }
  }
  async function remove(row) {
    if (!(await confirm({ title: 'Delete these measurements?', body: `All numbers from ${fmtDay(row.date, { day: 'numeric', month: 'long', year: 'numeric' })} will be removed. Your daily weight log stays.`, confirmLabel: 'Delete' }))) return
    try { await dbRun('Delete measurements', () => sb.from('body_measurements').delete().eq('id', row.id)); setEditing(null); setReload(r => r + 1) }
    catch { toast('Couldn’t delete that.', 'error') }
  }

  if (!rows) return <PageLoader />
  const last = rows[rows.length - 1]
  const nextDue = last ? addDays(last.date, MEASURE_EVERY[every]) : null
  const overdue = nextDue && nextDue <= today()
  const available = BODY_METRICS.filter(m => series[m.id].length)
  const cur = METRIC[metric] && series[metric].length ? metric : available[0]?.id

  return (
    <div className="flex flex-col gap-5">
      <section className="panel p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="mr-auto">
            <h3 className="h-section flex items-center gap-2"><Ruler size={16} style={{ color: HUE }} /> Body stats</h3>
            <p className="text-[13px] text-muted mt-1">
              {last ? <>Last measured {relDay(last.date).toLowerCase() === 'today' ? 'today' : fmtDay(last.date, { day: 'numeric', month: 'short', year: 'numeric' })} · {rows.length} {rows.length === 1 ? 'entry' : 'entries'}</> : 'No measurements yet.'}
            </p>
          </div>
          <button onClick={() => setEditing({})} className="btn btn-primary btn-sm"><Plus size={14} /> Add measurements</button>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <span className="text-[12.5px] text-muted">Measure every</span>
          <Seg label="Measuring cadence" value={every} onChange={saveEvery} options={[{ value: 'weekly', label: 'Week' }, { value: 'fortnightly', label: '2 weeks' }, { value: 'monthly', label: 'Month' }]} />
          {nextDue && (
            <span className={`text-[12.5px] inline-flex items-center gap-1.5 ${overdue ? 'text-warn font-medium' : 'text-muted'}`}>
              <Bell size={13} /> {overdue ? `Due now (since ${fmtDay(nextDue)})` : `Next on ${fmtDay(nextDue, { weekday: 'short', day: 'numeric', month: 'short' })}`}
            </span>
          )}
        </div>
      </section>

      {rows.length === 0 && weights.length === 0 ? (
        <section className="panel"><Empty compact icon={Ruler} title="Add your first measurements" body="Copy the numbers from your gym’s body-composition sheet. Measure again every few weeks to see what’s changing." action={<button onClick={() => setEditing({})} className="btn btn-primary"><Plus size={15} /> Add measurements</button>} /></section>
      ) : <>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {BODY_METRICS.filter(m => m.key && series[m.id].length).map(m => <MetricCard key={m.id} m={m} pts={series[m.id]} active={cur === m.id} onClick={() => setMetric(m.id)} />)}
        </div>

        {cur && (
          <section className="panel p-5">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <h3 className="h-section mr-auto">{METRIC[cur].label} over time</h3>
              <select value={cur} onChange={e => setMetric(e.target.value)} className="input py-1.5 w-auto text-[13.5px]" aria-label="Metric to chart">
                {BODY_GROUPS.map(g => (
                  <optgroup key={g.id} label={g.label}>
                    {available.filter(m => m.group === g.id).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <MetricChart m={METRIC[cur]} pts={series[cur]} />
            {cur === 'weight' && weights.length > 0 && <p className="text-[12px] text-faint mt-2">Includes your daily weigh-ins from the Week tab. Filled dots are gym measurements.</p>}
          </section>
        )}

        {rows.length > 0 && <MeasureTable rows={rows} onEdit={setEditing} />}
      </>}

      <MeasureDialog row={editing} last={last} onClose={() => setEditing(null)} onSave={save} onDelete={remove} />
    </div>
  )
}

function MetricCard({ m, pts, active, onClick }) {
  const first = pts[0], latest = pts[pts.length - 1], prev = pts[pts.length - 2]
  const total = latest.v - first.v, step = prev ? latest.v - prev.v : 0
  const tone = changeTone(m, total)
  return (
    <button onClick={onClick} className="panel p-3.5 text-left" style={active ? { boxShadow: `inset 0 0 0 1.5px ${HUE}` } : undefined} aria-pressed={active}>
      <p className="text-[12px] text-muted">{m.short}</p>
      <p className="text-[22px] font-semibold tnum leading-tight">{fmtMetric(latest.v, m)}{m.unit && m.unit !== '%' && <span className="text-[12.5px] text-muted font-normal"> {m.unit}</span>}</p>
      {pts.length > 1 ? (
        <p className="text-[12px] tnum mt-0.5" style={{ color: TONE_COLOR[tone] }}>
          {signed(total)} since {fmtDay(first.date)}{prev && prev !== first ? <span className="text-faint"> · {signed(step)} last time</span> : null}
        </p>
      ) : <p className="text-[12px] text-faint mt-0.5">First reading {fmtDay(first.date)}</p>}
    </button>
  )
}

function MetricChart({ m, pts }) {
  const ref = useRef(null)
  const W = useWidth(ref)
  const [hover, setHover] = useState(null)
  const H = 200, padL = 42, padR = 16, padT = 22, padB = 26
  const vals = pts.map(p => p.v)
  let lo = Math.min(...vals), hi = Math.max(...vals)
  const span = Math.max(hi - lo, Math.abs(hi) * 0.02, 0.5)
  lo -= span * 0.25; hi += span * 0.25
  const t0 = parseYmd(pts[0].date).getTime(), t1 = parseYmd(pts[pts.length - 1].date).getTime()
  const x = p => pts.length === 1 || t1 === t0 ? (padL + W - padR) / 2 : padL + ((parseYmd(p.date).getTime() - t0) / (t1 - t0)) * (W - padL - padR)
  const y = v => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB)
  const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15]
  const labelAll = pts.filter(p => p.src === 'sheet').length <= 10
  const first = pts[0], latest = pts[pts.length - 1]
  const tone = changeTone(m, latest.v - first.v)
  const h = hover != null ? pts[hover] : null
  function onMove(e) {
    const r = ref.current.getBoundingClientRect(), mx = e.clientX - r.left
    let best = 0
    pts.forEach((p, i) => { if (Math.abs(x(p) - mx) < Math.abs(x(pts[best]) - mx)) best = i })
    setHover(best)
  }
  return (
    <div ref={ref} className="relative w-full" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      {pts.length > 1 && (
        <p className="text-[13px] mb-1">
          <span className="tnum font-semibold" style={{ color: TONE_COLOR[tone] }}>{signed(latest.v - first.v)}{m.unit === '%' ? ' pts' : m.unit ? ` ${m.unit}` : ''}</span>
          <span className="text-muted"> from {fmtMetric(first.v, m)} on {fmtDay(first.date)} to {fmtMetric(latest.v, m)} on {fmtDay(latest.date)}</span>
          {m.better && <span className="text-faint"> · {m.better === 'down' ? 'lower' : 'higher'} is better</span>}
        </p>
      )}
      <svg width={W} height={H} role="img" aria-label={`${m.label}: ${pts.map(p => `${fmtDay(p.date)} ${p.v}`).join(', ')}`} className="block">
        {ticks.map(t => <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--c-line-soft)" strokeWidth="1" />
          <text x={padL - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-[var(--c-faint)] text-[10.5px] tnum">{t.toFixed(span < 5 ? 1 : 0)}</text>
        </g>)}
        {pts.length > 1 && <polyline points={pts.map(p => `${x(p)},${y(p.v)}`).join(' ')} fill="none" stroke={HUE} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
        {pts.map((p, i) => (
          <g key={p.date}>
            <circle cx={x(p)} cy={y(p.v)} r={hover === i ? 5.5 : p.src === 'sheet' ? 4.5 : 3} fill={p.src === 'sheet' ? HUE : 'var(--c-surface)'} stroke={HUE} strokeWidth="2" />
            {p.src === 'sheet' && labelAll && <text x={x(p)} y={y(p.v) - 10} textAnchor="middle" className="fill-[var(--c-ink)] text-[11px] font-semibold tnum">{fmtMetric(p.v, m)}</text>}
          </g>
        ))}
        <text x={padL} y={H - 6} className="fill-[var(--c-faint)] text-[10.5px]">{fmtDay(first.date, { day: 'numeric', month: 'short', year: '2-digit' })}</text>
        {pts.length > 1 && <text x={W - padR} y={H - 6} textAnchor="end" className="fill-[var(--c-faint)] text-[10.5px]">{fmtDay(latest.date, { day: 'numeric', month: 'short', year: '2-digit' })}</text>}
      </svg>
      {h && (
        <div className="absolute pointer-events-none rounded-[8px] px-2.5 py-1.5 text-[12px] shadow-pop bg-surface whitespace-nowrap"
          style={{ left: Math.min(Math.max(0, x(h) - 70), W - 150), top: Math.max(0, y(h.v) - 54) }}>
          <b>{fmtDay(h.date, { day: 'numeric', month: 'short', year: 'numeric' })}</b> · <span className="tnum">{fmtMetric(h.v, m)} {m.unit !== '%' ? m.unit : ''}</span>
          <span className="text-faint"> · {h.src === 'sheet' ? 'measurement' : 'daily weigh-in'}</span>
        </div>
      )}
    </div>
  )
}

// Like the gym's paper sheet: metrics down the side, one column per date
function MeasureTable({ rows, onEdit }) {
  const cols = rows.slice(-8)
  const first = rows[0], latest = rows[rows.length - 1]
  return (
    <section className="panel p-1.5">
      <div className="flex items-baseline gap-2 px-3.5 pt-3 pb-2">
        <h3 className="h-section mr-auto">All measurements</h3>
        <span className="text-[12px] text-faint">Tap a date to edit{rows.length > cols.length ? ` · showing the last ${cols.length}` : ''}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] tnum border-collapse">
          <thead>
            <tr>
              <th className="text-left font-medium text-muted px-3.5 py-2 sticky left-0 bg-surface min-w-[150px]">Metric</th>
              {cols.map(r => (
                <th key={r.id} className="px-2 py-1 text-right font-medium">
                  <button onClick={() => onEdit(r)} className="btn btn-quiet btn-sm whitespace-nowrap">{fmtDay(r.date, { day: 'numeric', month: 'short', year: '2-digit' })}</button>
                </th>
              ))}
              {rows.length > 1 && <th className="px-3.5 py-2 text-right font-medium text-muted whitespace-nowrap">Change</th>}
            </tr>
          </thead>
          <tbody>
            {BODY_GROUPS.map(g => {
              const ms = BODY_METRICS.filter(m => m.group === g.id && rows.some(r => r.vals?.[m.id] != null))
              if (!ms.length) return null
              return (
                <React.Fragment key={g.id}>
                  <tr><td colSpan={cols.length + 2} className="px-3.5 pt-3 pb-1 text-[11.5px] uppercase tracking-wide text-faint font-semibold sticky left-0 bg-surface">{g.label}</td></tr>
                  {ms.map(m => {
                    const a = first.vals?.[m.id], b = latest.vals?.[m.id]
                    const delta = a != null && b != null ? Number(b) - Number(a) : null
                    return (
                      <tr key={m.id} className="border-t border-line-soft">
                        <td className="px-3.5 py-1.5 sticky left-0 bg-surface">{m.label}{m.unit && <span className="text-faint"> {m.unit}</span>}</td>
                        {cols.map(r => <td key={r.id} className="px-3.5 py-1.5 text-right">{fmtMetric(r.vals?.[m.id], m)}</td>)}
                        {rows.length > 1 && <td className="px-3.5 py-1.5 text-right font-medium" style={{ color: delta == null ? undefined : TONE_COLOR[changeTone(m, delta)] }}>{delta == null ? '–' : signed(delta)}</td>}
                      </tr>
                    )
                  })}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function MeasureDialog({ row, last, onClose, onSave, onDelete }) {
  const open = !!row
  const editing = !!row?.id
  const [date, setDate] = useState(today())
  const [vals, setVals] = useState({})
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    setDate(row.date || today())
    setVals(Object.fromEntries(Object.entries(row.vals || {}).map(([k, v]) => [k, String(v)])))
    setNotes(row.notes || '')
  }, [open])
  const ref = editing ? null : last // show last time's numbers as hints on a new entry

  async function submit(e) {
    e.preventDefault()
    const clean = {}
    for (const m of BODY_METRICS) {
      const raw = String(vals[m.id] ?? '').replace(',', '.').trim()
      if (raw === '') continue
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0 || n > 1000) return alertBad(m)
      clean[m.id] = Math.round(n * 100) / 100
    }
    if (!Object.keys(clean).length) return
    setBusy(true)
    await onSave(editing ? row : null, clean, date, notes)
    setBusy(false)
  }
  function alertBad(m) { document.getElementById(`m-${m.id}`)?.focus() }

  return (
    <Dialog open={open} onClose={onClose} title={editing ? `Measurements · ${fmtDay(row.date, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Add measurements'} width={620}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <label><span className="label">Date measured</span><input type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} className="input w-auto" /></label>
          <p className="text-[12.5px] text-faint pb-2">Fill in what you have. Blank boxes are skipped.{ref ? ' Grey numbers are from last time.' : ''}</p>
        </div>
        {BODY_GROUPS.map(g => (
          <fieldset key={g.id}>
            <legend className="text-[13px] font-semibold">{g.label} <span className="text-faint font-normal">· {g.note}</span></legend>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
              {BODY_METRICS.filter(m => m.group === g.id).map(m => (
                <label key={m.id}>
                  <span className="block text-[12px] text-muted mb-1">{m.label}{m.unit && <span className="text-faint"> ({m.unit})</span>}</span>
                  <input id={`m-${m.id}`} type="number" inputMode="decimal" step="any" min="0" value={vals[m.id] ?? ''}
                    onChange={e => setVals(v => ({ ...v, [m.id]: e.target.value }))}
                    placeholder={ref?.vals?.[m.id] != null ? String(ref.vals[m.id]) : ''} className="input tnum py-1.5" />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <label><span className="label">Notes</span><input value={notes} onChange={e => setNotes(e.target.value)} className="input" placeholder="e.g. measured at Heal Fitness, morning, before food" /></label>
        <div className="flex items-center gap-2">
          {editing && <button type="button" onClick={() => onDelete(row)} className="btn btn-quiet text-danger mr-auto"><Trash2 size={15} /> Delete</button>}
          <button type="button" onClick={onClose} className="btn btn-quiet ml-auto">Cancel</button>
          <button disabled={busy} className="btn btn-primary">{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Dialog>
  )
}
