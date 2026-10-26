import React, { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, AlertTriangle, Loader2, ShieldCheck, Copy, Check } from 'lucide-react'
import { sb } from '../lib/supabase'

// ── Layout for every signed-out / account screen ───────────────
export function AuthLayout({ title, lead, children, footer, embedded }) {
  return (
    <div className={embedded ? 'px-5' : 'min-h-screen flex flex-col px-5'}>
      <main className={embedded ? 'flex justify-center pt-12 md:pt-20' : 'flex-1 flex items-center justify-center py-16'}>
        <div className="w-full max-w-[400px] rise-in">
          {!embedded && <p className="font-serif text-[20px] font-semibold mb-10">Mad Focus</p>}
          <h1 className="font-serif text-[34px] leading-[1.1] font-medium tracking-[-0.015em]">{title}</h1>
          {lead && <p className="text-[15px] text-muted mt-3 mb-8 leading-relaxed">{lead}</p>}
          {!lead && <div className="mb-8" />}
          {children}
          {footer && <div className="mt-8 text-[13.5px] text-muted">{footer}</div>}
        </div>
      </main>
    </div>
  )
}

export function FormError({ children }) {
  if (!children) return null
  return (
    <p role="alert" className="flex gap-2 text-[13.5px] text-danger bg-danger-soft rounded-[10px] px-3 py-2.5">
      <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> {children}
    </p>
  )
}

export function SubmitButton({ busy, children, busyLabel, disabled, className = '' }) {
  return (
    <button type="submit" disabled={busy || disabled} className={`btn btn-primary btn-lg ${className}`}>
      {busy ? <><Loader2 size={17} className="spin" /> {busyLabel || children}</> : children}
    </button>
  )
}

// ── Passwords ──────────────────────────────────────────────────
const COMMON = ['password', '123456', 'qwerty', 'letmein', 'welcome', 'madfocus', 'iloveyou', 'admin', 'abc123', '111111']

export function passwordCheck(pw, email = '') {
  const problems = []
  if (pw.length < 10) problems.push('at least 10 characters')
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(pw)).length
  if (pw.length >= 10 && classes < 2) problems.push('a mix of letters, numbers or symbols')
  const local = email.split('@')[0]?.toLowerCase()
  if (local && local.length > 3 && pw.toLowerCase().includes(local)) problems.push('nothing from your email address')
  if (COMMON.some(c => pw.toLowerCase().includes(c))) problems.push('no common words like “password”')
  let score = Math.min(4, Math.floor(pw.length / 4) + classes - 2)
  if (problems.length) score = Math.min(score, 1)
  return { ok: problems.length === 0, problems, score: Math.max(0, score) }
}

export function PasswordInput({ id, label, value, onChange, autoComplete = 'new-password', autoFocus }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="relative">
        <input id={id} className="input h-11 pr-11" type={show ? 'text' : 'password'} autoComplete={autoComplete} autoFocus={autoFocus}
          value={value} onChange={e => onChange(e.target.value)} />
        <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-faint hover:text-ink rounded-[8px]">
          {show ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </div>
  )
}

export function NewPasswordFields({ email, value, onChange, confirm, onConfirm, autoFocus }) {
  const c = passwordCheck(value, email)
  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong']
  const colors = ['var(--c-danger)', 'var(--c-danger)', 'var(--c-warn)', 'var(--c-good)', 'var(--c-good)']
  return (
    <>
      <div>
        <PasswordInput id="new-pw" label="New password" value={value} onChange={onChange} autoFocus={autoFocus} />
        {value && (
          <div className="mt-2" aria-live="polite">
            <div className="flex gap-1">{[0, 1, 2, 3].map(i => <span key={i} className="flex-1 h-1 rounded-full" style={{ background: i < Math.max(1, c.score) ? colors[c.score] : 'var(--c-line)' }} />)}</div>
            <p className="text-[12.5px] mt-1.5" style={{ color: c.ok ? 'var(--c-muted)' : 'var(--c-danger)' }}>
              {c.ok ? labels[c.score] : `Use ${c.problems.join(', ')}.`}
            </p>
          </div>
        )}
      </div>
      <PasswordInput id="confirm-pw" label="Confirm password" value={confirm} onChange={onConfirm} />
      {confirm && value !== confirm && <p className="text-[12.5px] text-danger -mt-2">The passwords don’t match.</p>}
    </>
  )
}

// ── Two-step verification ──────────────────────────────────────
export function CodeInput({ value, onChange, autoFocus = true }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      inputMode="numeric" autoComplete="one-time-code" autoFocus={autoFocus} aria-label="6-digit code" placeholder="000000"
      className="input h-14 text-center text-[26px] font-semibold tracking-[0.4em] tnum" />
  )
}

// Ask for a code from an already-enrolled authenticator (raises session to aal2)
export function MfaChallenge({ onVerified, onCancel, cancelLabel = 'Sign out' }) {
  const [code, setCode] = useState('')
  const [factor, setFactor] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    sb.auth.mfa.listFactors().then(({ data }) => setFactor((data?.totp || []).find(f => f.status === 'verified') || null))
  }, [])

  async function submit(e) {
    e?.preventDefault()
    if (code.length !== 6 || !factor || busy) return
    setBusy(true); setError('')
    const { error: err } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
    setBusy(false)
    if (err) { setError('That code didn’t work. Check the time on your phone and try the newest code.'); setCode(''); return }
    onVerified?.()
  }

  useEffect(() => { if (code.length === 6) submit() }, [code])

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <CodeInput value={code} onChange={setCode} />
      <FormError>{error}</FormError>
      <SubmitButton busy={busy} disabled={code.length !== 6} busyLabel="Checking">Verify</SubmitButton>
      {onCancel && <button type="button" onClick={onCancel} className="btn btn-quiet">{cancelLabel}</button>}
    </form>
  )
}

// Set up an authenticator app (TOTP)
export function MfaEnroll({ onDone, onCancel }) {
  const [enroll, setEnroll] = useState(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      // Clear abandoned set-ups so enrolment doesn't fail on a duplicate name
      const { data: list } = await sb.auth.mfa.listFactors()
      for (const f of (list?.all || []).filter(f => f.status === 'unverified')) await sb.auth.mfa.unenroll({ factorId: f.id })
      const { data, error: err } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` })
      if (err) setError(err.message)
      else setEnroll(data)
    })()
  }, [])

  async function verify(e) {
    e?.preventDefault()
    if (code.length !== 6 || busy || !enroll) return
    setBusy(true); setError('')
    const { error: err } = await sb.auth.mfa.challengeAndVerify({ factorId: enroll.id, code })
    setBusy(false)
    if (err) { setError('That code didn’t work. Try the newest one from your app.'); setCode(''); return }
    onDone?.()
  }
  useEffect(() => { if (code.length === 6) verify() }, [code])

  if (!enroll) return error ? <FormError>{error}</FormError> : <div className="py-10 flex justify-center"><Loader2 className="spin text-faint" /></div>

  return (
    <form onSubmit={verify} className="flex flex-col gap-5">
      <ol className="flex flex-col gap-5 text-[14px]">
        <li>
          <p className="font-medium mb-3">1. Scan this with an authenticator app</p>
          <div className="flex items-start gap-4">
            <img src={enroll.totp.qr_code} alt="QR code for your authenticator app" className="w-[148px] h-[148px] rounded-[12px] bg-white p-2 shadow-[inset_0_0_0_1px_var(--c-line)]" />
            <div className="text-[13px] text-muted leading-relaxed">
              Google Authenticator, 1Password, Authy or Microsoft Authenticator all work.
              <p className="mt-3">Can’t scan? Enter this key:</p>
              <button type="button" onClick={() => { navigator.clipboard?.writeText(enroll.totp.secret); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                className="mt-1 inline-flex items-center gap-1.5 font-mono text-[12px] text-ink break-all text-left hover:text-accent">
                {enroll.totp.secret} {copied ? <Check size={13} className="text-good flex-shrink-0" /> : <Copy size={13} className="flex-shrink-0" />}
              </button>
            </div>
          </div>
        </li>
        <li>
          <p className="font-medium mb-3">2. Enter the 6-digit code it shows</p>
          <CodeInput value={code} onChange={setCode} autoFocus={false} />
        </li>
      </ol>
      <FormError>{error}</FormError>
      <div className="flex gap-2">
        {onCancel && <button type="button" onClick={onCancel} className="btn btn-outline btn-lg">Cancel</button>}
        <SubmitButton busy={busy} disabled={code.length !== 6} busyLabel="Checking" className="flex-1"><ShieldCheck size={17} /> Turn on two-step</SubmitButton>
      </div>
    </form>
  )
}
