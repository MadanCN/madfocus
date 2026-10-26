import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, Ban, ShieldCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { sb } from '../lib/supabase'
import { AuthLayout, FormError, SubmitButton, NewPasswordFields, passwordCheck, MfaChallenge } from '../components/auth'
import { useToast } from '../components/ui'

// /auth/accept (invitation) and /auth/reset (forgot password)
export function SetPassword({ flow }) {
  const { user, profile, refresh, setRecovery, loading } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [name, setName] = useState('')
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const invite = flow === 'invite'
  const hashError = new URLSearchParams(window.location.hash.slice(1)).get('error_description')

  if (loading) return null
  if (!user) {
    return (
      <AuthLayout title="This link has expired" lead={hashError || 'Links work once and expire after a while. Ask for a new one and use it straight away.'}
        footer={<a href="/" className="text-accent font-medium">Go to sign in</a>} />
    )
  }

  const check = passwordCheck(pw, user.email)
  async function submit(e) {
    e.preventDefault()
    if (!check.ok || pw !== confirm || busy) return
    setBusy(true); setError('')
    const { error: err } = await sb.auth.updateUser({ password: pw, ...(invite && name.trim() ? { data: { full_name: name.trim() } } : {}) })
    if (err) {
      setBusy(false)
      setError(/same|different/i.test(err.message) ? 'Choose a password you haven’t used here before.' : /weak|pwned|leaked/i.test(err.message) ? 'That password has appeared in a data breach. Choose another.' : err.message)
      return
    }
    if (invite && name.trim()) await sb.from('profiles').update({ full_name: name.trim() }).eq('id', user.id)
    setRecovery(false)
    await refresh()
    toast(invite ? 'You’re all set. Welcome to Mad Focus.' : 'Password updated')
    navigate('/', { replace: true })
  }

  return (
    <AuthLayout title={invite ? 'Welcome to Mad Focus' : 'Choose a new password'}
      lead={invite ? `Set a password for ${user.email} and you’re in.` : `For ${user.email}. You’ll stay signed in on this device.`}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {invite && (
          <div>
            <label className="label" htmlFor="name">Your name</label>
            <input id="name" className="input h-11" autoComplete="name" autoFocus value={name} maxLength={120}
              onChange={e => setName(e.target.value)} placeholder={profile?.full_name || ''} />
          </div>
        )}
        <NewPasswordFields email={user.email} value={pw} onChange={setPw} confirm={confirm} onConfirm={setConfirm} autoFocus={!invite} />
        <FormError>{error}</FormError>
        <SubmitButton busy={busy} disabled={!check.ok || pw !== confirm} busyLabel="Saving">{invite ? 'Start using Mad Focus' : 'Save password'}</SubmitButton>
      </form>
    </AuthLayout>
  )
}

// Signed in with a password, but this account also uses an authenticator
export function MfaGate() {
  const { refresh, signOut, user } = useAuth()
  return (
    <AuthLayout title="Two-step verification" lead={`Enter the 6-digit code from your authenticator app for ${user?.email}.`}>
      <MfaChallenge onVerified={refresh} onCancel={() => signOut()} />
    </AuthLayout>
  )
}

export function AccountBlocked({ status }) {
  const { signOut, user } = useAuth()
  const pending = status === 'pending' || !status
  return (
    <AuthLayout
      title={pending ? 'Waiting for approval' : 'Account suspended'}
      lead={pending
        ? `${user?.email} doesn’t have access yet. Mad Focus is invite-only; an administrator needs to approve this account.`
        : 'This account has been suspended. Contact your administrator if you think this is a mistake.'}
      footer={<button onClick={() => signOut()} className="text-accent font-medium">Sign out</button>}>
      <div className="w-12 h-12 rounded-full bg-sunken text-muted flex items-center justify-center">{pending ? <Clock size={22} /> : <Ban size={22} />}</div>
    </AuthLayout>
  )
}

export function AdminMfaNotice() {
  return (
    <div className="flex items-center gap-2 text-[13px] text-muted"><ShieldCheck size={15} className="text-good" /> Protected by two-step verification</div>
  )
}
