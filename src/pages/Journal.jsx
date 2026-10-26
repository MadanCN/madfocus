import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, Bold, Italic, List, ListOrdered, Plus, Check, Quote } from 'lucide-react'
import { SaveState, PageLoader, useToast } from '../components/ui'
import { sb, dbRun } from '../lib/supabase'
import { useAutosave } from '../lib/useAutosave'
import { createTask } from '../lib/tasks'
import { uid, today, addDays, parseYmd, relDay, nowIso, daysBetween } from '../lib/utils'

const CODES = [
  { id: 'kind',     title: 'Be kind',               text: 'You don’t know what another person is going through. We see the choices people make, but not the options they had. Always choose kindness and be slow to judge.' },
  { id: 'just',     title: 'Just do it',            text: 'You rarely regret the things you did; you regret the things you didn’t. Today is the youngest you will ever be. Do it now.' },
  { id: 'windows',  title: 'Create windows',        text: 'We all live within the limits of our own perspective. Every skill you learn, book you read, place you visit and person you meet opens a new window. Create as many as you can.' },
  { id: 'word',     title: 'Keep your word',        text: 'The promises you make to yourself matter as much as the ones you make to others. Say less, do more, and let your actions speak for your character.' },
  { id: 'courage',  title: 'Courage over comfort',  text: 'Growth rarely happens inside your comfort zone. When choosing between what is easy and what is meaningful, choose the meaningful path.' },
  { id: 'die',      title: 'Remember you will die', text: 'Life is finite. Let that sharpen your priorities, not frighten you. Focus on what will matter when you look back.' },
  { id: 'grateful', title: 'Be grateful',           text: 'Most things you take for granted were once things you wished for. Ambition moves you forward; gratitude lets you enjoy the journey.' },
]

const EMOTIONS = {
  good:  ['Grateful', 'Excited', 'Calm', 'Confident', 'Hopeful', 'Energized', 'Joyful', 'Motivated', 'Proud', 'Content', 'Creative', 'Loved', 'Playful'],
  even:  ['Focused', 'Thoughtful', 'Curious', 'Reflective', 'Neutral', 'Pensive'],
  heavy: ['Anxious', 'Stressed', 'Tired', 'Frustrated', 'Sad', 'Overwhelmed', 'Angry', 'Unmotivated', 'Lonely', 'Disappointed', 'Restless', 'Worried'],
}
const TONE = {
  good:  { bg: 'var(--c-good-soft)', fg: 'var(--c-good)' },
  even:  { bg: 'var(--c-accent-soft)', fg: 'var(--c-accent)' },
  heavy: { bg: 'var(--c-warn-soft)', fg: 'var(--c-warn)' },
}
const VALUES = ['Fully', 'Mostly', 'Somewhat', 'Not really', 'No']
const GRATITUDE = ['Family', 'Health', 'Work', 'Friends', 'Learning', 'Nature', 'Food', 'Rest', 'Music', 'Books', 'Progress', 'Kindness']

const BLANK = { mood: 3, emotions: [], important_events: '', went_well: '', difficult: '', learned: '', values_alignment: '', gratitude: '', tomorrow_priority: '', content: '' }
const FIELDS = ['emotions', 'important_events', 'went_well', 'difficult', 'learned', 'values_alignment', 'gratitude', 'tomorrow_priority', 'content']

function fromRow(e) {
  if (!e) return { ...BLANK }
  return {
    mood: e.mood || 3, emotions: (e.emotions || []).map(x => x[0].toUpperCase() + x.slice(1)),
    important_events: e.important_events || '', went_well: e.went_well || e.highlights || '', difficult: e.difficult || '',
    learned: e.learned || '', values_alignment: normalizeValue(e.values_alignment), gratitude: e.gratitude || '',
    tomorrow_priority: e.tomorrow_priority || '', content: e.content || '',
  }
}
function normalizeValue(v) {
  if (!v) return ''
  const map = { 'Yes — fully': 'Fully', 'Mostly yes': 'Mostly' }
  return map[v] || v
}
function answered(f) {
  return FIELDS.filter(k => Array.isArray(f[k]) ? f[k].length : String(f[k] || '').replace(/<[^>]+>/g, '').trim()).length
}

export default function Journal() {
  const [date, setDate] = useState(today())
  const [entries, setEntries] = useState(null)
  const [form, setForm] = useState(BLANK)
  const [calOpen, setCalOpen] = useState(false)
  const [addedTask, setAddedTask] = useState(false)
  const rowRef = useRef(null)      // { id, created_at } for the open date
  const formRef = useRef(BLANK)
  const editorRef = useRef(null)
  const toast = useToast()

  const { queue, flush, status, retry } = useAutosave(async (d) => {
    const f = formRef.current
    if (!rowRef.current) rowRef.current = { id: uid(), created_at: nowIso() }
    const row = {
      id: rowRef.current.id, date: d, mood: f.mood,
      emotions: f.emotions.map(x => x.toLowerCase()), important_events: f.important_events,
      went_well: f.went_well, highlights: f.went_well, difficult: f.difficult, learned: f.learned,
      values_alignment: f.values_alignment, gratitude: f.gratitude, tomorrow_priority: f.tomorrow_priority,
      content: f.content, created_at: rowRef.current.created_at, updated_at: nowIso(),
    }
    await dbRun('Save journal', () => sb.from('journal_entries').upsert(row, { onConflict: 'user_id,date' }))
    setEntries(p => [row, ...(p || []).filter(e => e.date !== d)])
  }, 900)

  useEffect(() => {
    sb.from('journal_entries').select('*').order('date', { ascending: false })
      .then(({ data }) => setEntries(data || []))
  }, [])

  // Load the entry whenever the date (or initial data) changes
  useEffect(() => {
    if (!entries) return
    const e = entries.find(x => x.date === date)
    rowRef.current = e ? { id: e.id, created_at: e.created_at } : null
    const f = fromRow(e)
    formRef.current = f
    setForm(f)
    setAddedTask(false)
    if (editorRef.current) editorRef.current.innerHTML = f.content
  }, [date, entries === null])

  const update = useCallback(patch => {
    const next = { ...formRef.current, ...patch }
    formRef.current = next
    setForm(next)
    queue(date, {})
  }, [date, queue])

  async function goTo(d) {
    if (d > today()) return
    await flush()
    setDate(d)
    setCalOpen(false)
  }

  async function addPriorityTask() {
    const t = form.tomorrow_priority.trim()
    if (!t) return
    try { await createTask({ title: t, due: addDays(date, 1), priority: 'P2' }); setAddedTask(true); toast(`Added to ${relDay(addDays(date, 1)).toLowerCase()}`) }
    catch { toast('Couldn’t add the task.', 'error') }
  }

  if (!entries) return <PageLoader />

  const code = CODES[Math.abs(daysBetween('2024-01-01', date)) % CODES.length]
  const entryDates = new Set(entries.map(e => e.date))
  const week = Array.from({ length: 7 }, (_, i) => addDays(date, i - 6 + Math.min(3, daysBetween(date, today()))))
  const count = answered(form)
  const dt = parseYmd(date)

  return (
    <div className="max-w-[1040px] mx-auto px-4 md:px-8 pt-8 md:pt-12">
      {/* Date navigation */}
      <header className="flex flex-wrap items-end gap-4 mb-4">
        <div className="mr-auto">
          <p className="text-[14px] text-muted mb-1">{relDay(date) === 'Today' || relDay(date) === 'Yesterday' ? relDay(date) : dt.getFullYear()}</p>
          <h1 className="h-page">{dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</h1>
        </div>
        <div className="flex items-center gap-1 relative">
          <button onClick={() => goTo(addDays(date, -1))} className="btn btn-outline btn-icon" aria-label="Previous day"><ChevronLeft size={17} /></button>
          <button onClick={() => setCalOpen(o => !o)} className="btn btn-outline" aria-expanded={calOpen}><CalendarDays size={16} /> <span className="hidden sm:inline">Pick a day</span></button>
          <button onClick={() => goTo(addDays(date, 1))} disabled={date >= today()} className="btn btn-outline btn-icon" aria-label="Next day"><ChevronRight size={17} /></button>
          {date !== today() && <button onClick={() => goTo(today())} className="btn btn-quiet">Today</button>}
          {calOpen && <MonthPicker date={date} entryDates={entryDates} onPick={goTo} onClose={() => setCalOpen(false)} />}
        </div>
      </header>

      <div className="flex gap-1 mb-10 overflow-x-auto" role="group" aria-label="This week">
        {week.map(d => {
          const sel = d === date
          return (
            <button key={d} onClick={() => goTo(d)} disabled={d > today()} aria-pressed={sel}
              className="flex-1 min-w-[44px] h-[58px] rounded-[12px] flex flex-col items-center justify-center gap-1 transition-colors disabled:opacity-30"
              style={{ background: sel ? 'var(--c-ink)' : 'transparent', color: sel ? 'var(--c-paper)' : undefined }}>
              <span className="text-[11.5px]" style={{ color: sel ? undefined : 'var(--c-faint)' }}>{parseYmd(d).toLocaleDateString('en-GB', { weekday: 'short' })}</span>
              <span className="text-[15px] font-semibold tnum">{parseYmd(d).getDate()}</span>
              <span className="w-1 h-1 rounded-full" style={{ background: entryDates.has(d) ? (sel ? 'var(--c-paper)' : 'var(--m-journal)') : 'transparent' }} />
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,680px)_1fr] gap-10 lg:gap-14">
        <article className="min-w-0">
          <div className="flex items-center mb-8 text-[13px] text-muted">
            <span>{count === 0 ? 'Nothing written yet' : `${count} of ${FIELDS.length} prompts answered`}</span>
            <SaveState status={status} onRetry={retry} className="ml-auto" />
          </div>

          <Prompt title="How are you feeling?">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(EMOTIONS).flatMap(([tone, list]) => list.map(em => {
                const on = form.emotions.includes(em)
                return (
                  <button key={em} aria-pressed={on}
                    onClick={() => update({ emotions: on ? form.emotions.filter(x => x !== em) : [...form.emotions, em] })}
                    className="h-8 px-3 rounded-full text-[13px] transition-[background-color,color,box-shadow] duration-150"
                    style={on ? { background: TONE[tone].bg, color: TONE[tone].fg, fontWeight: 600 } : { boxShadow: 'inset 0 0 0 1px var(--c-line)', color: 'var(--c-muted)' }}>
                    {em}
                  </button>
                )
              }))}
            </div>
          </Prompt>

          <Prompt title="Three things that mattered today">
            <Answer value={form.important_events} onChange={v => update({ important_events: v })} placeholder={'1.\n2.\n3.'} minRows={3} />
          </Prompt>
          <Prompt title="What went well?">
            <Answer value={form.went_well} onChange={v => update({ went_well: v })} placeholder="What are you proud of? What worked?" />
          </Prompt>
          <Prompt title="What was hard?">
            <Answer value={form.difficult} onChange={v => update({ difficult: v })} placeholder="What got in the way? What would you change?" />
          </Prompt>
          <Prompt title="What did you learn?">
            <Answer value={form.learned} onChange={v => update({ learned: v })} placeholder="A lesson, an insight, a skill…" />
          </Prompt>
          <Prompt title="Did you act on your values?">
            <div className="flex flex-wrap gap-1.5">
              {VALUES.map(v => (
                <button key={v} className="pick" aria-pressed={form.values_alignment === v}
                  onClick={() => update({ values_alignment: form.values_alignment === v ? '' : v })}>{v}</button>
              ))}
            </div>
          </Prompt>
          <Prompt title="What are you grateful for?">
            <div className="flex flex-wrap gap-1.5 mb-3">
              {GRATITUDE.map(g => {
                const has = form.gratitude.toLowerCase().split('\n').some(l => l.trim() === g.toLowerCase())
                return (
                  <button key={g} disabled={has} className="h-7 px-2.5 rounded-full text-[12.5px] text-muted shadow-[inset_0_0_0_1px_var(--c-line)] hover:text-ink disabled:opacity-40"
                    onClick={() => update({ gratitude: form.gratitude ? `${form.gratitude.trimEnd()}\n${g.toLowerCase()}` : g.toLowerCase() })}>+ {g}</button>
                )
              })}
            </div>
            <Answer value={form.gratitude} onChange={v => update({ gratitude: v })} placeholder="Name three things, however small." />
          </Prompt>
          <Prompt title="The one thing that matters most tomorrow">
            <Answer value={form.tomorrow_priority} onChange={v => update({ tomorrow_priority: v })} placeholder="If you only did one thing…" single />
            {form.tomorrow_priority.trim() && (
              addedTask
                ? <p className="mt-3 text-[13px] text-good inline-flex items-center gap-1.5"><Check size={14} /> Added to tomorrow’s list</p>
                : <button onClick={addPriorityTask} className="btn btn-outline btn-sm mt-3"><Plus size={14} /> Add to tomorrow’s tasks</button>
            )}
          </Prompt>
          <Prompt title="Anything else on your mind">
            <FreeWrite editorRef={editorRef} onChange={html => update({ content: html })} />
          </Prompt>
        </article>

        <aside className="lg:sticky lg:top-8 h-fit">
          <figure className="rounded-[16px] p-6" style={{ background: 'color-mix(in srgb, var(--m-journal) 8%, var(--c-surface))' }}>
            <Quote size={18} style={{ color: 'var(--m-journal)' }} />
            <p className="text-[13px] text-muted mt-3">Today’s code</p>
            <p className="font-serif text-[22px] leading-snug font-medium mt-1">{code.title}</p>
            <blockquote className="font-serif text-[15px] leading-relaxed text-muted mt-3">{code.text}</blockquote>
          </figure>
          <details className="mt-4 group">
            <summary className="cursor-pointer text-[13.5px] text-muted hover:text-ink list-none flex items-center gap-1.5 px-1">
              <ChevronRight size={15} className="transition-transform group-open:rotate-90" /> All seven codes
            </summary>
            <ul className="mt-3 flex flex-col gap-4 px-1">
              {CODES.map(c => (
                <li key={c.id}>
                  <p className="text-[14px] font-semibold">{c.title}</p>
                  <p className="text-[13px] text-muted leading-relaxed mt-0.5">{c.text}</p>
                </li>
              ))}
            </ul>
          </details>
        </aside>
      </div>
    </div>
  )
}

function Prompt({ title, children }) {
  return (
    <section className="mb-10">
      <h2 className="font-serif text-[19px] md:text-[21px] font-medium leading-snug mb-3">{title}</h2>
      {children}
    </section>
  )
}

function Answer({ value, onChange, placeholder, minRows = 2, single }) {
  const ref = useRef(null)
  useEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }, [value])
  return (
    <textarea ref={ref} value={value} rows={single ? 1 : minRows} placeholder={placeholder}
      onChange={e => onChange(single ? e.target.value.replace(/\n/g, ' ') : e.target.value)}
      onKeyDown={e => { if (single && e.key === 'Enter') e.preventDefault() }}
      className="w-full bg-transparent outline-none resize-none prose-write placeholder:text-faint border-b border-line-soft focus:border-[var(--c-faint)] pb-2 transition-colors" />
  )
}

function FreeWrite({ editorRef, onChange }) {
  const cmd = (c, v = null) => { document.execCommand(c, false, v); editorRef.current?.focus(); onChange(editorRef.current?.innerHTML || '') }
  return (
    <div>
      <div className="flex gap-1 mb-2">
        {[[Bold, 'bold', 'Bold'], [Italic, 'italic', 'Italic'], [List, 'insertUnorderedList', 'Bulleted list'], [ListOrdered, 'insertOrderedList', 'Numbered list']].map(([Icon, c, label]) => (
          <button key={c} onMouseDown={e => { e.preventDefault(); cmd(c) }} className="btn btn-quiet btn-sm btn-icon" aria-label={label} data-tip={label}><Icon size={15} /></button>
        ))}
      </div>
      <div ref={editorRef} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Free writing"
        data-placeholder="Write freely. It saves as you go."
        onInput={e => onChange(e.currentTarget.innerHTML)}
        className="prose-write min-h-[200px] border-b border-line-soft pb-4" />
    </div>
  )
}

function MonthPicker({ date, entryDates, onPick, onClose }) {
  const [view, setView] = useState(() => { const d = parseYmd(date); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (!ref.current?.contains(e.target)) onClose() }
    const k = e => { if (e.key === 'Escape') onClose() }
    setTimeout(() => document.addEventListener('pointerdown', h), 0)
    document.addEventListener('keydown', k)
    return () => { document.removeEventListener('pointerdown', h); document.removeEventListener('keydown', k) }
  }, [])
  const y = view.getFullYear(), m = view.getMonth()
  const offset = (new Date(y, m, 1).getDay() + 6) % 7
  const days = new Date(y, m + 1, 0).getDate()
  const t = today()
  const isCurrent = y === new Date().getFullYear() && m === new Date().getMonth()
  return (
    <div ref={ref} className="absolute right-0 top-[calc(100%+8px)] z-40 w-[296px] bg-surface rounded-[16px] shadow-pop p-4">
      <div className="flex items-center mb-3">
        <button onClick={() => setView(new Date(y, m - 1, 1))} className="btn btn-quiet btn-sm btn-icon" aria-label="Previous month"><ChevronLeft size={16} /></button>
        <span className="flex-1 text-center text-[14px] font-semibold">{view.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
        <button onClick={() => setView(new Date(y, m + 1, 1))} disabled={isCurrent} className="btn btn-quiet btn-sm btn-icon" aria-label="Next month"><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-faint mb-1">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: offset }).map((_, i) => <span key={'e' + i} />)}
        {Array.from({ length: days }, (_, i) => {
          const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
          const sel = ds === date, future = ds > t
          return (
            <button key={ds} disabled={future} onClick={() => onPick(ds)}
              className="relative h-9 rounded-[8px] text-[13px] tnum disabled:opacity-30 hover:bg-sunken"
              style={{ background: sel ? 'var(--c-ink)' : undefined, color: sel ? 'var(--c-paper)' : undefined, fontWeight: ds === t ? 700 : 400 }}>
              {i + 1}
              {entryDates.has(ds) && !sel && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" style={{ background: 'var(--m-journal)' }} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
