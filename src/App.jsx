import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Shell from './components/Shell'
import { ToastProvider, ConfirmProvider, PageLoader } from './components/ui'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { FocusProvider } from './contexts/FocusContext'

import Today   from './pages/Today'
import Tasks   from './pages/Tasks'
import Habits  from './pages/Habits'
import Goals   from './pages/Goals'
import Journal from './pages/Journal'
import Library from './pages/Library'
import Notes   from './pages/Notes'
import Login   from './pages/Login'
import { SetPassword, MfaGate, AccountBlocked } from './pages/AuthScreens'

const Settings = lazy(() => import('./pages/Settings'))
const Admin    = lazy(() => import('./pages/Admin'))

function Gate() {
  const { user, profile, loading, needsMfa, recovery } = useAuth()
  const { pathname } = useLocation()

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <p className="font-serif text-[22px] font-semibold">Mad Focus</p>
      <PageLoader />
    </div>
  )

  // Links from emails land here with a one-time session in the URL
  if (pathname.startsWith('/auth/accept')) return <SetPassword flow="invite" />
  if (pathname.startsWith('/auth/reset') || recovery) return <SetPassword flow="recovery" />

  if (!user) return <Login />
  if (needsMfa) return <MfaGate />
  if (!profile || profile.status !== 'active') return <AccountBlocked status={profile?.status} />

  return (
    <FocusProvider>
      <Shell>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/"          element={<Today />} />
            <Route path="/tasks"     element={<Tasks />} />
            <Route path="/habits"    element={<Habits />} />
            <Route path="/goals"     element={<Goals />} />
            <Route path="/journal"   element={<Journal />} />
            <Route path="/library/*" element={<Library />} />
            <Route path="/notes"     element={<Notes />} />
            <Route path="/settings"  element={<Settings />} />
            <Route path="/admin"     element={<Admin />} />
            {/* Legacy paths are redirected inside Shell */}
            <Route path="/kanban"    element={null} />
            <Route path="/pomodoro"  element={null} />
            <Route path="/ai-coach"  element={null} />
            <Route path="*"          element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Shell>
    </FocusProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <Gate />
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}
