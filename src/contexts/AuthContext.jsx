import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { sb } from '../lib/supabase'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [aal, setAal]         = useState({ currentLevel: null, nextLevel: null })
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)

  const load = useCallback(async u => {
    if (!u) { setProfile(null); setAal({ currentLevel: null, nextLevel: null }); return }
    const [{ data: p }, { data: level }] = await Promise.all([
      sb.from('profiles').select('*').eq('id', u.id).maybeSingle(),
      sb.auth.mfa.getAuthenticatorAssuranceLevel(),
    ])
    setProfile(p || null)
    setAal(level || { currentLevel: 'aal1', nextLevel: 'aal1' })
  }, [])

  useEffect(() => {
    let alive = true
    sb.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      await load(u).catch(() => {})
      if (alive) setLoading(false)
      if (u) sb.rpc('touch_last_seen').then(() => {}, () => {})
    })

    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      const u = session?.user ?? null
      setUser(u)
      // Defer so we don't call Supabase inside its own auth callback
      setTimeout(() => load(u).catch(() => {}), 0)
    })
    return () => { alive = false; subscription.unsubscribe() }
  }, [load])

  async function signIn(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signOut(scope = 'local') {
    await sb.auth.signOut({ scope })
    setProfile(null)
  }

  const refresh = useCallback(async () => {
    const { data: { user: u } } = await sb.auth.getUser()
    setUser(u)
    await load(u)
  }, [load])

  const needsMfa = aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2'
  const isAdmin = profile?.role === 'admin' && profile?.status === 'active'

  return (
    <AuthContext.Provider value={{ user, profile, aal, loading, recovery, needsMfa, isAdmin, signIn, signOut, refresh, setRecovery, setProfile }}>
      {children}
    </AuthContext.Provider>
  )
}
