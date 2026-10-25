import { today, addDays, ymd } from './utils'

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// Natural-language task capture.
//   "Send deck to Ravi tomorrow p1 #apollo"  → { title, due, priority, project }
// Recognises: today/tod, tomorrow/tmr, mon…sun (next occurrence), "next week",
// "in 3 days", "25 oct" / "oct 25", p1–p4 or !1–!4, #project (single word).
export function parseTask(input) {
  let text = ` ${input} `
  const found = []
  let due = null, priority = null, project = null

  const take = (re, fn) => {
    const m = text.match(re)
    if (m) { fn(m); found.push(m[0].trim()); text = text.replace(m[0], ' ') }
  }

  take(/\s(?:p|!)([1-4])(?=\s)/i, m => { priority = `P${m[1]}` })
  take(/\s#([\p{L}\p{N}_-]+)(?=\s)/u, m => { project = m[1] })

  take(/\s(today|tod|tonight)(?=\s)/i, () => { due = today() })
  if (!due) take(/\s(tomorrow|tmr|tmrw)(?=\s)/i, () => { due = addDays(today(), 1) })
  if (!due) take(/\snext week(?=\s)/i, () => {
    const d = new Date(); const toMon = ((8 - d.getDay()) % 7) || 7; d.setDate(d.getDate() + toMon); due = ymd(d)
  })
  if (!due) take(/\sin (\d{1,3}) days?(?=\s)/i, m => { due = addDays(today(), +m[1]) })
  if (!due) take(/\s(?:on |next )?(monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun)(?=\s)/i, m => {
    const idx = WEEKDAYS.indexOf(m[1].slice(0, 3).toLowerCase())
    const d = new Date(); let diff = (idx - d.getDay() + 7) % 7; if (diff === 0) diff = 7
    d.setDate(d.getDate() + diff); due = ymd(d)
  })
  if (!due) take(/\s(\d{1,2})\s?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?=\s)/i, m => { due = monthDay(+m[1], m[2]) })
  if (!due) take(/\s(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s?(\d{1,2})(?=\s)/i, m => { due = monthDay(+m[2], m[1]) })

  const title = text.replace(/\s+/g, ' ').trim()
  return { title, due, priority, project, tokens: found }
}

function monthDay(day, mon) {
  const m = MONTHS.indexOf(mon.slice(0, 3).toLowerCase())
  const now = new Date()
  let d = new Date(now.getFullYear(), m, day)
  if (ymd(d) < today()) d = new Date(now.getFullYear() + 1, m, day)
  return ymd(d)
}
