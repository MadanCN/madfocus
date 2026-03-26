import React, { useState, useEffect, useRef, useCallback } from 'react'
import { sb, dbRun } from '../lib/supabase'
import { useToast } from '../components/ui'

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function today() { return new Date().toISOString().slice(0, 10) }
function fmtDate(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }
function ymd(y, m, d) { return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` }

const MOODS = [
  { val: 1, emoji: '😞', label: 'Rough' },
  { val: 2, emoji: '😕', label: 'Low' },
  { val: 3, emoji: '😐', label: 'Okay' },
  { val: 4, emoji: '🙂', label: 'Good' },
  { val: 5, emoji: '😄', label: 'Great' },
]

// ── Mini Calendar ──
function MiniCalendar({ entries, selectedDate, onSelect }) {
  const [viewDate, setViewDate] = useState(new Date(selectedDate + 'T00:00:00'))
  const entryDates = new Set(entries.map(e => e.date))

  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay() // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = today()

  // Adjust so Mon = 0
  const startOffset = (firstDay + 6) % 7

  function navMonth(delta) {
    setViewDate(d => {
      const nd = new Date(d)
      nd.setMonth(nd.getMonth() + delta)
      return nd
    })
  }

  const monthLabel = viewDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  // Mood color map
  const moodColors = { 1: '#c0392b', 2: '#b8860b', 3: '#8a8680', 4: '#2563eb', 5: '#2d5a3d' }

  return (
    <div className="bg-surface border border-border rounded-card p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => navMonth(-1)} className="p-1 rounded text-muted hover:text-text hover:bg-bg transition-colors">
          <ChevLeft />
        </button>
        <span className="text-[12px] font-medium text-text">{monthLabel}</span>
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
          <div key={i} className="text-center text-[9.5px] font-medium text-faint py-0.5">{d}</div>
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
          const entryMood = entries.find(e => e.date === dateStr)?.mood
          const dotColor = entryMood ? moodColors[entryMood] : '#2d5a3d'

          return (
            <button
              key={i}
              onClick={() => !isFuture && onSelect(dateStr)}
              disabled={isFuture}
              className={`relative aspect-square flex items-center justify-center rounded-[5px] text-[11px] transition-all
                ${isFuture ? 'text-faint cursor-not-allowed' : 'cursor-pointer hover:bg-bg'}
                ${isSelected ? 'bg-accent text-white font-medium' : ''}
                ${isToday && !isSelected ? 'ring-1 ring-accent text-accent font-medium' : ''}
                ${!isSelected && !isToday && !isFuture ? 'text-text' : ''}
              `}
            >
              {day}
              {hasEntry && !isSelected && (
                <span
                  className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ background: dotColor }}
                />
              )}
            </button>
          )
        })}
      </div>

      <button
        onClick={() => onSelect(todayStr)}
        className="mt-2 w-full text-[11px] text-accent hover:underline text-center"
      >
        Today
      </button>
    </div>
  )
}

export default function Journal() {
  const toast = useToast()
  const [date, setDate]       = useState(today())
  const [entry, setEntry]     = useState(null)
  const [form, setForm]       = useState({ mood: 3, content: '', highlights: '', gratitude: '' })
  const [saving, setSaving]   = useState(false)
  const [entries, setEntries] = useState([])
  const saveTimer             = useRef(null)
  const editorRef             = useRef(null)
  const lastContent           = useRef('')

  // Load all entries
  useEffect(() => {
    sb.from('journal_entries').select('*').order('date', { ascending: false })
      .then(({ data }) => setEntries(data || []))
  }, [])

  // Load entry for current date
  useEffect(() => {
    const e = entries.find(x => x.date === date)
    if (e) {
      setEntry(e)
      setForm({ mood: e.mood || 3, content: e.content || '', highlights: e.highlights || '', gratitude: e.gratitude || '' })
      lastContent.current = e.content || ''
    } else {
      setEntry(null)
      setForm({ mood: 3, content: '', highlights: '', gratitude: '' })
      lastContent.current = ''
    }
    // Sync editor DOM
    if (editorRef.current) {
      editorRef.current.innerHTML = e?.content || ''
    }
  }, [date, entries])

  // Handle editor input — fix RTL bug: never set innerHTML from state
  const handleEditorInput = useCallback(() => {
    const html = editorRef.current?.innerHTML || ''
    lastContent.current = html
    setForm(p => ({ ...p, content: html }))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persistEntry({ ...form, content: html }), 900)
  }, [form])

  function handleChange(k, v) {
    setForm(p => ({ ...p, [k]: v }))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persistEntry({ ...form, [k]: v }), 900)
  }

  async function persistEntry(data) {
    if (!data.content.trim() && !data.highlights.trim() && !data.gratitude.trim()) return
    setSaving(true)
    const row = {
      id: entry?.id || uid(), date,
      mood: data.mood, content: data.content,
      highlights: data.highlights, gratitude: data.gratitude,
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

  return (
    <div className="p-6 lg:p-9 max-w-[1100px]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navDay(-1)} className="btn btn-ghost btn-sm btn-icon">←</button>
        <div className="flex-1">
          <h1 className="page-title">Journal</h1>
          <p className="page-sub">{fmtDate(date)}</p>
        </div>
        <button onClick={() => navDay(1)} className="btn btn-ghost btn-sm btn-icon" disabled={date === today()}>→</button>
        {saving && <span className="text-[11px] text-accent">saving…</span>}
      </div>

      <div className="flex gap-6 items-start">
        {/* ── Left: mini calendar ── */}
        <div className="hidden lg:block w-[220px] flex-shrink-0 sticky top-6">
          <MiniCalendar entries={entries} selectedDate={date} onSelect={setDate} />

          {/* Recent entries list */}
          {entries.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] font-medium text-faint uppercase tracking-wide mb-2">Recent</p>
              <div className="flex flex-col gap-1">
                {entries.slice(0, 6).map(e => {
                  const mood = MOODS.find(m => m.val === e.mood)
                  return (
                    <button key={e.id} onClick={() => setDate(e.date)}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-[7px] text-left transition-all
                        ${date === e.date ? 'bg-accent-light text-accent' : 'hover:bg-bg text-muted hover:text-text'}`}>
                      <span className="text-[14px]">{mood?.emoji || '📝'}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-medium truncate">
                          {new Date(e.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: entry editor ── */}
        <div className="flex-1 min-w-0">
          {/* Mood picker */}
          <div className="bg-surface border border-border rounded-card p-4 mb-4">
            <label className="form-label mb-3">How are you feeling?</label>
            <div className="flex gap-2">
              {MOODS.map(m => (
                <button key={m.val} onClick={() => handleChange('mood', m.val)}
                  className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-[8px] border transition-all
                    ${form.mood === m.val ? 'border-accent bg-accent-light' : 'border-border hover:border-faint'}`}>
                  <span className="text-[22px]">{m.emoji}</span>
                  <span className={`text-[10px] font-medium ${form.mood === m.val ? 'text-accent' : 'text-muted'}`}>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Main entry — FIX: dir="ltr" prevents RTL cursor bug in contentEditable */}
          <div className="bg-surface border border-border rounded-card p-5 mb-4">
            <label className="form-label mb-2">Today's entry</label>
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              dir="ltr"
              className="min-h-[160px] outline-none text-[14px] leading-relaxed text-text
                         [&_h2]:font-serif [&_h2]:text-[18px] [&_h2]:mb-2 [&_h2]:mt-3
                         [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:my-2
                         [&_ol]:list-decimal [&_ol]:ml-5 [&_ol]:my-2
                         empty:before:content-[attr(data-placeholder)] empty:before:text-faint"
              data-placeholder="What happened today? What's on your mind?"
              onInput={handleEditorInput}
            />
            {/* Mini toolbar */}
            <div className="flex gap-1 mt-3 pt-3 border-t border-border-light">
              {[['Bold', 'bold', 'B'], ['Italic', 'italic', 'I'], ['Bullets', 'insertUnorderedList', '• List'], ['Numbers', 'insertOrderedList', '1. List']].map(([title, cmd, label]) => (
                <button key={cmd} title={title}
                  onMouseDown={e => { e.preventDefault(); document.execCommand(cmd, false, null) }}
                  className="px-2 py-1 text-[12px] rounded-[5px] text-muted hover:bg-border-light hover:text-text transition-colors">
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Highlights + Gratitude */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="bg-surface border border-border rounded-card p-4">
              <label className="form-label mb-2">✨ Highlights</label>
              <textarea
                className="w-full outline-none text-[13px] leading-relaxed bg-transparent resize-none min-h-[90px] placeholder:text-faint"
                placeholder="What went well? What are you proud of?"
                value={form.highlights}
                onChange={e => handleChange('highlights', e.target.value)}
              />
            </div>
            <div className="bg-surface border border-border rounded-card p-4">
              <label className="form-label mb-2">🙏 Gratitude</label>
              <textarea
                className="w-full outline-none text-[13px] leading-relaxed bg-transparent resize-none min-h-[90px] placeholder:text-faint"
                placeholder="Three things you're grateful for today…"
                value={form.gratitude}
                onChange={e => handleChange('gratitude', e.target.value)}
              />
            </div>
          </div>

          {/* Mobile: past entries */}
          <div className="lg:hidden">
            {entries.filter(e => e.date !== date).length > 0 && (
              <div>
                <h3 className="text-[11px] font-medium text-muted uppercase tracking-wide mb-3">Past entries</h3>
                <div className="flex flex-col gap-1.5">
                  {entries.filter(e => e.date !== date).slice(0, 8).map(e => {
                    const mood = MOODS.find(m => m.val === e.mood)
                    return (
                      <button key={e.id} onClick={() => setDate(e.date)}
                        className="flex items-center gap-3 bg-surface border border-border rounded-[8px] px-4 py-3 text-left hover:border-faint transition-all">
                        <span className="text-[18px]">{mood?.emoji || '📝'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium">{fmtDate(e.date)}</p>
                          {e.content && (
                            <p className="text-[11px] text-muted truncate"
                              dangerouslySetInnerHTML={{ __html: e.content.replace(/<[^>]+>/g, ' ').slice(0, 80) + '…' }} />
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ChevLeft()  { return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg> }
function ChevRight() { return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg> }
