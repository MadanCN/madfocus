import React, { useState } from 'react'
import { MailCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { AuthLayout, FormError, SubmitButton, PasswordInput } from '../components/auth'
import { api } from '../lib/api'

export default function Login() {
  const [mode, setMode] = useState('signin') // signin | forgot | sent
  const [email, setEmail] = useState('')

  if (mode === 'forgot') return <Forgot email={email} setEmail={setEmail} onBack={() => setMode('signin')} onSent={() => setMode('sent')} />
  if (mode === 'sent') {
    return (
      <AuthLayout title="Check your email" lead={`If ${email} has an account, a link to reset the password is on its way. It works once and expires in an hour.`}
        footer={<button onClick={() => setMode('signin')} className="text-accent font-medium">Back to sign in</button>}>
        <div className="w-12 h-12 rounded-full bg-accent-soft text-accent flex items-center justify-center"><MailCheck size={22} /></div>
      </AuthLayout>
    )
  }
  return <SignIn email={email} setEmail={setEmail} onForgot={() => setMode('forgot')} />
}

function SignIn({ email, setEmail, onForgot }) {
  const { signIn } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError(''); setBusy(true)
    try { await signIn(email.trim(), password) }
    catch (err) {
      const m = err?.message || ''
      setError(/invalid/i.test(m) ? 'That email and password don’t match. Check both and try again.'
        : /banned|suspend/i.test(m) ? 'This account has been suspended. Contact your administrator.'
        : /rate|too many/i.test(m) ? 'Too many attempts. Wait a few minutes and try again.'
        : /confirm/i.test(m) ? 'Confirm your email address first. Check your inbox for the link.'
        : 'Couldn’t sign in. Check your connection and try again.')
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Welcome back" lead="Sign in to pick up where you left off."
      footer="Mad Focus is invite-only. Ask your administrator for an invitation.">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" className="input h-11" type="email" autoComplete="username" autoFocus required
            value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div>
          <PasswordInput id="password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
          <button type="button" onClick={onForgot} className="text-[13px] text-accent font-medium mt-2">Forgot password?</button>
        </div>
        <FormError>{error}</FormError>
        <SubmitButton busy={busy} disabled={!email || !password} busyLabel="Signing in" className="mt-1">Sign in</SubmitButton>
      </form>
    </AuthLayout>
  )
}

function Forgot({ email, setEmail, onBack, onSent }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true); setError('')
    try { await api('auth/reset', { body: { email: email.trim() } }); onSent() }
    catch (err) { setError(err.status === 429 ? 'Too many requests. Wait 15 minutes and try again.' : 'Couldn’t send the email. Try again.') }
    finally { setBusy(false) }
  }
  return (
    <AuthLayout title="Reset your password" lead="Enter the email you sign in with. We’ll send a link to choose a new password."
      footer={<button onClick={onBack} className="text-accent font-medium">Back to sign in</button>}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div>
          <label className="label" htmlFor="femail">Email</label>
          <input id="femail" className="input h-11" type="email" autoComplete="username" autoFocus value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <FormError>{error}</FormError>
        <SubmitButton busy={busy} disabled={!email.trim()} busyLabel="Sending">Send reset link</SubmitButton>
      </form>
    </AuthLayout>
  )
}
