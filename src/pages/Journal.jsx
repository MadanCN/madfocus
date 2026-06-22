import React, { useState, useEffect, useRef, useCallback } from 'react'
import { sb, dbRun } from '../lib/supabase'
import { useToast } from '../components/ui'

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function today() { return new Date().toISOString().slice(0, 10) }
function fmtDate(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }
function ymd(y, m, d) { return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` }

// ── Codes for Life icons ─────────────────────────────────────────
const CodeIcons = {
  kind:    p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  just:    p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  windows: p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>,
  word:    p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  courage: p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.37 2.63L14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 0 0-3-3z"/><path d="M9 8c-2 3-2 6.5 1 10s6.5 3.5 10 1"/><path d="M14.5 17.5L4.5 15 2 12l2.5-3L9 7.5"/></svg>,
  die:     p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  grateful:p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
}

// ── Codes for Life ──────────────────────────────────────────────
const CODES = [
  { id: 'kind',     title: 'Be Kind',                full: "You don't know what another person is going through. We see the choices people make, but not the options they had. Always choose kindness and be slow to judge." },
  { id: 'just',     title: 'Just Do It',             full: "You rarely regret the things you did; you regret the things you didn't. Every time you think, \"I wish I had done this when I was younger,\" remember: today is the youngest you will ever be. Do it now." },
  { id: 'windows',  title: 'Create Windows',         full: "We all live within the limits of our own perspective. Every skill you learn, book you read, place you visit, and person you meet opens a new window through which to experience life. Create as many windows as you can." },
  { id: 'word',     title: 'Keep Your Word',         full: "The promises you make to yourself are just as important as the promises you make to others. Say less, do more, and let your actions speak for your character." },
  { id: 'courage',  title: 'Courage Over Comfort',   full: "Growth rarely happens inside your comfort zone. When faced with a choice between what is easy and what is meaningful, choose the meaningful path." },
  { id: 'die',      title: 'Remember You Will Die',  full: "Life is finite. Let that awareness sharpen your priorities, not frighten you. Focus on what will matter when you look back on your life." },
  { id: 'grateful', title: 'Be Grateful',            full: "Most things you take for granted today were once things you wished for. Ambition moves you forward; gratitude lets you enjoy the journey. Appreciate the people, experiences, and opportunities that make life worth living." },
]

// ── Emotions ────────────────────────────────────────────────────
const EMOTIONS = {
  positive: [
    { id: 'grateful', label: 'Grateful' },
    { id: 'excited', label: 'Excited' },
    { id: 'calm', label: 'Calm' },
    { id: 'confident', label: 'Confident' },
    { id: 'hopeful', label: 'Hopeful' },
    { id: 'energized', label: 'Energized' },
    { id: 'joyful', label: 'Joyful' },
    { id: 'motivated', label: 'Motivated' },
    { id: 'proud', label: 'Proud' },
    { id: 'content', label: 'Content' },
    { id: 'creative', label: 'Creative' },
    { id: 'loved', label: 'Loved' },
    { id: 'playful', label: 'Playful' },
  ],
  neutral: [
    { id: 'focused', label: 'Focused' },
    { id: 'thoughtful', label: 'Thoughtful' },
    { id: 'curious', label: 'Curious' },
    { id: 'reflective', label: 'Reflective' },
    { id: 'neutral', label: 'Neutral' },
    { id: 'pensive', label: 'Pensive' },
  ],
  negative: [
    { id: 'anxious', label: 'Anxious' },
    { id: 'stressed', label: 'Stressed' },
    { id: 'tired', label: 'Tired' },
    { id: 'frustrated', label: 'Frustrated' },
    { id: 'sad', label: 'Sad' },
    { id: 'overwhelmed', label: 'Overwhelmed' },
    { id: 'angry', label: 'Angry' },
    { id: 'unmotivated', label: 'Unmotivated' },
    { id: 'lonely', label: 'Lonely' },
    { id: 'disappointed', label: 'Disappointed' },
    { id: 'restless', label: 'Restless' },
    { id: 'worried', label: 'Worried' },
  ],
}

const EMOTION_COLORS = {
  positive: { bg: 'var(--c-accent-light)', color: 'var(--c-accent)', border: 'var(--c-accent-mid)' },
  neutral:  { bg: 'var(--c-border-light)', color: 'var(--c-muted)',  border: 'var(--c-border)' },
  negative: { bg: 'var(--c-warn-light)',   color: 'var(--c-warn)',   border: 'color-mix(in srgb, var(--c-warn) 40%, transparent)' },
}

const VALUES_OPTIONS = ['Yes — fully', 'Mostly yes', 'Somewhat', 'Not really', 'No']

const GRATITUDE_CHIPS = ['Family', 'Health', 'Work', 'Friends', 'Learning', 'Nature', 'Food', 'Rest', 'Music', 'Books', 'Progress', 'Kindness']

const BLANK_FORM = {
  mood: 3,
  emotions: [],
  important_events: '',
  went_well: '',
  difficult: '',
  learned: '',
  values_alignment: '',
  gratitude: '',
  tomorrow_priority: '',
  content: '',  // free-form
}

// ── Mini Calendar ──────────────────────────────────────────────
function MiniCalendar({ entries, selectedDate, onSelect }) {
  const [viewDate, setViewDate] = useState(new Date(selectedDate + 'T00:00:00'))
  const entryDates = new Set(entries.map(e => e.date))
  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = today()
  const startOffset = (firstDay + 6) % 7

  function navMonth(delta) {
    setViewDate(d => {
      const nd = new Date(d)
      nd.setMonth(nd.getMonth() + delta)
      return nd
    })
  }

  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div className="rounded-card p-4" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => navMonth(-1)} className="p-1 rounded text-muted hover:text-text hover:bg-bg transition-colors">
          <ChevLeft />
        </button>
        <span className="text-[12px] font-medium" style={{ color: 'var(--c-text)' }}>
          {viewDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
        </span>
        <button
          onClick={() => navMonth(1)}
          disabled={year === new Date().getFullYear() && month === new Date().getMonth()}
          className="p-1 rounded text-muted hover:text-text hover:bg-bg transition-colors disabled:opacity-30"
        >
          <ChevRight />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={i} className="text-center text-[9.5px] font-medium py-0.5" style={{ color: 'var(--c-faint)' }}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const dateStr = ymd(year, month, day)
          const hasEntry = entryDates.has(dateStr)
          const isSelected = dateStr === selectedDate
          const isToday = dateStr === todayStr
          const isFuture = dateStr > todayStr
          return (
            <button
              key={i}
              onClick={() => !isFuture && onSelect(dateStr)}
              disabled={isFuture}
              className="relative aspect-square flex items-center justify-center rounded-[5px] text-[11px] transition-all cursor-pointer"
              style={{
                background: isSelected ? 'var(--c-accent)' : 'transparent',
                color: isFuture ? 'var(--c-faint)' : isSelected ? '#fff' : isToday ? 'var(--c-accent)' : 'var(--c-text)',
                fontWeight: (isSelected || isToday) ? 600 : 400,
                outline: isToday && !isSelected ? '1px solid var(--c-accent)' : 'none',
                cursor: isFuture ? 'not-allowed' : 'pointer',
              }}
            >
              {day}
              {hasEntry && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" style={{ background: 'var(--c-accent)' }} />
              )}
            </button>
          )
        })}
      </div>
      <button onClick={() => onSelect(todayStr)} className="mt-2 w-full text-[11px] hover:underline text-center" style={{ color: 'var(--c-accent)' }}>
        Today
      </button>
    </div>
  )
}

// ── Codes for Life strip ───────────────────────────────────────
function CodesStrip() {
  const [expanded, setExpanded] = useState(null)
  return (
    <div className="mb-5">
      <p className="text-[10px] font-bold tracking-[.09em] uppercase mb-2" style={{ color: 'var(--c-faint)' }}>Codes for Life</p>
      <div className="flex gap-2 flex-wrap">
        {CODES.map(c => (
          <div key={c.id} className="relative">
            <button
              onClick={() => setExpanded(expanded === c.id ? null : c.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all"
              style={{
                background: expanded === c.id ? 'var(--c-accent)' : 'var(--c-surface)',
                color: expanded === c.id ? '#fff' : 'var(--c-text)',
                border: `1px solid ${expanded === c.id ? 'var(--c-accent)' : 'var(--c-border)'}`,
              }}
            >
              {CodeIcons[c.id] && React.createElement(CodeIcons[c.id], { className: 'w-3 h-3 flex-shrink-0' })}
              <span>{c.title}</span>
            </button>
            {expanded === c.id && (
              <div
                className="absolute top-full left-0 mt-2 z-20 rounded-[10px] p-4 text-[12.5px] leading-relaxed animate-slide-up"
                style={{
                  background: 'var(--c-surface)',
                  border: '1px solid var(--c-border)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
                  width: 300,
                  color: 'var(--c-text)',
                }}
              >
                <p className="font-semibold mb-1.5 flex items-center gap-1.5">
                  {CodeIcons[c.id] && React.createElement(CodeIcons[c.id], { className: 'w-3.5 h-3.5 flex-shrink-0' })} {c.title}
                </p>
                <p style={{ color: 'var(--c-muted)' }}>{c.full}</p>
                <button
                  onClick={() => setExpanded(null)}
                  className="mt-2 text-[11px] hover:underline"
                  style={{ color: 'var(--c-accent)' }}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Section card ───────────────────────────────────────────────
function Section({ label, prompt, children }) {
  return (
    <div className="rounded-card p-5 mb-3" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
      {label && <p className="text-[10px] font-bold tracking-[.08em] uppercase mb-1.5" style={{ color: 'var(--c-faint)' }}>{label}</p>}
      {prompt && <p className="text-[13.5px] font-medium mb-3" style={{ color: 'var(--c-text)' }}>{prompt}</p>}
      {children}
    </div>
  )
}

function JournalTextarea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea
      className="w-full outline-none text-[13px] leading-relaxed resize-none"
      style={{ background: 'transparent', color: 'var(--c-text)', minHeight: rows * 22 }}
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={rows}
    />
  )
}

// ── Main Journal ───────────────────────────────────────────────
export default function Journal() {
  const toast = useToast()
  const [date, setDate]       = useState(today())
  const [entry, setEntry]     = useState(null)
  const [form, setForm]       = useState(BLANK_FORM)
  const [saving, setSaving]   = useState(false)
  const [entries, setEntries] = useState([])
  const saveTimer             = useRef(null)
  const editorRef             = useRef(null)

  // Load all entries
  useEffect(() => {
    sb.from('journal_entries').select('*').order('date', { ascending: false })
      .then(({ data }) => setEntries(data || []))
  }, [])

  // Load/reset entry for the current date
  useEffect(() => {
    const e = entries.find(x => x.date === date)
    if (e) {
      setEntry(e)
      setForm({
        mood:             e.mood || 3,
        emotions:         e.emotions || [],
        important_events: e.important_events || '',
        went_well:        e.went_well || e.highlights || '',
        difficult:        e.difficult || '',
        learned:          e.learned || '',
        values_alignment: e.values_alignment || '',
        gratitude:        e.gratitude || '',
        tomorrow_priority:e.tomorrow_priority || '',
        content:          e.content || '',
      })
      if (editorRef.current) editorRef.current.innerHTML = e.content || ''
    } else {
      setEntry(null)
      setForm(BLANK_FORM)
      if (editorRef.current) editorRef.current.innerHTML = ''
    }
  }, [date, entries])

  const handleEditorInput = useCallback(() => {
    const html = editorRef.current?.innerHTML || ''
    setForm(p => {
      const updated = { ...p, content: html }
      scheduleSave(updated)
      return updated
    })
  }, [])

  function field(k, v) {
    setForm(p => {
      const updated = { ...p, [k]: v }
      scheduleSave(updated)
      return updated
    })
  }

  function toggleEmotion(id) {
    setForm(p => {
      const emotions = p.emotions.includes(id)
        ? p.emotions.filter(x => x !== id)
        : [...p.emotions, id]
      const updated = { ...p, emotions }
      scheduleSave(updated)
      return updated
    })
  }

  function scheduleSave(data) {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persistEntry(data), 1000)
  }

  async function persistEntry(data) {
    const hasContent = Object.entries(data).some(([k, v]) => {
      if (k === 'mood') return false
      if (Array.isArray(v)) return v.length > 0
      return v && v.trim()
    })
    if (!hasContent) return

    setSaving(true)
    const row = {
      id: entry?.id || uid(),
      date,
      mood: data.mood,
      content: data.content,
      highlights: data.went_well, // backward compat
      gratitude: data.gratitude,
      emotions: data.emotions,
      important_events: data.important_events,
      went_well: data.went_well,
      difficult: data.difficult,
      learned: data.learned,
      values_alignment: data.values_alignment,
      tomorrow_priority: data.tomorrow_priority,
      created_at: entry?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    try {
      await dbRun('Save entry', () => sb.from('journal_entries').upsert(row))
      setEntry(row)
      setEntries(p => {
        const exists = p.find(e => e.date === date)
        return exists ? p.map(e => e.date === date ? row : e) : [row, ...p]
      })
    } catch { toast('Auto-save failed', 'error') }
    finally { setSaving(false) }
  }

  function navDay(delta) {
    const d = new Date(date + 'T00:00:00')
    d.setDate(d.getDate() + delta)
    const nd = d.toISOString().slice(0, 10)
    if (nd <= today()) setDate(nd)
  }

  const isToday = date === today()

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5 max-w-[1100px]">
        <button onClick={() => navDay(-1)} className="btn btn-ghost btn-sm btn-icon">←</button>
        <div className="flex-1">
          <h1 className="page-title">Journal</h1>
          <p className="page-sub">{fmtDate(date)}</p>
        </div>
        <button onClick={() => navDay(1)} className="btn btn-ghost btn-sm btn-icon" disabled={isToday}>→</button>
        {saving && <span className="text-[11px]" style={{ color: 'var(--c-accent)' }}>saving…</span>}
      </div>

      {/* Codes for Life — always visible */}
      <div className="max-w-[1100px]">
        <CodesStrip />
      </div>

      <div className="flex gap-6 items-start max-w-[1100px]">
        {/* ── Left: mini calendar ── */}
        <div className="hidden lg:block w-[220px] flex-shrink-0 sticky top-6">
          <MiniCalendar entries={entries} selectedDate={date} onSelect={setDate} />
          {entries.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--c-faint)' }}>Recent</p>
              <div className="flex flex-col gap-1">
                {entries.slice(0, 6).map(e => (
                  <button
                    key={e.id}
                    onClick={() => setDate(e.date)}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-[7px] text-left transition-all"
                    style={{
                      background: date === e.date ? 'var(--c-accent-light)' : 'transparent',
                      color: date === e.date ? 'var(--c-accent)' : 'var(--c-muted)',
                    }}
                  >
                    <JournalEntryIcon hasEmotions={e.emotions?.length > 0} />
                    <p className="text-[11px] font-medium truncate">
                      {new Date(e.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: journal editor ── */}
        <div className="flex-1 min-w-0">

          {/* 1. How are you feeling? */}
          <Section label="Prompt 1 of 9" prompt="How am I feeling right now?">
            <div className="space-y-3">
              {Object.entries(EMOTIONS).map(([group, emotions]) => (
                <div key={group}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--c-faint)' }}>
                    {group === 'positive' ? 'Positive' : group === 'neutral' ? 'Neutral' : 'Challenging'}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {emotions.map(em => {
                      const selected = form.emotions.includes(em.id)
                      const colors = EMOTION_COLORS[group]
                      return (
                        <button
                          key={em.id}
                          onClick={() => toggleEmotion(em.id)}
                          className="px-2.5 py-1 rounded-full text-[12px] transition-all"
                          style={{
                            background: selected ? colors.bg : 'transparent',
                            color: selected ? colors.color : 'var(--c-muted)',
                            border: `1px solid ${selected ? colors.border : 'var(--c-border)'}`,
                            fontWeight: selected ? 600 : 400,
                          }}
                        >
                          {em.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              {form.emotions.length > 0 && (
                <p className="text-[11px]" style={{ color: 'var(--c-muted)' }}>
                  Feeling: {form.emotions.join(', ')}
                </p>
              )}
            </div>
          </Section>

          {/* 2. Three most important things */}
          <Section label="Prompt 2 of 9" prompt="What were the three most important things that happened today?">
            <JournalTextarea
              value={form.important_events}
              onChange={v => field('important_events', v)}
              placeholder={"1. ...\n2. ...\n3. ..."}
              rows={4}
            />
          </Section>

          {/* 3. What went well */}
          <Section label="Prompt 3 of 9" prompt="What went well today?">
            <JournalTextarea
              value={form.went_well}
              onChange={v => field('went_well', v)}
              placeholder="What are you proud of? What worked?"
              rows={3}
            />
          </Section>

          {/* 4. What was difficult */}
          <Section label="Prompt 4 of 9" prompt="What was difficult or frustrating?">
            <JournalTextarea
              value={form.difficult}
              onChange={v => field('difficult', v)}
              placeholder="What challenged you? What didn't work?"
              rows={3}
            />
          </Section>

          {/* 5. What did I learn */}
          <Section label="Prompt 5 of 9" prompt="What did I learn today?">
            <JournalTextarea
              value={form.learned}
              onChange={v => field('learned', v)}
              placeholder="A lesson, insight, or skill you picked up…"
              rows={2}
            />
          </Section>

          {/* 6. Values alignment */}
          <Section label="Prompt 6 of 9" prompt="Did I act according to my values?">
            <div className="flex flex-wrap gap-2 mb-3">
              {VALUES_OPTIONS.map(opt => (
                <button
                  key={opt}
                  onClick={() => field('values_alignment', form.values_alignment === opt ? '' : opt)}
                  className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-all"
                  style={{
                    background: form.values_alignment === opt ? 'var(--c-accent)' : 'transparent',
                    color: form.values_alignment === opt ? '#fff' : 'var(--c-muted)',
                    border: `1px solid ${form.values_alignment === opt ? 'var(--c-accent)' : 'var(--c-border)'}`,
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
            {form.values_alignment && (
              <JournalTextarea
                value={form.learned_values || ''}
                onChange={v => field('learned_values', v)}
                placeholder="Anything you'd like to reflect on?"
                rows={2}
              />
            )}
          </Section>

          {/* 7. Gratitude */}
          <Section label="Prompt 7 of 9" prompt="What am I grateful for today?">
            <div className="flex flex-wrap gap-1.5 mb-3">
              {GRATITUDE_CHIPS.map(chip => (
                <button
                  key={chip}
                  onClick={() => {
                    const cur = form.gratitude
                    const line = chip.toLowerCase()
                    const next = cur ? (cur.includes(line) ? cur : cur + '\n' + line) : line
                    field('gratitude', next)
                  }}
                  className="text-[11px] px-2.5 py-1 rounded-full transition-all"
                  style={{ background: 'var(--c-border-light)', color: 'var(--c-muted)', border: '1px solid var(--c-border)' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--c-accent)'; e.currentTarget.style.color = 'var(--c-accent)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.color = 'var(--c-muted)' }}
                >
                  {chip}
                </button>
              ))}
            </div>
            <JournalTextarea
              value={form.gratitude}
              onChange={v => field('gratitude', v)}
              placeholder="Three things you're grateful for today…"
              rows={3}
            />
          </Section>

          {/* 8. Tomorrow's priority */}
          <Section label="Prompt 8 of 9" prompt="What is the most important thing I need to do tomorrow?">
            <input
              className="w-full outline-none text-[13px] bg-transparent"
              style={{ color: 'var(--c-text)' }}
              placeholder="The single most important action for tomorrow…"
              value={form.tomorrow_priority}
              onChange={e => field('tomorrow_priority', e.target.value)}
            />
          </Section>

          {/* 9. Free-form */}
          <Section label="Prompt 9 of 9" prompt="Free-form journal entry">
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              dir="ltr"
              className="min-h-[160px] outline-none text-[14px] leading-relaxed
                         [&_h2]:font-serif [&_h2]:text-[18px] [&_h2]:mb-2 [&_h2]:mt-3
                         [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:my-2
                         [&_ol]:list-decimal [&_ol]:ml-5 [&_ol]:my-2
                         empty:before:content-[attr(data-placeholder)] empty:before:text-faint"
              style={{ color: 'var(--c-text)' }}
              data-placeholder="What else is on your mind? Write freely…"
              onInput={handleEditorInput}
            />
            <div className="flex gap-1 mt-3 pt-3" style={{ borderTop: '1px solid var(--c-border-light)' }}>
              {[['Bold','bold','B'],['Italic','italic','I'],['Bullets','insertUnorderedList','• List'],['Numbers','insertOrderedList','1. List']].map(([title, cmd, label]) => (
                <button
                  key={cmd}
                  title={title}
                  onMouseDown={e => { e.preventDefault(); document.execCommand(cmd, false, null) }}
                  className="px-2 py-1 text-[12px] rounded-[5px] transition-colors"
                  style={{ color: 'var(--c-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-border-light)'; e.currentTarget.style.color = 'var(--c-text)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--c-muted)' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </Section>

          {/* Completion message */}
          {entry && (
            <div className="text-center py-4 text-[12px]" style={{ color: 'var(--c-accent)' }}>
              ✓ Entry saved · Great job reflecting today
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ChevLeft()  { return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg> }
function ChevRight() { return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg> }
function JournalEntryIcon({ hasEmotions }) {
  return hasEmotions
    ? <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
    : <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
}
