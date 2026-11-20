import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dumbbell, BookOpen, PenLine, Clock, Smartphone, Check } from 'lucide-react'
import { Dialog, Spinner, useToast } from './ui'
import { useBus, emit } from '../lib/bus'
import { sb, dbRun } from '../lib/supabase'
import { setLog, saveWriting, rowToHabit } from '../lib/habits'
import { uid, today, nowIso } from '../lib/utils'
import { DAYS } from '../lib/fitness'
import { syncHabitTask } from '../lib/habitTasks'

// Global dialog: when a habit-linked task is ticked, collect the habit's numbers and check it in.
export default function HabitLogDialog() {
  const [req, setReq] = useState(null)        // { task, resolve }
  const [habit, setHabit] = useState(null)
  const [ctx, setCtx] = useState(null)        // metric-specific data
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()
  const d = req?.date || today()
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useBus('habit-log:open', p => { setReq(p); setHabit(null); setCtx(null); setForm({}) })

  useEffect(() => {
    if (!req) return
    let alive = true
    ;(async () => {
      const { data } = await sb.from('habits').select('*').eq('id', req.task.habitId).maybeSingle()
      if (!data) { finish(true); return }  // habit was deleted: just complete the task
      const h = rowToHabit(data)
      const metric = h.metric
      const { data: log } = await sb.from('habit_logs').select('*').eq('habit_id', h.id).eq('date', d).maybeSingle()
      let c = { log }
      if (metric === 'writing') {
        const { data: w } = await sb.from('writing_logs').select('*').eq('date', d).maybeSingle()
        c.writing = w
        setForm({ words: w?.word_count ? String(w.word_count) : '', chapters: w?.chapters ? String(w.chapters) : '' })
      } else if (metric === 'reading') {
        const { data: books } = await sb.from('books').select('id,title,pages_read,total_pages,status').in('status', ['reading', 'unread', 'paused'])
        const list = (books || []).sort((a, b) => (a.status === 'reading' ? -1 : 0) - (b.status === 'reading' ? -1 : 0))
        c.books = list
        const first = list[0]
        setForm({ bookId: first?.id || '', start: first ? String(first.pages_read || 0) : '', end: '', minutes: guessMinutes(h.name) })
      } else if (metric === 'workout') {
        const { data: s } = await sb.from('workout_sessions').select('*').eq('date', d).maybeSingle()
        c.session = s
      } else if (metric === 'minutes' || metric === 'screentime') {
        setForm({ minutes: log?.duration_min ? String(log.duration_min) : metric === 'minutes' ? guessMinutes(h.name) : '', note: log?.note || '' })
      }
      if (!alive) return
      setHabit(h); setCtx(c)
      // Nothing to ask: log straight away
      if (metric === 'none' && h.trackType !== 'variants') save(h, c, {})
    })().catch(() => { toast('Couldn’t load the habit.', 'error'); finish(false) })
    return () => { alive = false }
  }, [req])

  function finish(ok) {
    if (ok && req?.syncTask && req.task?.habitId) syncHabitTask(req.task.habitId, d)
    req?.resolve(ok); setReq(null)
  }

  async function save(h = habit, c = ctx, fm = form) {
    setSaving(true)
    try {
      const m = h.metric
      if (m === 'writing') {
        await saveWriting(c.writing, d, parseInt(fm.chapters, 10) || 0, parseInt(fm.words, 10) || 0, { skipTaskSync: true })
      } else if (m === 'reading') {
        const minutes = Math.max(0, parseInt(fm.minutes, 10) || 0)
        let pages = 0
        const book = c.books?.find(b => b.id === fm.bookId)
        if (book && fm.end !== '') {
          const start = parseInt(fm.start, 10) || 0, end = parseInt(fm.end, 10) || 0
          if (end < start) { toast('End page must be after the start page.', 'error'); setSaving(false); return }
          pages = end - start
          await dbRun('Log reading', () => sb.from('reading_sessions').insert({ id: uid(), book_id: book.id, date: d, start_page: start, end_page: end, duration_min: Math.max(1, minutes), created_at: nowIso() }))
          const read = Math.max(book.pages_read || 0, end)
          const done = book.total_pages > 0 && read >= book.total_pages
          await dbRun('Update book', () => sb.from('books').update({ pages_read: read, status: done ? 'completed' : 'reading', ...(done ? { completed_at: d } : {}) }).eq('id', book.id))
          emit('library')
        } else if (fm.pages) pages = parseInt(fm.pages, 10) || 0
        await setLog(h.id, d, { variant: null, duration_min: (c.log?.duration_min || 0) + minutes || null, amount: (Number(c.log?.amount) || 0) + pages || null }, { skipTaskSync: true })
      } else if (m === 'minutes' || m === 'screentime') {
        const minutes = parseInt(fm.minutes, 10)
        if (!(minutes >= 0)) { toast('Add the minutes first.', 'error'); setSaving(false); return }
        await setLog(h.id, d, m === 'screentime'
          ? { variant: null, duration_min: null, amount: minutes, note: fm.note || '' }
          : { variant: null, duration_min: minutes, note: fm.note || '' }, { skipTaskSync: true })
      } else if (m === 'workout') {
        const s = c.session
        const label = s ? DAYS[s.day_type]?.group : fm.variant
        const map = { push: 'Push', pull: 'Pull', legs: 'Legs' }
        const variant = map[label] || fm.variant || null
        if (s?.day_type !== 'rest') await setLog(h.id, d, { variant: h.variants.includes(variant) ? variant : null, duration_min: null }, { skipTaskSync: true })
      } else {
        await setLog(h.id, d, { variant: fm.variant || null, duration_min: null }, { skipTaskSync: true })
      }
      emit('habits')
      finish(true)
    } catch { toast('Couldn’t save that. Try again.', 'error') }
    finally { setSaving(false) }
  }

  if (!req) return null
  const m = habit?.metric
  const hiddenNone = habit && m === 'none' && habit.trackType !== 'variants'
  const title = habit ? habit.name : 'Loading'

  return (
    <Dialog open={!!req && !hiddenNone} onClose={() => finish(false)} title={title} width={440}>
      {!habit ? <div className="py-8 flex justify-center"><Spinner /></div> : (
        <form onSubmit={e => { e.preventDefault(); save() }} className="flex flex-col gap-3">
          {m === 'writing' && <>
            <Lead icon={PenLine}>Today’s writing. This updates your writing log and streak.</Lead>
            <div className="grid grid-cols-2 gap-2">
              <Num label="Words written" value={form.words} onChange={v => f('words', v)} autoFocus />
              <Num label="Chapters released" value={form.chapters} onChange={v => f('chapters', v)} />
            </div>
          </>}

          {m === 'reading' && <>
            <Lead icon={BookOpen}>What did you read? Pages go to the book in your library.</Lead>
            {ctx.books?.length > 0 ? (
              <label><span className="label">Book</span>
                <select className="input" value={form.bookId} onChange={e => { const b = ctx.books.find(x => x.id === e.target.value); setForm(p => ({ ...p, bookId: e.target.value, start: b ? String(b.pages_read || 0) : '' })) }}>
                  {ctx.books.map(b => <option key={b.id} value={b.id}>{b.title}{b.total_pages ? ` (p. ${b.pages_read || 0}/${b.total_pages})` : ''}</option>)}
                  <option value="">Something else</option>
                </select>
              </label>
            ) : null}
            <div className="grid grid-cols-3 gap-2">
              {form.bookId ? <>
                <Num label="From page" value={form.start} onChange={v => f('start', v)} />
                <Num label="To page" value={form.end} onChange={v => f('end', v)} autoFocus />
              </> : <Num label="Pages" value={form.pages || ''} onChange={v => f('pages', v)} autoFocus />}
              <Num label="Minutes" value={form.minutes} onChange={v => f('minutes', v)} />
            </div>
          </>}

          {(m === 'minutes' || m === 'screentime') && <>
            <Lead icon={m === 'screentime' ? Smartphone : Clock}>
              {m === 'screentime' ? 'Total screen time today. Check Digital Wellbeing (Android) or Screen Time (iPhone).' : 'How long did you spend on it?'}
            </Lead>
            <Num label={m === 'screentime' ? 'Screen time (minutes)' : 'Minutes'} value={form.minutes} onChange={v => f('minutes', v)} autoFocus />
            {m === 'screentime' && Number(form.minutes) > 120 && <p className="text-[13px] text-warn">That’s over your 2-hour target. Log it honestly anyway. The trend is what counts.</p>}
            <label><span className="label">Note (optional)</span><input className="input" value={form.note} onChange={e => f('note', e.target.value)} placeholder={m === 'minutes' ? 'e.g. Raag Yaman alaap' : ''} maxLength={500} /></label>
          </>}

          {m === 'workout' && (ctx.session?.finished_at ? <>
            <Lead icon={Dumbbell}>{DAYS[ctx.session.day_type]?.label} done today: {ctx.session.stats?.done ?? 0} of {ctx.session.stats?.planned ?? 0} sets{ctx.session.cardio_min ? `, ${Number(ctx.session.cardio_min)} min cardio` : ''}.</Lead>
            {ctx.session.stats?.message?.title && <p className="text-[14px] font-medium">{ctx.session.stats.message.title}</p>}
          </> : <>
            <Lead icon={Dumbbell}>Today’s workout isn’t finished in Fitness yet. Log your sets there and this ticks itself.</Lead>
            <button type="button" className="btn btn-primary" onClick={() => { finish(false); navigate('/fitness') }}>Open today’s workout</button>
            {habit.variants.length > 0 && <>
              <p className="text-[12.5px] text-muted mt-1">Or mark it done anyway (e.g. you trained somewhere else):</p>
              <div className="flex flex-wrap gap-1.5">{habit.variants.map(v => <button type="button" key={v} onClick={() => f('variant', v)} className="chip" aria-pressed={form.variant === v} style={form.variant === v ? { color: 'var(--c-ink)', boxShadow: 'inset 0 0 0 1.5px var(--c-accent)' } : undefined}>{v}</button>)}</div>
            </>}
          </>)}

          {m === 'none' && habit.trackType === 'variants' && <>
            <Lead icon={Check}>Which one?</Lead>
            <div className="flex flex-wrap gap-1.5">{habit.variants.map(v => <button type="button" key={v} onClick={() => f('variant', v)} className="chip" aria-pressed={form.variant === v} style={form.variant === v ? { color: 'var(--c-ink)', boxShadow: 'inset 0 0 0 1.5px var(--c-accent)' } : undefined}>{v}</button>)}</div>
          </>}

          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={() => finish(false)} className="btn btn-quiet">Cancel</button>
            {!(m === 'workout' && !ctx.session?.finished_at && !form.variant) && (
              <button disabled={saving} className="btn btn-primary">{saving ? 'Saving' : 'Log & complete'}</button>
            )}
          </div>
        </form>
      )}
    </Dialog>
  )
}

function guessMinutes(name) { const m = String(name).match(/(\d+)\s*min/i); return m ? m[1] : '' }

function Lead({ icon: Icon, children }) {
  return <p className="text-[14px] text-muted flex items-start gap-2"><Icon size={16} className="mt-0.5 flex-shrink-0" /> <span>{children}</span></p>
}

function Num({ label, value, onChange, autoFocus }) {
  return (
    <label><span className="label">{label}</span>
      <input type="number" inputMode="numeric" min="0" value={value} onChange={e => onChange(e.target.value)} autoFocus={autoFocus} className="input tnum text-[16px] font-semibold" />
    </label>
  )
}
