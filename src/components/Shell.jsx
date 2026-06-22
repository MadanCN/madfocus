import React, { useState, useEffect, useCallback } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import AIPanel from './AIPanel'
import CommandPalette from './CommandPalette'

const NAV = [
  {
    label: 'Workspace',
    items: [
      { to: '/',        icon: HomeIcon,    label: 'Home' },
      { to: '/kanban',  icon: KanbanIcon,  label: 'Kanban' },
      { to: '/tasks',   icon: TaskIcon,    label: 'Tasks' },
      { to: '/habits',  icon: ClockIcon,   label: 'Habits' },
    ],
  },
  {
    label: 'Focus',
    items: [
      { to: '/goals',    icon: TargetIcon,   label: 'Goals' },
      { to: '/journal',  icon: JournalIcon,  label: 'Journal' },
      { to: '/pomodoro', icon: TimerIcon,    label: 'Pomodoro' },
    ],
  },
  {
    label: 'Knowledge',
    items: [
      { to: '/library', icon: LibraryIcon, label: 'Library' },
    ],
  },
]

export default function Shell({ children }) {
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const [panelOpen, setPanelOpen]       = useState(() => localStorage.getItem('mf-panel') !== 'closed')
  const [cmdOpen, setCmdOpen]           = useState(false)
  const location                        = useLocation()
  const { user, signOut }              = useAuth()
  const { dark, toggle: toggleTheme }   = useTheme()

  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') { setSidebarOpen(false); setCmdOpen(false) }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setCmdOpen(p => !p) }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])

  function togglePanel() {
    setPanelOpen(p => {
      const next = !p
      localStorage.setItem('mf-panel', next ? 'open' : 'closed')
      return next
    })
  }

  const initials = user?.email ? user.email[0].toUpperCase() : '?'

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--c-bg)' }}>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[80] lg:hidden"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Left nav ─────────────────────────────── */}
      <nav
        className={`
          fixed top-0 left-0 h-screen z-[90]
          w-[210px] flex flex-col pt-6 pb-5 overflow-y-auto
          transition-transform duration-200 ease-in-out
          lg:translate-x-0 lg:sticky
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{
          background: 'var(--c-surface)',
          borderRight: '1px solid var(--c-border)',
        }}
      >
        {/* Logo + search */}
        <div className="px-4 mb-5">
          <div className="flex items-center justify-between mb-4" style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--c-border)' }}>
            <div>
              <h1 className="font-serif text-[21px] tracking-tight" style={{ color: 'var(--c-text)' }}>
                mad<span style={{ color: 'var(--c-accent)' }}>.</span>focus
              </h1>
              <p className="text-[10px] mt-0.5 font-medium tracking-wide" style={{ color: 'var(--c-faint)' }}>STAY SHARP · SHIP THINGS</p>
            </div>
            <button className="lg:hidden p-1.5 rounded-[6px]" style={{ color: 'var(--c-muted)' }} onClick={() => setSidebarOpen(false)}>
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Search / Command Palette trigger */}
          <button
            onClick={() => setCmdOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-[8px] text-[12px] transition-all"
            style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-faint)' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.background = 'var(--c-border-light)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.background = 'var(--c-bg)' }}
          >
            <SearchIcon className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="text-[9px] px-1 py-0.5 rounded" style={{ background: 'var(--c-border)', color: 'var(--c-faint)', fontFamily: 'monospace' }}>⌘K</kbd>
          </button>
        </div>

        {/* Nav groups */}
        <div className="flex-1 px-2.5 space-y-0.5">
          {NAV.map(group => (
            <div key={group.label} className="mb-3">
              <p className="text-[9.5px] font-bold tracking-[.1em] uppercase px-2.5 mb-1" style={{ color: 'var(--c-faint)' }}>
                {group.label}
              </p>
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className="flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-[7px] text-[13px] transition-all duration-100 cursor-pointer"
                  style={({ isActive }) => ({
                    background: isActive ? 'var(--c-accent-light)' : 'transparent',
                    color: isActive ? 'var(--c-accent)' : 'var(--c-muted)',
                    fontWeight: isActive ? 500 : 400,
                  })}
                  onMouseEnter={e => { if (!e.currentTarget.dataset.active) { e.currentTarget.style.background = 'var(--c-border-light)'; e.currentTarget.style.color = 'var(--c-text)' } }}
                  onMouseLeave={e => { if (!e.currentTarget.dataset.active) { e.currentTarget.style.background = ''; e.currentTarget.style.color = '' } }}
                >
                  {({ isActive }) => (
                    <>
                      <item.icon className="w-[15px] h-[15px] flex-shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {isActive && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--c-accent)' }} />}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </div>

        {/* Notes quick link */}
        <div className="px-2.5 mb-2">
          <p className="text-[9.5px] font-bold tracking-[.1em] uppercase px-2.5 mb-1" style={{ color: 'var(--c-faint)' }}>Quick Access</p>
          <NavLink to="/notes"
            className="flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-[7px] text-[13px] transition-all duration-100"
            style={({ isActive }) => ({ background: isActive ? 'var(--c-accent-light)' : 'transparent', color: isActive ? 'var(--c-accent)' : 'var(--c-muted)', fontWeight: isActive ? 500 : 400 })}
          >
            {({ isActive }) => (<><NoteIcon className="w-[15px] h-[15px] flex-shrink-0"/><span className="flex-1">Notes</span>{isActive && <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--c-accent)' }}/>}</>)}
          </NavLink>

          {/* AI Panel toggle — always visible */}
          <button
            onClick={togglePanel}
            className="flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-[7px] text-[13px] transition-all duration-100 mt-0.5"
            style={{ color: panelOpen ? 'var(--c-accent)' : 'var(--c-muted)', background: panelOpen ? 'var(--c-accent-light)' : 'transparent', fontWeight: panelOpen ? 500 : 400 }}
          >
            <SparkleIcon className="w-[15px] h-[15px] flex-shrink-0" />
            <span className="flex-1 text-left">AI Coach</span>
            <span className="text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded-full uppercase" style={{ background: panelOpen ? 'var(--c-accent-mid)' : 'var(--c-border-light)', color: panelOpen ? 'var(--c-accent)' : 'var(--c-faint)' }}>
              {panelOpen ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>

        {/* Footer */}
        <div className="px-2.5 pt-3 mx-0 space-y-0.5" style={{ borderTop: '1px solid var(--c-border)' }}>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-[7px] text-[13px] transition-all"
            style={{ color: 'var(--c-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-border-light)'; e.currentTarget.style.color = 'var(--c-text)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--c-muted)' }}
          >
            {dark ? <SunIcon className="w-[15px] h-[15px]" /> : <MoonIcon className="w-[15px] h-[15px]" />}
            <span>{dark ? 'Light mode' : 'Dark mode'}</span>
          </button>

          {user && (
            <div className="flex items-center gap-2 px-2 py-2 rounded-[7px]">
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold" style={{ background: 'var(--c-accent-mid)', color: 'var(--c-accent)' }}>
                {initials}
              </div>
              <p className="text-[11.5px] truncate flex-1" style={{ color: 'var(--c-muted)' }}>{user.email}</p>
              <button onClick={signOut} title="Sign out" className="p-1 rounded-[5px] flex-shrink-0 transition-colors" style={{ color: 'var(--c-faint)' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--c-danger)'; e.currentTarget.style.background = 'var(--c-danger-light)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--c-faint)'; e.currentTarget.style.background = 'transparent' }}>
                <SignOutIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* ── Main content ─────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">

        {/* Mobile top bar */}
        <div className="sticky top-0 z-[70] lg:hidden flex items-center gap-3 px-4 py-3"
          style={{ background: 'var(--c-surface)', borderBottom: '1px solid var(--c-border)' }}>
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-[6px]" style={{ color: 'var(--c-muted)' }}>
            <MenuIcon className="w-[18px] h-[18px]" />
          </button>
          <span className="font-serif text-[17px] flex-1" style={{ color: 'var(--c-text)' }}>
            mad<span style={{ color: 'var(--c-accent)' }}>.</span>focus
          </span>
          <button onClick={() => setCmdOpen(true)} className="p-1.5 rounded-[6px]" style={{ color: 'var(--c-muted)' }}>
            <SearchIcon className="w-[17px] h-[17px]" />
          </button>
          <button onClick={toggleTheme} className="p-1.5 rounded-[6px]" style={{ color: 'var(--c-muted)' }}>
            {dark ? <SunIcon className="w-[17px] h-[17px]" /> : <MoonIcon className="w-[17px] h-[17px]" />}
          </button>
        </div>

        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>

      {/* ── Right AI Panel ───────────────────────── */}
      {panelOpen && (
        <aside
          className="hidden xl:flex flex-col sticky top-0 h-screen w-[340px] flex-shrink-0"
          style={{ borderLeft: '1px solid var(--c-border)', background: 'var(--c-surface)' }}
        >
          <AIPanel onClose={togglePanel} />
        </aside>
      )}

      {/* Collapsed panel tab */}
      {!panelOpen && (
        <button
          onClick={togglePanel}
          className="hidden xl:flex fixed right-0 top-1/2 -translate-y-1/2 z-[60] items-center gap-1.5 py-4 px-1.5 rounded-l-[10px] text-[11px] font-semibold transition-all"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRight: 'none', color: 'var(--c-accent)', writingMode: 'vertical-lr', transform: 'translateY(-50%)' }}
        >
          <SparkleIcon className="w-3.5 h-3.5 rotate-0" style={{ writingMode: 'horizontal-tb' }} />
          AI
        </button>
      )}

      {/* Command Palette */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  )
}

// ── SVG Icons ──
function HomeIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> }
function TaskIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg> }
function ClockIcon(p)   { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> }
function KanbanIcon(p)  { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="5" height="15" rx="1"/><rect x="10" y="3" width="5" height="10" rx="1"/><rect x="17" y="3" width="5" height="12" rx="1"/></svg> }
function TargetIcon(p)  { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> }
function JournalIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> }
function SparkleIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg> }
function LibraryIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> }
function TimerIcon(p)   { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3l-1.5 2.5"/><path d="M19 3l1.5 2.5"/><path d="M9 3h6"/></svg> }
function NoteIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> }
function SearchIcon(p)  { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> }
function MenuIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg> }
function XIcon(p)       { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
function SignOutIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> }
function MoonIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> }
function SunIcon(p)     { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> }
