import React, { useEffect, useState } from 'react'
import { ShieldCheck, ShieldOff, Download, Trash2, LogOut, Moon, Sun, KeyRound, Mail, User, Camera, Check, SlidersHorizontal } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { sb, verifyPassword } from '../lib/supabase'
import { api } from '../lib/api'
import { useAutosave } from '../lib/useAutosave'
import { Dialog, SaveState, useToast, useConfirm } from '../components/ui'
import { FormError, SubmitButton, PasswordInput, NewPasswordFields, passwordCheck, MfaEnroll, MfaChallenge } from '../components/auth'
import { EMAIL_RE } from '../lib/validate'
import { Avatar } from '../components/Shell'

export default function Settings() {
  return (
    <div className="max-w-[760px] mx-auto px-4 md:px-8 pt-8 md:pt-12">
      <header className="mb-10">
        <h1 className="h-page">Settings</h1>
        <p className="text-[14px] text-muted mt-1">Your profile, preferences, security and data. Changes save as you go.</p>
      </header>
      <div className="flex flex-col gap-12">
        <Profile />
        <Preferences />
        <Account />
        <Password />
        <TwoStep />
        <Data />
      </div>
    </div>
  )
}

function Section({ icon: Icon, title, lead, children }) {
  return (
    <section aria-labelledby={`s-${title}`}>
      <div className="flex items-start gap-3 mb-4">
        <span className="w-9 h-9 rounded-full bg-surface shadow-[inset_0_0_0_1px_var(--c-line)] flex items-center justify-center text-muted flex-shrink-0"><Icon size={17} /></span>
        <div>
          <h2 id={`s-${title}`} className="h-section">{title}</h2>
          {lead && <p className="text-[13.5px] text-muted mt-0.5">{lead}</p>}
        </div>
      </div>
      <div className="panel p-5 md:p-6">{children}</div>
    </section>
  )
}

const ACCENTS = [
  { id: 'cobalt', label: 'Cobalt', light: '#2B45E0', dark: '#8D9DFF' },
  { id: 'moss',   label: 'Moss',   light: '#2C7A4C', dark: '#62CC8F' },
  { id: 'plum',   label: 'Plum',   light: '#6E3FC7', dark: '#B691FF' },
  { id: 'rose',   label: 'Rose',   light: '#B3325D', dark: '#FF8DB0' },
  { id: 'ochre',  label: 'Ochre',  light: '#94570A', dark: '#F2B23E' },
  { id: 'teal',   label: 'Teal',   light: '#0F7380', dark: '#4FD0DA' },
]
const PRONOUNS = ['she/her', 'he/him', 'they/them']

// One autosave pipe for every profile field
function useProfileSave() {
  const { user, setProfile } = useAuth()
  const toast = useToast()
  const save = useAutosave(async (id, patch) => {
    const { error } = await sb.from('profiles').update(patch).eq('id', id)
    if (error) { toast('Couldn’t save your profile. Check the field limits and try again.', 'error'); throw error }
  }, 700)
  return { ...save, set: patch => { setProfile(x => ({ ...x, ...patch })); save.queue(user.id, patch) } }
}

function Field({ id, label, hint, count, max, children }) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <label className="label" htmlFor={id}>{label}</label>
        {max && <span className="ml-auto text-[12px] tnum" style={{ color: count > max * 0.9 ? 'var(--c-warn)' : 'var(--c-faint)' }}>{count}/{max}</span>}
      </div>
      {children}
      {hint && <p className="text-[12.5px] text-faint mt-1.5">{hint}</p>}
    </div>
  )
}

function Profile() {
  const { user, profile } = useAuth()
  const { set, status, retry } = useProfileSave()
  const p = profile || {}
  const shown = p.preferred_name || p.full_name || user.email.split('@')[0]

  return (
    <Section icon={User} title="Profile" lead="How Mad Focus greets you, and what the coach knows about you.">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <AvatarPicker set={set} />
          <div className="min-w-0 flex-1">
            <p className="font-serif text-[22px] leading-tight font-medium truncate">{shown}{p.pronouns && <span className="text-[14px] font-sans text-muted font-normal"> ({p.pronouns})</span>}</p>
            {(p.headline || p.location)
              ? <p className="text-[13.5px] text-muted mt-1 truncate">{[p.headline, p.location].filter(Boolean).join(', ')}</p>
              : <p className="text-[13.5px] text-faint mt-1">Add a headline and where you’re based.</p>}
          </div>
          <SaveState status={status} onRetry={retry} className="self-start" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="p-full" label="Full name">
            <input id="p-full" className="input" value={p.full_name || ''} maxLength={120} autoComplete="name"
              onChange={e => set({ full_name: e.target.value })} />
          </Field>
          <Field id="p-pref" label="What should we call you?" hint="Used in greetings. Leave blank to use your first name.">
            <input id="p-pref" className="input" value={p.preferred_name || ''} maxLength={60} placeholder={(p.full_name || '').split(' ')[0]}
              onChange={e => set({ preferred_name: e.target.value })} />
          </Field>
          <Field id="p-pro" label="Pronouns" hint="Optional.">
            <input id="p-pro" className="input" value={p.pronouns || ''} maxLength={40} list="pronoun-list"
              onChange={e => set({ pronouns: e.target.value })} />
            <datalist id="pronoun-list">{PRONOUNS.map(x => <option key={x} value={x} />)}</datalist>
          </Field>
          <Field id="p-loc" label="Where you’re based">
            <input id="p-loc" className="input" value={p.location || ''} maxLength={80} placeholder="Bengaluru, India"
              onChange={e => set({ location: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field id="p-head" label="Headline" count={(p.headline || '').length} max={120}>
              <input id="p-head" className="input" value={p.headline || ''} maxLength={120} placeholder="Novelist and healthtech founder"
                onChange={e => set({ headline: e.target.value })} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field id="p-bio" label="About you" count={(p.bio || '').length} max={600}
              hint="What you’re working towards and how you like to work. The coach reads this to tailor its advice. Only you can see it.">
              <textarea id="p-bio" className="input min-h-[110px]" value={p.bio || ''} maxLength={600}
                placeholder="Writing book two of a fantasy series while building a healthtech company. Best focus before noon."
                onChange={e => set({ bio: e.target.value })} />
            </Field>
          </div>
        </div>
      </div>
    </Section>
  )
}

function AvatarPicker({ set }) {
  const { user, profile } = useAuth()
  const confirm = useConfirm()
  const toast = useToast()
  const input = React.useRef(null)

  function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) return toast('Choose a PNG, JPEG or WebP image.', 'error')
    if (file.size > 15 * 1024 * 1024) return toast('That image is over 15 MB. Choose a smaller one.', 'error')
    const reader = new FileReader()
    reader.onload = ev => {
      const img = new Image()
      img.onload = () => {
        // Centre-crop to a square and shrink to 320px so it stays small
        const side = Math.min(img.width, img.height), out = 320
        const c = document.createElement('canvas'); c.width = out; c.height = out
        c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out)
        const url = c.toDataURL('image/jpeg', 0.85)
        if (url.length > 200000) return toast('That image is too detailed to use. Try another.', 'error')
        set({ avatar_url: url })
        toast('Photo updated')
      }
      img.onerror = () => toast('Couldn’t read that image.', 'error')
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  }

  async function remove() {
    const ok = await confirm({ title: 'Remove your photo?', body: 'Your initials will show instead.', confirmLabel: 'Remove photo' })
    if (ok) set({ avatar_url: null })
  }

  return (
    <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
      <button type="button" onClick={() => input.current?.click()} className="relative group rounded-full" aria-label={profile?.avatar_url ? 'Change photo' : 'Add a photo'}>
        <Avatar user={user} profile={profile} size={72} />
        <span className="absolute inset-0 rounded-full bg-black/45 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"><Camera size={20} /></span>
      </button>
      {profile?.avatar_url
        ? <button type="button" onClick={remove} className="text-[12px] text-muted hover:text-danger">Remove</button>
        : <button type="button" onClick={() => input.current?.click()} className="text-[12px] text-accent font-medium">Add photo</button>}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} onChange={pick} aria-label="Upload a photo" />
    </div>
  )
}

function Account() {
  const { user } = useAuth()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  async function changeEmail(e) {
    e.preventDefault()
    const next = email.trim().toLowerCase()
    if (!EMAIL_RE.test(next) || next === user.email || busy) return
    setBusy(true)
    const { error } = await sb.auth.updateUser({ email: next }, { emailRedirectTo: window.location.origin + '/settings' })
    setBusy(false)
    if (error) return toast(/rate/i.test(error.message) ? 'Too many requests. Try again later.' : error.message, 'error')
    setEmail('')
    toast('Check both inboxes. The change happens once you confirm from each.')
  }

  return (
    <Section icon={Mail} title="Email">
      <form onSubmit={changeEmail}>
        <p className="text-[14px] mb-3">You sign in with <span className="font-medium">{user.email}</span></p>
        <div className="flex gap-2">
          <input id="pemail" type="email" className="input" placeholder="New email address" aria-label="New email address" value={email} onChange={e => setEmail(e.target.value)} />
          <button type="submit" disabled={!EMAIL_RE.test(email.trim()) || busy} className="btn btn-outline flex-shrink-0">Change</button>
        </div>
        <p className="text-[12.5px] text-faint mt-2">We’ll send a confirmation link to both addresses.</p>
      </form>
    </Section>
  )
}

function Preferences() {
  const { profile } = useAuth()
  const { dark, toggle } = useTheme()
  const { set, status, retry } = useProfileSave()
  const p = profile || {}
  const accent = p.accent || 'cobalt'
  return (
    <Section icon={SlidersHorizontal} title="Preferences">
      <div className="flex flex-col gap-6">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <span className="label">Appearance</span>
            <div className="seg" role="group" aria-label="Appearance">
              <button aria-pressed={!dark} onClick={() => dark && toggle()}><span className="inline-flex items-center gap-1.5"><Sun size={14} /> Light</span></button>
              <button aria-pressed={dark} onClick={() => !dark && toggle()}><span className="inline-flex items-center gap-1.5"><Moon size={14} /> Dark</span></button>
            </div>
          </div>
          <SaveState status={status} onRetry={retry} />
        </div>

        <div>
          <span className="label" id="accent-label">Accent colour</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="accent-label">
            {ACCENTS.map(a => (
              <button key={a.id} role="radio" aria-checked={accent === a.id} onClick={() => set({ accent: a.id })}
                className="h-10 pl-1.5 pr-3.5 rounded-full inline-flex items-center gap-2 text-[13.5px] transition-shadow"
                style={{ boxShadow: accent === a.id ? 'inset 0 0 0 2px ' + (dark ? a.dark : a.light) : 'inset 0 0 0 1px var(--c-line)' }}>
                <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: dark ? a.dark : a.light }}>
                  {accent === a.id && <Check size={14} strokeWidth={3} color={dark ? '#0F1420' : '#fff'} />}
                </span>
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="pf-len" label="Focus session length" hint="What the timer starts at.">
            <select id="pf-len" className="input" value={p.focus_minutes || 25} onChange={e => set({ focus_minutes: +e.target.value })}>
              {[15, 20, 25, 30, 45, 50, 60, 90].map(m => <option key={m} value={m}>{m} minutes</option>)}
            </select>
          </Field>
          <Field id="pf-goal" label="Daily focus goal" hint="Shown on Today. Choose None to hide it.">
            <select id="pf-goal" className="input" value={p.daily_focus_goal ?? 120} onChange={e => set({ daily_focus_goal: +e.target.value })}>
              <option value={0}>None</option>
              {[30, 60, 90, 120, 180, 240, 300, 360, 480].map(m => <option key={m} value={m}>{m < 60 ? m + ' minutes' : (m / 60) + (m === 60 ? ' hour' : ' hours')}</option>)}
            </select>
          </Field>
          <div>
            <span className="label">Weeks start on</span>
            <div className="seg" role="group" aria-label="Weeks start on">
              <button aria-pressed={p.week_starts_monday !== false} onClick={() => set({ week_starts_monday: true })}>Monday</button>
              <button aria-pressed={p.week_starts_monday === false} onClick={() => set({ week_starts_monday: false })}>Sunday</button>
            </div>
          </div>
        </div>
      </div>
    </Section>
  )
}

function Password() {
  const { user } = useAuth()
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const check = passwordCheck(pw, user.email)

  async function submit(e) {
    e.preventDefault()
    if (!current || !check.ok || pw !== confirm || busy) return
    setBusy(true); setError('')
    if (!(await verifyPassword(user.email, current))) { setBusy(false); return setError('Your current password isn’t right.') }
    const { error: err } = await sb.auth.updateUser({ password: pw })
    setBusy(false)
    if (err) return setError(/aal2|mfa|verification/i.test(err.message) ? 'Verify with your authenticator first: sign out and back in, then try again.' : err.message)
    setCurrent(''); setPw(''); setConfirm('')
    toast('Password changed')
  }

  return (
    <Section icon={KeyRound} title="Password" lead="Use at least 10 characters. A passphrase is easiest to remember.">
      <form onSubmit={submit} className="flex flex-col gap-4 max-w-[420px]">
        <PasswordInput id="cur-pw" label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
        <NewPasswordFields email={user.email} value={pw} onChange={setPw} confirm={confirm} onConfirm={setConfirm} />
        <FormError>{error}</FormError>
        <SubmitButton busy={busy} disabled={!current || !check.ok || pw !== confirm} busyLabel="Updating" className="self-start btn-lg">Change password</SubmitButton>
      </form>
    </Section>
  )
}

function TwoStep() {
  const { isAdmin, aal, refresh } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [factors, setFactors] = useState(null)
  const [mode, setMode] = useState(null) // enroll | verify-to-disable
  const load = () => sb.auth.mfa.listFactors().then(({ data }) => setFactors((data?.totp || []).filter(f => f.status === 'verified')))
  useEffect(() => { load() }, [])

  async function disable() {
    if (isAdmin) return
    const ok = await confirm({ title: 'Turn off two-step verification?', body: 'Anyone with your password could sign in. You can turn it back on any time.', confirmLabel: 'Turn off' })
    if (!ok) return
    if (aal.currentLevel !== 'aal2') { setMode('verify-to-disable'); return }
    await doDisable()
  }
  async function doDisable() {
    for (const f of factors) {
      const { error } = await sb.auth.mfa.unenroll({ factorId: f.id })
      if (error) return toast(error.message, 'error')
    }
    setMode(null); await load(); await refresh()
    toast('Two-step verification is off')
  }

  const on = factors?.length > 0
  return (
    <Section icon={on ? ShieldCheck : ShieldOff} title="Two-step verification"
      lead={isAdmin ? 'Required for administrators.' : 'A code from your phone, on top of your password, each time you sign in.'}>
      {factors === null ? null : mode === 'enroll' ? (
        <MfaEnroll onCancel={() => setMode(null)} onDone={async () => { setMode(null); await load(); await refresh(); toast('Two-step verification is on') }} />
      ) : mode === 'verify-to-disable' ? (
        <div className="max-w-[360px]"><p className="text-[14px] text-muted mb-4">Enter a code from your app to confirm.</p>
          <MfaChallenge onVerified={async () => { await refresh(); await doDisable() }} onCancel={() => setMode(null)} cancelLabel="Cancel" /></div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 text-[14px] font-medium" style={{ color: on ? 'var(--c-good)' : 'var(--c-muted)' }}>
            {on ? <><ShieldCheck size={17} /> On, with an authenticator app</> : 'Off'}
          </span>
          {on
            ? !isAdmin && <button onClick={disable} className="btn btn-outline btn-sm ml-auto">Turn off</button>
            : <button onClick={() => setMode('enroll')} className="btn btn-primary btn-sm ml-auto">Set up</button>}
        </div>
      )}
    </Section>
  )
}

const EXPORT_TABLES = ['tasks', 'habits', 'habit_logs', 'goals', 'goal_milestones', 'journal_entries', 'notes', 'note_folders',
  'books', 'authors', 'series', 'reading_sessions', 'reading_goals', 'writing_logs', 'pomodoro_sessions']

function Data() {
  const { user, signOut } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function exportAll() {
    setExporting(true)
    try {
      const out = { exported_at: new Date().toISOString(), account: user.email }
      for (const t of EXPORT_TABLES) {
        const { data } = await sb.from(t).select('*')
        out[t] = data || []
      }
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `madfocus-export-${new Date().toISOString().slice(0, 10)}.json` })
      a.click(); URL.revokeObjectURL(a.href)
      toast('Export downloaded')
    } catch { toast('Couldn’t export your data.', 'error') }
    finally { setExporting(false) }
  }

  async function signOutAll() {
    const ok = await confirm({ title: 'Sign out everywhere?', body: 'Every device, including this one, will need to sign in again.', confirmLabel: 'Sign out everywhere', tone: 'primary' })
    if (ok) await signOut('global')
  }

  return (
    <Section icon={Download} title="Your data" lead="It’s yours. Take it with you or remove it.">
      <div className="flex flex-col divide-y divide-line-soft -my-2">
        <Row title="Export everything" body="Tasks, habits, goals, journal, notes and library as one JSON file.">
          <button onClick={exportAll} disabled={exporting} className="btn btn-outline btn-sm"><Download size={15} /> {exporting ? 'Preparing' : 'Export'}</button>
        </Row>
        <Row title="Sign out of all devices" body="Use this if you’ve lost a device or signed in somewhere shared.">
          <button onClick={signOutAll} className="btn btn-outline btn-sm"><LogOut size={15} /> Sign out all</button>
        </Row>
        <Row title="Delete account" body="Permanently deletes your account and everything in it." danger>
          <button onClick={() => setDeleting(true)} className="btn btn-sm text-danger shadow-[inset_0_0_0_1px_var(--c-danger)]"><Trash2 size={15} /> Delete</button>
        </Row>
      </div>
      <DeleteAccount open={deleting} onClose={() => setDeleting(false)} email={user.email} />
    </Section>
  )
}

function Row({ title, body, children, danger }) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-4">
      <div className="flex-1 min-w-[220px]">
        <p className="text-[14px] font-medium" style={{ color: danger ? 'var(--c-danger)' : undefined }}>{title}</p>
        <p className="text-[13px] text-muted mt-0.5">{body}</p>
      </div>
      {children}
    </div>
  )
}

function DeleteAccount({ open, onClose, email }) {
  const [password, setPassword] = useState('')
  const [typed, setTyped] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setPassword(''); setTyped(''); setError('') } }, [open])

  async function submit(e) {
    e.preventDefault()
    if (typed !== 'DELETE' || !password || busy) return
    setBusy(true); setError('')
    try {
      await api('account/delete', { body: { password } })
      await sb.auth.signOut({ scope: 'local' })
      window.location.replace('/')
    } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Delete your account?" width={460}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-[14px] text-muted leading-relaxed">This permanently deletes <span className="text-ink font-medium">{email}</span> and all of its tasks, habits, goals, journal entries, notes and books. It can’t be undone. Export your data first if you want a copy.</p>
        <PasswordInput id="del-pw" label="Your password" value={password} onChange={setPassword} autoComplete="current-password" autoFocus />
        <div>
          <label className="label" htmlFor="del-type">Type DELETE to confirm</label>
          <input id="del-type" className="input" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" />
        </div>
        <FormError>{error}</FormError>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-outline">Keep my account</button>
          <button type="submit" disabled={typed !== 'DELETE' || !password || busy} className="btn btn-danger">{busy ? 'Deleting' : 'Delete forever'}</button>
        </div>
      </form>
    </Dialog>
  )
}
