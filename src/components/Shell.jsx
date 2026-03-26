import React, { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

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

  // Close sidebar on route change (mobile)
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  // Close on escape key
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') setSidebarOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[80] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <nav className={`
        fixed top-0 left-0 h-screen z-[90]
        w-[220px] bg-surface border-r border-border
        flex flex-col pt-7 pb-5 overflow-y-auto
        transition-transform duration-200 ease-in-out
        lg:translate-x-0 lg:sticky
        ${sidebarOpen ? 'translate-x-0 shadow-md' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="px-5 pb-6 border-b border-border-light mb-4 flex items-center justify-between">
          <div>
            <h1 className="font-serif text-[22px] tracking-tight">
              mad<span className="text-accent">.</span>focus
            </h1>
            <p className="text-[11px] text-faint mt-0.5">Stay sharp. Ship things.</p>
          </div>
          <button
            className="lg:hidden p-1 text-muted hover:text-text"
            onClick={() => setSidebarOpen(false)}
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Nav groups */}
        {NAV.map(group => (
          <div key={group.label} className="px-3 mb-3">
            <div className="section-label">{group.label}</div>
            {group.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 w-full px-2.5 py-2 rounded-[7px]
                   text-[13.5px] font-normal transition-all duration-150 cursor-pointer
                   ${isActive
                     ? 'bg-accent-light text-accent font-medium'
                     : 'text-muted hover:bg-bg hover:text-text'}`
                }
              >
                <item.icon className="w-[15px] h-[15px] flex-shrink-0" />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}

        {/* Notes link — pinned at bottom */}
        <div className="mt-auto px-3">
          <div className="section-label">Quick Access</div>
          <NavLink
            to="/notes"
            className={({ isActive }) =>
              `flex items-center gap-2.5 w-full px-2.5 py-2 rounded-[7px]
               text-[13.5px] font-normal transition-all duration-150 cursor-pointer
               ${isActive
                 ? 'bg-accent-light text-accent font-medium'
                 : 'text-muted hover:bg-bg hover:text-text'}`
            }
          >
            <NoteIcon className="w-[15px] h-[15px] flex-shrink-0" />
            Notes
          </NavLink>
        </div>
      </nav>

      {/* ── Main area ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-[70] lg:hidden flex items-center gap-3 px-4 py-3 bg-surface border-b border-border">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-[6px] text-muted hover:bg-bg hover:text-text transition-colors"
          >
            <MenuIcon className="w-[18px] h-[18px]" />
          </button>
          <span className="font-serif text-[17px]">mad<span className="text-accent">.</span>focus</span>
        </div>

        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}

// ── SVG Icons ──
function HomeIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> }
function TaskIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg> }
function HabitIcon(p)   { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> }
function KanbanIcon(p)  { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="5" height="15" rx="1"/><rect x="10" y="3" width="5" height="10" rx="1"/><rect x="17" y="3" width="5" height="12" rx="1"/></svg> }
function GoalIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> }
function JournalIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> }
function BookIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> }
function NoteIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> }
function MenuIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg> }
function XIcon(p)       { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
