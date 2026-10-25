import React, { useState } from 'react'
import { Eye, EyeOff, AlertTriangle, Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError(''); setBusy(true)
    try { await signIn(email.trim(), password) }
    catch (err) {
      setError(/invalid/i.test(err?.message || '') ? 'That email and password don’t match. Check both and try again.' : 'Couldn’t sign in. Check your connection and try again.')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col px-5">
      <main className="flex-1 flex items-center justify-center py-16">
        <div className="w-full max-w-[380px] rise-in">
          <h1 className="font-serif text-[44px] leading-none font-semibold tracking-[-0.02em]">Mad Focus</h1>
          <p className="text-[15px] text-muted mt-3 mb-10">Sign in to pick up where you left off.</p>

          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" className="input h-11" type="email" autoComplete="email" autoFocus required
                value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <input id="password" className="input h-11 pr-11" type={show ? 'text' : 'password'} autoComplete="current-password" required
                  value={password} onChange={e => setPassword(e.target.value)} />
                <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-faint hover:text-ink rounded-[8px]">
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            {error && (
              <p role="alert" className="flex gap-2 text-[13.5px] text-danger bg-danger-soft rounded-[10px] px-3 py-2.5">
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> {error}
              </p>
            )}
            <button type="submit" disabled={busy || !email || !password} className="btn btn-primary btn-lg mt-2">
              {busy ? <><Loader2 size={17} className="spin" /> Signing in</> : 'Sign in'}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
