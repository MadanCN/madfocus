import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
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

function ProtectedApp() {
  const { user, loading } = useAuth()

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <p className="font-serif text-[22px] font-semibold">Mad Focus</p>
      <PageLoader />
    </div>
  )

  if (!user) return <Login />

  return (
    <FocusProvider>
      <Shell>
        <Routes>
          <Route path="/"          element={<Today />} />
          <Route path="/tasks"     element={<Tasks />} />
          <Route path="/habits"    element={<Habits />} />
          <Route path="/goals"     element={<Goals />} />
          <Route path="/journal"   element={<Journal />} />
          <Route path="/library/*" element={<Library />} />
          <Route path="/notes"     element={<Notes />} />
          {/* Legacy paths are redirected inside Shell */}
          <Route path="/kanban"    element={null} />
          <Route path="/pomodoro"  element={null} />
          <Route path="/ai-coach"  element={null} />
          <Route path="*"          element={<Navigate to="/" replace />} />
        </Routes>
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
            <ProtectedApp />
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}
