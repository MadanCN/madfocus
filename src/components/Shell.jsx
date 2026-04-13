import React, { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

const NAV = [
  {
    label: 'Workspace',
    items: [
      { to: '/',        icon: HomeIcon,    label: 'Home' },
      { to: '/kanban',  icon: KanbanIcon,  label: 'Kanban' },
      { to: '/tasks',   icon: TaskIcon,    label: 'Tasks' },
      { to: '/habits',  icon: HabitIcon,   label: 'Habits' },
    ],
  },
  {
    label: 'Focus',
    items: [
      { to: '/goals',   icon: GoalIcon,    label: 'Goals' },
      { to: '/journal', icon: JournalIcon, label: 'Journal' },
    ],
  },
  {
    label: 'Knowledge',
    items: [
      { to: '/library', icon: BookIcon,    label: 'Library' },
    ],
  },
]

export default function Shell({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const { user, signOut } = useAuth()
  const { dark, toggle: toggleTheme } = useTheme()

  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') setSidebarOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const initials = user?.email ? user.email[0].toUpperCase() : '?'

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--c-bg)' }}>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[80] lg:hidden"
          style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <nav
        className={`
          fixed top-0 left-0 h-screen z-[90]
          w-[220px] flex flex-col pt-7 pb-5 overflow-y-auto
          transition-transform duration-200 ease-in-out
          lg:translate-x-0 lg:sticky
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{
          background: 'var(--c-surface)',
          borderRight: '1px solid var(--c-border)',
          boxShadow: sidebarOpen ? '4px 0 24px rgba(0,0,0,0.12)' : 'none',
        }}
      >
        {/* Logo */}
        <div
          className="px-5 pb-5 mb-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--c-border-light)' }}
        >
          <div>
            <h1 className="font-serif text-[22px] tracking-tight" style={{ color: 'var(--c-text)' }}>
              mad<span style={{ color: 'var(--c-accent)' }}>.</span>focus
            </h1>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--c-faint)' }}>Stay sharp. Ship things.</p>
          </div>
          <button
            className="lg:hidden p-1.5 rounded-[6px] transition-colors"
            style={{ color: 'var(--c-muted)' }}
            onClick={() => setSidebarOpen(false)}
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Nav groups */}
        <div className="flex-1 px-3 space-y-1">
          {NAV.map(group => (
            <div key={group.label} className="mb-3">
              <div
                className="text-[10px] font-bold tracking-[.09em] uppercase px-2.5 mb-1.5"
                style={{ color: 'var(--c-faint)' }}
              >
                {group.label}
              </div>
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className="flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-[7px] text-[13.5px] transition-all duration-150 cursor-pointer group"
                  style={({ isActive }) => ({
                    background: isActive ? 'var(--c-accent-light)' : 'transparent',
                    color: isActive ? 'var(--c-accent)' : 'var(--c-muted)',
                    fontWeight: isActive ? 500 : 400,
                  })}
                >
                  {({ isActive }) => (
                    <>
                      <item.icon className="w-[15px] h-[15px] flex-shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {isActive && (
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: 'var(--c-accent)' }}
                        />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </div>

        {/* Notes quick access */}
        <div className="px-3 mb-2">
          <div
            className="text-[10px] font-bold tracking-[.09em] uppercase px-2.5 mb-1.5"
            style={{ color: 'var(--c-faint)' }}
          >
            Quick Access
          </div>
          <NavLink
            to="/notes"
            className="flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-[7px] text-[13.5px] transition-all duration-150 cursor-pointer"
            style={({ isActive }) => ({
              background: isActive ? 'var(--c-accent-light)' : 'transparent',
              color: isActive ? 'var(--c-accent)' : 'var(--c-muted)',
              fontWeight: isActive ? 500 : 400,
            })}
          >
            {({ isActive }) => (
              <>
                <NoteIcon className="w-[15px] h-[15px] flex-shrink-0" />
                <span className="flex-1">Notes</span>
                {isActive && (
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: 'var(--c-accent)' }}
                  />
                )}
              </>
            )}
          </NavLink>
        </div>

        {/* Theme toggle + user footer */}
        <div
          className="px-3 pt-3 mx-0 space-y-1"
          style={{ borderTop: '1px solid var(--c-border-light)' }}
        >
          {/* Dark mode toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-[7px] text-[13px] transition-all duration-150"
            style={{ color: 'var(--c-muted)' }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--c-border-light)'
              e.currentTarget.style.color = 'var(--c-text)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--c-muted)'
            }}
          >
            {dark ? <SunIcon className="w-[15px] h-[15px] flex-shrink-0" /> : <MoonIcon className="w-[15px] h-[15px] flex-shrink-0" />}
            <span>{dark ? 'Light mode' : 'Dark mode'}</span>
          </button>

          {/* User row */}
          {user && (
            <div className="flex items-center gap-2 px-2 py-2 rounded-[7px]">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-semibold uppercase"
                style={{ background: 'var(--c-accent-light)', color: 'var(--c-accent)' }}
              >
                {initials}
              </div>
              <p className="text-[11.5px] truncate flex-1" style={{ color: 'var(--c-muted)' }}>
                {user.email}
              </p>
              <button
                onClick={signOut}
                title="Sign out"
                className="p-1 rounded-[5px] flex-shrink-0 transition-colors"
                style={{ color: 'var(--c-faint)' }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = 'var(--c-danger)'
                  e.currentTarget.style.background = 'var(--c-danger-light)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = 'var(--c-faint)'
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <SignOutIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* ── Main area ── */}
      <div className="flex-1 min-w-0 flex flex-col">

        {/* Mobile top bar */}
        <div
          className="sticky top-0 z-[70] lg:hidden flex items-center gap-3 px-4 py-3"
          style={{
            background: 'var(--c-surface)',
            borderBottom: '1px solid var(--c-border)',
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-[6px] transition-colors"
            style={{ color: 'var(--c-muted)' }}
          >
            <MenuIcon className="w-[18px] h-[18px]" />
          </button>
          <span className="font-serif text-[17px] flex-1" style={{ color: 'var(--c-text)' }}>
            mad<span style={{ color: 'var(--c-accent)' }}>.</span>focus
          </span>
          {/* Theme toggle on mobile bar */}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-[6px] transition-colors"
            style={{ color: 'var(--c-muted)' }}
          >
            {dark ? <SunIcon className="w-[17px] h-[17px]" /> : <MoonIcon className="w-[17px] h-[17px]" />}
          </button>
        </div>

        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}

// ── SVG Icons ──
function HomeIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> }
function TaskIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg> }
function HabitIcon(p)   { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> }
function KanbanIcon(p)  { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="5" height="15" rx="1"/><rect x="10" y="3" width="5" height="10" rx="1"/><rect x="17" y="3" width="5" height="12" rx="1"/></svg> }
function GoalIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> }
function JournalIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> }
function BookIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> }
function NoteIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> }
function MenuIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg> }
function XIcon(p)       { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
function SignOutIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> }
function MoonIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> }
function SunIcon(p)     { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> }
