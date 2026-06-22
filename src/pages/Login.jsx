import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'

// Floating orb positions (deterministic, not random)
const ORBS = [
  { w: 280, h: 280, top: '5%',  left: '10%', delay: '0s',   dur: '8s'  },
  { w: 200, h: 200, top: '60%', left: '75%', delay: '2s',   dur: '11s' },
  { w: 160, h: 160, top: '40%', left: '5%',  delay: '4s',   dur: '9s'  },
  { w: 120, h: 120, top: '15%', left: '65%', delay: '1s',   dur: '13s' },
  { w: 100, h: 100, top: '75%', left: '30%', delay: '3s',   dur: '10s' },
]

export default function Login() {
  const { signIn }              = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [showPwd, setShowPwd]   = useState(false)
  const [mounted, setMounted]   = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(t)
  }, [])

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
    <div
      className="min-h-screen flex items-center justify-center p-4 overflow-hidden"
      style={{ background: 'var(--c-bg)', position: 'relative' }}
    >
      {/* Animated orbs */}
      {ORBS.map((orb, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: orb.w,
            height: orb.h,
            top: orb.top,
            left: orb.left,
            borderRadius: '50%',
            background: i % 2 === 0
              ? 'radial-gradient(circle, color-mix(in srgb, var(--c-accent) 18%, transparent), transparent 70%)'
              : 'radial-gradient(circle, color-mix(in srgb, var(--c-accent-mid) 12%, transparent), transparent 70%)',
            animation: `orb-float ${orb.dur} ease-in-out infinite`,
            animationDelay: orb.delay,
            pointerEvents: 'none',
            filter: 'blur(1px)',
          }}
        />
      ))}

      {/* Subtle grid overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(var(--c-border-light) 1px, transparent 1px),
            linear-gradient(90deg, var(--c-border-light) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          opacity: 0.35,
          pointerEvents: 'none',
        }}
      />

      {/* Login card */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 420,
          background: 'var(--c-surface)',
          border: '1px solid var(--c-border)',
          borderRadius: 24,
          boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
          overflow: 'hidden',
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.97)',
          transition: 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {/* Accent bar at top */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, var(--c-accent), var(--c-accent-mid), var(--c-accent))', backgroundSize: '200% 100%', animation: 'shimmer 3s linear infinite' }} />

        {/* Header */}
        <div
          className="px-8 pt-9 pb-7 text-center"
          style={{ borderBottom: '1px solid var(--c-border-light)' }}
        >
          <div
            className="w-14 h-14 rounded-[18px] flex items-center justify-center mx-auto mb-5"
            style={{
              background: 'var(--c-accent-light)',
              border: '1px solid var(--c-accent-mid)',
              animation: 'logo-pulse 4s ease-in-out infinite',
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--c-accent)" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
            </svg>
          </div>
          <h1 className="font-serif leading-none mb-2" style={{ fontSize: 36, color: 'var(--c-text)' }}>
            mad<span style={{ color: 'var(--c-accent)' }}>.</span>focus
          </h1>
          <p style={{ fontSize: 13, color: 'var(--c-muted)', letterSpacing: '0.03em' }}>Stay sharp. Ship things.</p>
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
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: 'var(--c-faint)' }}
                tabIndex={-1}
              >
                {showPwd ? <EyeOffIcon className="w-4 h-4"/> : <EyeIcon className="w-4 h-4"/>}
              </button>
            </div>
          </div>

          {error && (
            <div
              className="text-[12.5px] px-3 py-2.5 rounded-[8px] flex items-center gap-2"
              style={{ background: 'var(--c-danger-light)', color: 'var(--c-danger)' }}
            >
              <WarnIcon className="w-3.5 h-3.5 flex-shrink-0"/>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary w-full py-2.5 mt-1"
            style={{ fontSize: 14 }}
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center gap-2 justify-center">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin inline-block" />
                Signing in…
              </span>
            ) : 'Sign in'}
          </button>
        </form>

        {/* Footer */}
        <div
          className="px-8 pb-6 text-center"
          style={{ borderTop: '1px solid var(--c-border-light)', paddingTop: 16 }}
        >
          <p style={{ fontSize: 11.5, color: 'var(--c-faint)' }}>
            Your intelligent productivity workspace
          </p>
        </div>
      </div>
    </div>
  )
}

function EyeIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> }
function EyeOffIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg> }
function WarnIcon(p)   { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> }
