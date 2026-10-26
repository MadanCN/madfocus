import React, { useEffect, useState } from 'react'
import { ShieldCheck, ShieldOff, Download, Trash2, LogOut, Moon, Sun, KeyRound, Mail, User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { sb, verifyPassword } from '../lib/supabase'
import { api } from '../lib/api'
import { useAutosave } from '../lib/useAutosave'
import { Dialog, SaveState, useToast, useConfirm } from '../components/ui'
import { FormError, SubmitButton, PasswordInput, NewPasswordFields, passwordCheck, MfaEnroll, MfaChallenge } from '../components/auth'
import { EMAIL_RE } from '../lib/validate'

export default function Settings() {
  return (
    <div className="max-w-[760px] mx-auto px-4 md:px-8 pt-8 md:pt-12">
      <header className="mb-10">
        <h1 className="h-page">Settings</h1>
        <p className="text-[14px] text-muted mt-1">Your account, security and data.</p>
      </header>
      <div className="flex flex-col gap-12">
        <Profile />
        <Password />
        <TwoStep />
        <Appearance />
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

function Profile() {
  const { user, profile, setProfile } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(profile?.full_name || '')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const { queue, status, retry } = useAutosave((id, p) => sb.from('profiles').update(p).eq('id', id).then(r => { if (r.error) throw r.error }), 700)

  async function changeEmail(e) {
    e.preventDefault()
    const next = email.trim().toLowerCase()
    if (!EMAIL_RE.test(next) || next === user.email || busy) return
    setBusy(true)
    const { error } = await sb.auth.updateUser({ email: next }, { emailRedirectTo: `${window.location.origin}/settings` })
    setBusy(false)
    if (error) return toast(/rate/i.test(error.message) ? 'Too many requests. Try again later.' : error.message, 'error')
    setEmail('')
    toast('Check both inboxes. The change happens once you confirm from each.')
  }

  return (
    <Section icon={User} title="Profile">
      <div className="flex flex-col gap-5">
        <div>
          <div className="flex items-baseline"><label className="label" htmlFor="pname">Name</label><SaveState status={status} onRetry={retry} className="ml-auto" /></div>
          <input id="pname" className="input" value={name} maxLength={120} placeholder="Your name"
            onChange={e => { setName(e.target.value); setProfile(p => ({ ...p, full_name: e.target.value })); queue(user.id, { full_name: e.target.value }) }} />
        </div>
        <form onSubmit={changeEmail}>
          <label className="label" htmlFor="pemail">Email</label>
          <p className="text-[14px] mb-2">{user.email}</p>
          <div className="flex gap-2">
            <input id="pemail" type="email" className="input" placeholder="New email address" value={email} onChange={e => setEmail(e.target.value)} />
            <button type="submit" disabled={!EMAIL_RE.test(email.trim()) || busy} className="btn btn-outline flex-shrink-0"><Mail size={15} /> Change</button>
          </div>
          <p className="text-[12.5px] text-faint mt-2">We’ll send a confirmation link to both addresses.</p>
        </form>
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

function Appearance() {
  const { dark, toggle } = useTheme()
  return (
    <Section icon={dark ? Moon : Sun} title="Appearance">
      <div className="seg" role="group" aria-label="Appearance">
        <button aria-pressed={!dark} onClick={() => dark && toggle()}><span className="inline-flex items-center gap-1.5"><Sun size={14} /> Light</span></button>
        <button aria-pressed={dark} onClick={() => !dark && toggle()}><span className="inline-flex items-center gap-1.5"><Moon size={14} /> Dark</span></button>
      </div>
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
