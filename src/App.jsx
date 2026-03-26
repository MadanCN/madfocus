import React, { createContext, useContext, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Shell from './components/Shell'
import NotesOverlay from './components/Notes/NotesOverlay'
import FloatingFAB from './components/FloatingFAB'
import { ToastProvider } from './components/ui'

// Pages
import Home       from './pages/Home'
import Tasks      from './pages/Tasks'
import Habits     from './pages/Habits'
import Goals      from './pages/Goals'
import Journal    from './pages/Journal'
import Pomodoro   from './pages/Pomodoro'
import Library    from './pages/Library'
import Kanban     from './pages/Kanban'

// ── Notes overlay context (accessible from anywhere) ──
const NotesCtx = createContext(null)
export const useNotes = () => useContext(NotesCtx)

export default function App() {
  const [notesOpen, setNotesOpen] = useState(false)

  return (
    <ToastProvider>
      <NotesCtx.Provider value={{ notesOpen, setNotesOpen }}>
        <Shell>
          <Routes>
            <Route path="/"          element={<Home />} />
            <Route path="/tasks"     element={<Tasks />} />
            <Route path="/habits"    element={<Habits />} />
            <Route path="/goals"     element={<Goals />} />
            <Route path="/journal"   element={<Journal />} />
            <Route path="/pomodoro"  element={<Pomodoro />} />
            <Route path="/library/*" element={<Library />} />
            <Route path="/kanban"    element={<Kanban />} />
            <Route path="/notes"     element={<NotesOverlay standalone />} />
            <Route path="*"          element={<Navigate to="/" replace />} />
          </Routes>
        </Shell>

        {/* Floating overlay Notes (when opened via FAB) */}
        <NotesOverlay open={notesOpen} onClose={() => setNotesOpen(false)} />

        {/* Persistent floating action button */}
        <FloatingFAB notesOpen={notesOpen} setNotesOpen={setNotesOpen} />
      </NotesCtx.Provider>
    </ToastProvider>
  )
}
