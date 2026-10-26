import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Sun, Plus, Search, Sparkles, Timer, Moon, LogOut, MoreHorizontal, Settings, ShieldCheck } from 'lucide-react'
import { SPACES } from '../lib/spaces'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useFocus, MODES } from '../contexts/FocusContext'
import { Menu, Sheet, anyLayerOpen } from './ui'
import { fmtClock, isTypingTarget, initials } from '../lib/utils'
import CommandPalette from './CommandPalette'
import Capture from './Capture'
import CoachDrawer from './CoachDrawer'
import FocusOverlay from './FocusOverlay'
import TaskSheet from './TaskSheet'

const ShellCtx = createContext(null)
export const useShell = () => useContext(ShellCtx)

export default function Shell({ children }) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [captureMode, setCaptureMode] = useState('task')
  const [coachOpen, setCoachOpen]     = useState(false)
  const [moreOpen, setMoreOpen]       = useState(false)
  const [taskId, setTaskId]           = useState(null)
  const focus    = useFocus()
  const navigate = useNavigate()
  const location = useLocation()

  const openCapture = useCallback((mode = 'task') => { setCaptureMode(mode); setCaptureOpen(true) }, [])
  const openTask = useCallback(id => setTaskId(id), [])

  // Legacy routes → new homes
  useEffect(() => {
    const p = location.pathname
    if (p === '/pomodoro') { focus.openOverlay(); navigate('/', { replace: true }) }
    if (p === '/ai-coach') { setCoachOpen(true); navigate('/', { replace: true }) }
    if (p === '/kanban')   navigate('/tasks?view=board', { replace: true })
  }, [location.pathname])

  useEffect(() => { setMoreOpen(false) }, [location.pathname])

  useEffect(() => {
    const h = e => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(p => !p); return }
      if (mod || e.altKey || isTypingTarget(e.target) || anyLayerOpen() || paletteOpen || captureOpen) return
      const k = e.key.toLowerCase()
      if (k === 'n') { e.preventDefault(); openCapture('task') }
      else if (k === '/') { e.preventDefault(); setPaletteOpen(true) }
      else if (k === 'f') { e.preventDefault(); focus.openOverlay() }
      else if (k === 'c') { e.preventDefault(); setCoachOpen(true) }
      else {
        const sp = SPACES.find(s => s.key === e.key)
        if (sp) { e.preventDefault(); navigate(sp.to) }
      }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [paletteOpen, captureOpen, openCapture, focus.openOverlay])

  const ctx = {
    openPalette: () => setPaletteOpen(true),
    openCapture, openTask,
    openCoach: () => setCoachOpen(true),
  }

  return (
    <ShellCtx.Provider value={ctx}>
      <div className="min-h-screen flex flex-col">
        <TopBar onCoach={() => setCoachOpen(true)} />
        <main className="flex-1 w-full" style={{ paddingBottom: 'calc(var(--dock-h) + 48px + env(safe-area-inset-bottom))' }}>
          {children}
        </main>
      </div>

      <Dock
        onSearch={() => setPaletteOpen(true)}
        onCapture={() => openCapture('task')}
        onMore={() => setMoreOpen(true)}
        captureOpen={captureOpen}
      />

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)}
        onCoach={() => { setMoreOpen(false); setCoachOpen(true) }}
        onSearch={() => { setMoreOpen(false); setPaletteOpen(true) }} />

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)}
        onCapture={openCapture} onCoach={() => setCoachOpen(true)} onOpenTask={openTask} />
      <Capture open={captureOpen} mode={captureMode} setMode={setCaptureMode}
        onClose={() => setCaptureOpen(false)} onOpenTask={openTask} />
      <CoachDrawer open={coachOpen} onClose={() => setCoachOpen(false)} />
      <FocusOverlay />
      <TaskSheet id={taskId} onClose={() => setTaskId(null)} />
    </ShellCtx.Provider>
  )
}

// ── Top strip: identity, the date, coach, account ──────────────
function TopBar({ onCoach }) {
  const { user, profile, isAdmin, signOut } = useAuth()
  const { dark, toggle } = useTheme()
  const navigate = useNavigate()
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 20000); return () => clearInterval(t) }, [])

  return (
    <header className="w-full max-w-[1240px] mx-auto px-4 md:px-8 pt-4 md:pt-6 flex items-center gap-3"
      style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
      <NavLink to="/" className="font-serif text-[19px] font-semibold tracking-[-0.01em] mr-auto rounded-[6px]">
        Mad Focus
      </NavLink>
      <span className="hidden sm:inline text-[13px] text-muted tnum">
        {now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
      </span>
      <button onClick={onCoach} className="btn btn-quiet btn-sm hidden md:inline-flex" data-tip="Coach · C">
        <Sparkles size={15} /> Coach
      </button>
      <Menu
        label="Account"
        trigger={p => (
          <button {...p} aria-label="Account menu" className="rounded-full">
            <Avatar user={user} profile={profile} size={36} />
          </button>
        )}
        items={[
          { heading: user?.email },
          { label: 'Settings', icon: <Settings size={15} />, onClick: () => navigate('/settings') },
          isAdmin && { label: 'Admin console', icon: <ShieldCheck size={15} />, onClick: () => navigate('/admin') },
          { label: dark ? 'Light appearance' : 'Dark appearance', icon: dark ? <Sun size={15} /> : <Moon size={15} />, onClick: toggle },
          { divider: true },
          { label: 'Sign out', icon: <LogOut size={15} />, onClick: () => signOut() },
        ]}
      />
    </header>
  )
}

// ── Floating dock ──────────────────────────────────────────────
function Dock({ onSearch, onCapture, onMore, captureOpen }) {
  const focus = useFocus()
  const location = useLocation()
  const mobilePrimary = ['/', '/tasks', '/journal']
  const inMore = !mobilePrimary.some(p => p === '/' ? location.pathname === '/' : location.pathname.startsWith(p))

  return (
    <>
      {/* Desktop / tablet dock */}
      <nav aria-label="Spaces"
        className="hidden md:flex fixed left-1/2 -translate-x-1/2 z-[800] items-center gap-1 p-1.5 rounded-[18px] bg-surface shadow-float"
        style={{ bottom: 'calc(18px + env(safe-area-inset-bottom))', height: 'var(--dock-h)' }}>
        {SPACES.map(s => <DockLink key={s.to} space={s} />)}
        <span className="w-px h-7 bg-line mx-1.5" aria-hidden />
        <button onClick={onSearch} aria-label="Search and commands" data-tip="Search · ⌘K"
          className="dock-btn"><Search size={19} /></button>
        <FocusChip focus={focus} />
        <button onClick={onCapture} aria-label="Capture" data-tip="Capture · N" aria-expanded={captureOpen}
          className="ml-1 h-[50px] px-4 rounded-[13px] bg-accent text-accent-fg inline-flex items-center gap-2 font-semibold text-[14px]
                     transition-transform duration-150 ease-out active:scale-[0.97]">
          <Plus size={19} strokeWidth={2.4} /> <span className="hidden lg:inline">Capture</span>
        </button>
      </nav>

      {/* Mobile tab bar */}
      <nav aria-label="Spaces"
        className="md:hidden fixed inset-x-0 bottom-0 z-[800] bg-surface border-t border-line-soft"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {focus.started && (
          <button onClick={focus.openOverlay}
            className="absolute -top-11 left-1/2 -translate-x-1/2 h-9 px-3.5 rounded-full bg-live text-live-ink text-[13px] font-semibold inline-flex items-center gap-2 shadow-float tnum">
            <span className={`w-1.5 h-1.5 rounded-full bg-live-ink ${focus.running ? 'pulse-live' : ''}`} />
            {fmtClock(focus.remaining)} · {MODES[focus.mode].label}
          </button>
        )}
        <div className="grid grid-cols-5 h-[var(--dock-h)]">
          <MobileTab space={SPACES[0]} />
          <MobileTab space={SPACES[1]} />
          <div className="flex items-center justify-center">
            <button onClick={onCapture} aria-label="Capture"
              className="w-12 h-12 rounded-[15px] bg-accent text-accent-fg flex items-center justify-center active:scale-95 transition-transform">
              <Plus size={22} strokeWidth={2.4} />
            </button>
          </div>
          <MobileTab space={SPACES[4]} />
          <button onClick={onMore} className="flex flex-col items-center justify-center gap-1 text-[11px] font-medium"
            style={{ color: inMore ? 'var(--c-ink)' : 'var(--c-faint)' }}>
            <MoreHorizontal size={21} /> More
          </button>
        </div>
      </nav>
    </>
  )
}

function DockLink({ space }) {
  const Icon = space.icon
  return (
    <NavLink to={space.to} end={space.to === '/'} data-tip={`${space.label} · ${space.key}`}
      className={({ isActive }) => `relative h-[50px] rounded-[13px] inline-flex items-center gap-2 font-medium text-[14px]
        transition-colors duration-150 ${isActive ? 'bg-sunken text-ink px-3.5' : 'text-muted hover:text-ink px-3'}`}
      aria-label={space.label}>
      {({ isActive }) => (
        <>
          <Icon size={19} style={{ color: isActive ? space.hue : undefined }} />
          <span className={isActive ? 'inline' : 'hidden xl:inline'}>{space.label}</span>
        </>
      )}
    </NavLink>
  )
}

function MobileTab({ space }) {
  const Icon = space.icon
  return (
    <NavLink to={space.to} end={space.to === '/'}
      className="flex flex-col items-center justify-center gap-1 text-[11px] font-medium"
      style={({ isActive }) => ({ color: isActive ? 'var(--c-ink)' : 'var(--c-faint)' })}>
      {({ isActive }) => (<><Icon size={21} style={{ color: isActive ? space.hue : undefined }} />{space.label}</>)}
    </NavLink>
  )
}

function FocusChip({ focus }) {
  if (!focus.started) {
    return (
      <button onClick={focus.openOverlay} aria-label="Focus timer" data-tip="Focus timer · F" className="dock-btn">
        <Timer size={19} />
      </button>
    )
  }
  return (
    <button onClick={focus.openOverlay} aria-label={`Focus timer, ${fmtClock(focus.remaining)} left`}
      className="h-[50px] px-3.5 rounded-[13px] bg-live text-live-ink inline-flex items-center gap-2 font-semibold text-[14px] tnum">
      <span className={`w-2 h-2 rounded-full bg-live-ink ${focus.running ? 'pulse-live' : 'opacity-40'}`} />
      {fmtClock(focus.remaining)}
    </button>
  )
}

// ── Mobile "More" sheet ────────────────────────────────────────
function MoreSheet({ open, onClose, onCoach, onSearch }) {
  const focus = useFocus()
  const { dark, toggle } = useTheme()
  const { signOut, isAdmin } = useAuth()
  const navigate = useNavigate()
  const rest = SPACES.filter(s => !['/', '/tasks', '/journal'].includes(s.to))
  return (
    <Sheet open={open} onClose={onClose} title="More">
      <div className="grid grid-cols-2 gap-2 mb-4">
        {rest.map(s => {
          const Icon = s.icon
          return (
            <NavLink key={s.to} to={s.to} className="panel h-[72px] px-4 flex items-center gap-3 font-medium text-[15px]">
              <Icon size={20} style={{ color: s.hue }} /> {s.label}
            </NavLink>
          )
        })}
      </div>
      <div className="flex flex-col">
        <MoreRow icon={<Sparkles size={18} />} label="Coach" onClick={onCoach} />
        <MoreRow icon={<Timer size={18} />} label="Focus timer" onClick={() => { onClose(); focus.openOverlay() }} />
        <MoreRow icon={<Search size={18} />} label="Search" onClick={onSearch} />
        <MoreRow icon={dark ? <Sun size={18} /> : <Moon size={18} />} label={dark ? 'Light appearance' : 'Dark appearance'} onClick={toggle} />
        <MoreRow icon={<Settings size={18} />} label="Settings" onClick={() => navigate('/settings')} />
        {isAdmin && <MoreRow icon={<ShieldCheck size={18} />} label="Admin console" onClick={() => navigate('/admin')} />}
        <MoreRow icon={<LogOut size={18} />} label="Sign out" onClick={() => signOut()} />
      </div>
    </Sheet>
  )
}
function MoreRow({ icon, label, onClick }) {
  return (
    <button onClick={onClick} className="row row-hover text-[15px] text-left">
      <span className="text-muted">{icon}</span>{label}
    </button>
  )
}

export function Avatar({ user, profile, size = 36 }) {
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt="" width={size} height={size} className="rounded-full object-cover shadow-[0_0_0_1px_var(--c-line)]" style={{ width: size, height: size }} />
  }
  return (
    <span className="rounded-full flex items-center justify-center font-semibold bg-accent-soft text-accent"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden>
      {initials(user, profile)}
    </span>
  )
}
