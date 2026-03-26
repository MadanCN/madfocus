import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { signIn }              = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [showPwd, setShowPwd]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err.message || 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-[18px] shadow-md w-full max-w-[380px] overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-9 pb-6 text-center border-b border-border-light">
          <h1 className="font-serif text-[30px] tracking-tight mb-1">
            mad<span className="text-accent">.</span>focus
          </h1>
          <p className="text-[13px] text-muted">Stay sharp. Ship things.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-7 space-y-4">
          <div>
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
            />
          </div>

          <div>
            <label className="form-label">Password</label>
            <div className="relative">
              <input
                className="form-input pr-10"
                type={showPwd ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPwd(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted transition-colors"
                tabIndex={-1}
              >
                {showPwd ? <EyeOffIcon className="w-4 h-4"/> : <EyeIcon className="w-4 h-4"/>}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-[12px] text-danger bg-danger-light px-3 py-2.5 rounded-[8px] flex items-center gap-2">
              <WarnIcon className="w-3.5 h-3.5 flex-shrink-0"/>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary w-full py-2.5 mt-1"
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

function EyeIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> }
function EyeOffIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg> }
function WarnIcon(p)   { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> }
