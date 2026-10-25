import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Check, AlertTriangle, Loader2, Star, CloudOff, MoreHorizontal } from 'lucide-react'

// ═══════════════════════════════════════════════════════════════
//  Presence — keep a layer mounted while it animates out
// ═══════════════════════════════════════════════════════════════
export function usePresence(open, exitMs = 220) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (open) {
      setMounted(true)
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(r)
    }
    setShown(false)
    const t = setTimeout(() => setMounted(false), exitMs)
    return () => clearTimeout(t)
  }, [open, exitMs])
  return [mounted, shown]
}

// ═══════════════════════════════════════════════════════════════
//  Layer stack — Escape closes only the topmost layer
// ═══════════════════════════════════════════════════════════════
const layerStack = []
export function useLayer(active, onEscape) {
  const id = useRef(Symbol('layer'))
  const escRef = useRef(onEscape)
  escRef.current = onEscape
  useEffect(() => {
    if (!active) return
    const me = id.current
    layerStack.push(me)
    const h = e => {
      if (e.key === 'Escape' && layerStack[layerStack.length - 1] === me) {
        e.stopPropagation()
        escRef.current?.()
      }
    }
    document.addEventListener('keydown', h)
    return () => {
      document.removeEventListener('keydown', h)
      const i = layerStack.indexOf(me); if (i >= 0) layerStack.splice(i, 1)
    }
  }, [active])
}
export function anyLayerOpen() { return layerStack.length > 0 }

export function useFocusReturn(active, containerRef, initialFocusRef) {
  useEffect(() => {
    if (!active) return
    const prev = document.activeElement
    const t = setTimeout(() => {
      const target = initialFocusRef?.current
        || containerRef.current?.querySelector('[data-autofocus]')
        || containerRef.current?.querySelector('input, textarea, [contenteditable="true"], button')
      target?.focus?.({ preventScroll: true })
    }, 30)
    return () => { clearTimeout(t); prev?.focus?.({ preventScroll: true }) }
  }, [active])
}

// ═══════════════════════════════════════════════════════════════
//  Toast — call toast(msg) or toast(msg, { type, action, duration })
// ═══════════════════════════════════════════════════════════════
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback(id => {
    clearTimeout(timers.current[id])
    setToasts(p => p.map(t => t.id === id ? { ...t, leaving: true } : t))
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 240)
  }, [])

  const toast = useCallback((msg, opts = {}) => {
    if (typeof opts === 'string') opts = { type: opts }
    const id = Math.random().toString(36).slice(2)
    const duration = opts.duration ?? (opts.action ? 6000 : 3200)
    setToasts(p => [...p.slice(-2), { id, msg, type: opts.type || 'default', action: opts.action, entering: true }])
    requestAnimationFrame(() => requestAnimationFrame(() =>
      setToasts(p => p.map(t => t.id === id ? { ...t, entering: false } : t))))
    timers.current[id] = setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {createPortal(
        <div className="fixed inset-x-0 z-[1200] flex flex-col items-center gap-2 pointer-events-none px-4"
          style={{ bottom: 'calc(var(--dock-h) + 28px + env(safe-area-inset-bottom))' }}
          role="status" aria-live="polite">
          {toasts.map(t => (
            <div key={t.id}
              className="toast pointer-events-auto flex items-center gap-3 pl-4 pr-2 min-h-[44px] rounded-[12px] shadow-pop max-w-[min(92vw,460px)]"
              style={{
                background: t.type === 'error' ? 'var(--c-danger)' : 'var(--c-ink)',
                color: t.type === 'error' ? '#fff' : 'var(--c-paper)',
                opacity: t.entering || t.leaving ? 0 : 1,
                transform: t.entering ? 'translateY(12px)' : t.leaving ? 'translateY(6px)' : 'none',
              }}>
              {t.type === 'error' ? <AlertTriangle size={16} className="flex-shrink-0" /> : null}
              <span className="text-[13.5px] font-medium py-2 flex-1">{t.msg}</span>
              {t.action && (
                <button className="h-8 px-3 rounded-[8px] text-[13px] font-semibold"
                  style={{ color: t.type === 'error' ? '#fff' : 'var(--c-live)' }}
                  onClick={() => { t.action.onClick(); dismiss(t.id) }}>
                  {t.action.label}
                </button>
              )}
              <button aria-label="Dismiss" onClick={() => dismiss(t.id)}
                className="w-8 h-8 flex items-center justify-center rounded-[8px] opacity-60 hover:opacity-100">
                <X size={15} />
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastCtx.Provider>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Confirm — const confirm = useConfirm(); if (await confirm({...}))
// ═══════════════════════════════════════════════════════════════
const ConfirmCtx = createContext(async () => false)
export const useConfirm = () => useContext(ConfirmCtx)

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)
  const resolver = useRef(null)

  const confirm = useCallback(opts => new Promise(resolve => {
    resolver.current = resolve
    setState({ title: 'Are you sure?', confirmLabel: 'Delete', tone: 'danger', ...opts })
  }), [])

  const close = val => { resolver.current?.(val); resolver.current = null; setState(s => s && { ...s, closing: true }) }

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <ConfirmDialog state={state} onClose={close} onGone={() => setState(null)} />
    </ConfirmCtx.Provider>
  )
}

function ConfirmDialog({ state, onClose, onGone }) {
  const open = !!state && !state.closing
  const [mounted, shown] = usePresence(open, 180)
  const ref = useRef(null)
  const cancelRef = useRef(null)
  useLayer(open, () => onClose(false))
  useFocusReturn(open, ref, cancelRef)
  useEffect(() => { if (!mounted && state?.closing) onGone() }, [mounted])
  if (!mounted || !state) return null
  const danger = state.tone === 'danger'
  return createPortal(
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
      <div className="scrim absolute inset-0" data-open={shown} onClick={() => onClose(false)} />
      <div ref={ref} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"
        className="dialog relative w-full max-w-[400px] rounded-[18px] bg-surface shadow-pop p-6" data-open={shown}>
        <div className="flex gap-3.5">
          {danger && (
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-danger-soft text-danger">
              <AlertTriangle size={18} />
            </div>
          )}
          <div className="min-w-0 pt-0.5">
            <h2 id="confirm-title" className="text-[16px] font-semibold leading-snug">{state.title}</h2>
            {state.body && <p className="text-[13.5px] text-muted mt-1.5 leading-relaxed">{state.body}</p>}
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-6">
          <button ref={cancelRef} className="btn btn-outline" onClick={() => onClose(false)}>{state.cancelLabel || 'Cancel'}</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => onClose(true)}>{state.confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ═══════════════════════════════════════════════════════════════
//  Sheet — right drawer on desktop, bottom sheet on mobile
// ═══════════════════════════════════════════════════════════════
export function Sheet({ open, onClose, title, children, footer, width = 480, headerExtra, label }) {
  const [mounted, shown] = usePresence(open, 300)
  const ref = useRef(null)
  useLayer(open, onClose)
  useFocusReturn(open, ref)
  useEffect(() => {
    if (!open) return
    const o = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = o }
  }, [open])
  if (!mounted) return null
  return createPortal(
    <div className="fixed inset-0 z-[900]">
      <div className="scrim absolute inset-0" data-open={shown} onClick={onClose} />
      <aside ref={ref} role="dialog" aria-modal="true" aria-label={label || (typeof title === 'string' ? title : 'Details')}
        className="sheet absolute bg-surface shadow-pop flex flex-col
                   inset-x-0 bottom-0 max-h-[92vh] rounded-t-[22px]
                   md:top-2 md:right-2 md:left-auto md:bottom-2 md:max-h-none md:rounded-[20px] md:w-[var(--w)] md:max-w-[calc(100vw-16px)]"
        style={{ '--w': `${width}px` }} data-open={shown}>
        <div className="flex flex-col min-h-0 h-full w-full">
          <div className="md:hidden flex justify-center pt-2.5 pb-1"><div className="w-10 h-1 rounded-full bg-line" /></div>
          <header className="flex items-center gap-2 px-5 md:px-6 pt-2 md:pt-5 pb-3">
            <div className="flex-1 min-w-0 text-[13px] text-muted">{title}</div>
            {headerExtra}
            <button aria-label="Close" onClick={onClose} className="btn btn-quiet btn-sm btn-icon"><X size={17} /></button>
          </header>
          <div className="flex-1 overflow-y-auto px-5 md:px-6 pb-6 overscroll-contain">{children}</div>
          {footer && <footer className="px-5 md:px-6 py-3 border-t border-line-soft" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>{footer}</footer>}
        </div>
      </aside>
    </div>,
    document.body
  )
}

// ═══════════════════════════════════════════════════════════════
//  Dialog — centered modal for short creation flows
// ═══════════════════════════════════════════════════════════════
export function Dialog({ open, onClose, title, children, width = 520, initialFocusRef }) {
  const [mounted, shown] = usePresence(open, 180)
  const ref = useRef(null)
  useLayer(open, onClose)
  useFocusReturn(open, ref, initialFocusRef)
  if (!mounted) return null
  return createPortal(
    <div className="fixed inset-0 z-[950] flex items-end md:items-center justify-center md:p-6">
      <div className="scrim absolute inset-0" data-open={shown} onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}
        className="dialog relative w-full bg-surface shadow-pop rounded-t-[22px] md:rounded-[20px] max-h-[92vh] flex flex-col"
        style={{ maxWidth: width }} data-open={shown}>
        <header className="flex items-center gap-2 px-6 pt-5 pb-2">
          <h2 className="flex-1 text-[17px] font-semibold">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="btn btn-quiet btn-sm btn-icon"><X size={17} /></button>
        </header>
        <div className="overflow-y-auto px-6 pb-6" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>{children}</div>
      </div>
    </div>,
    document.body
  )
}

// ═══════════════════════════════════════════════════════════════
//  Menu — small action menu anchored to a trigger
// ═══════════════════════════════════════════════════════════════
export function Menu({ items, align = 'end', label = 'More actions', trigger, placement = 'bottom' }) {
  const [open, setOpen] = useState(false)
  const [mounted, shown] = usePresence(open, 140)
  const wrap = useRef(null)
  const menuRef = useRef(null)
  const [flip, setFlip] = useState(false)
  useLayer(open, () => setOpen(false))

  useEffect(() => {
    if (!open) return
    const h = e => { if (!wrap.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', h)
    return () => document.removeEventListener('pointerdown', h)
  }, [open])

  useLayoutEffect(() => {
    if (!mounted || !menuRef.current) return
    const r = menuRef.current.getBoundingClientRect()
    setFlip(placement === 'bottom' && r.bottom > window.innerHeight - 90)
  }, [mounted])

  useEffect(() => {
    if (shown) menuRef.current?.querySelector('button')?.focus({ preventScroll: true })
  }, [shown])

  function onKey(e) {
    const btns = [...(menuRef.current?.querySelectorAll('button:not(:disabled)') || [])]
    const i = btns.indexOf(document.activeElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length]?.focus() }
    if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length]?.focus() }
  }

  const up = placement === 'top' || flip
  return (
    <div ref={wrap} className="relative inline-flex" onClick={e => e.stopPropagation()}>
      {trigger
        ? trigger({ onClick: () => setOpen(o => !o), 'aria-expanded': open, 'aria-haspopup': 'menu' })
        : <button aria-label={label} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(o => !o)}
            className="btn btn-quiet btn-sm btn-icon"><MoreHorizontal size={17} /></button>}
      {mounted && (
        <div ref={menuRef} role="menu" onKeyDown={onKey}
          className={`pop ${up ? 'pop-up' : ''} absolute z-[1000] min-w-[200px] py-1.5 rounded-[12px] bg-surface shadow-pop`}
          style={{
            [align === 'end' ? 'right' : 'left']: 0,
            ...(up ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)' }),
            transformOrigin: `${up ? 'bottom' : 'top'} ${align === 'end' ? 'right' : 'left'}`,
          }}
          data-open={shown}>
          {items.filter(Boolean).map((it, i) => it.divider
            ? <div key={i} className="my-1.5 h-px bg-line-soft" />
            : it.heading
              ? <p key={i} className="px-3 pt-1.5 pb-1 text-[11.5px] font-semibold text-faint">{it.heading}</p>
              : (
                <button key={i} role="menuitem" disabled={it.disabled}
                  onClick={() => { setOpen(false); it.onClick?.() }}
                  className="w-full flex items-center gap-2.5 px-3 h-9 text-[13.5px] text-left hover:bg-sunken focus:bg-sunken disabled:opacity-40"
                  style={{ color: it.danger ? 'var(--c-danger)' : undefined }}>
                  {it.icon && <span className="flex-shrink-0" style={{ color: it.danger ? 'var(--c-danger)' : 'var(--c-faint)' }}>{it.icon}</span>}
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.checked && <Check size={15} className="text-accent" />}
                  {it.hint && <span className="text-[11.5px] text-faint">{it.hint}</span>}
                </button>
              ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Save status — "Saving…", "Saved", "Couldn't save · Retry"
// ═══════════════════════════════════════════════════════════════
export function SaveState({ status, onRetry, className = '' }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (status === 'saved') { setVisible(true); const t = setTimeout(() => setVisible(false), 1800); return () => clearTimeout(t) }
    setVisible(status === 'saving' || status === 'pending' || status === 'error')
  }, [status])
  return (
    <span role="status" aria-live="polite"
      className={`inline-flex items-center gap-1.5 text-[12px] transition-opacity duration-200 ${className}`}
      style={{ opacity: visible ? 1 : 0, color: status === 'error' ? 'var(--c-danger)' : 'var(--c-faint)' }}>
      {status === 'error'
        ? <><CloudOff size={13} /> Couldn’t save <button className="underline font-medium" onClick={onRetry}>Retry</button></>
        : status === 'saved'
          ? <><Check size={13} /> Saved</>
          : <><Loader2 size={13} className="spin" /> Saving</>}
    </span>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Misc
// ═══════════════════════════════════════════════════════════════
export function Empty({ icon: Icon, title, body, action, compact }) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'py-8' : 'py-16'} px-6`}>
      {Icon && <div className="w-12 h-12 rounded-full bg-sunken flex items-center justify-center text-faint mb-4"><Icon size={20} /></div>}
      <p className="text-[15px] font-semibold">{title}</p>
      {body && <p className="text-[13.5px] text-muted mt-1 max-w-[360px] leading-relaxed">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Ring({ pct = 0, size = 56, stroke = 5, color = 'var(--c-accent)', track = 'var(--c-line)', children, label }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.max(0, Math.min(pct, 100)) / 100) * circ
  return (
    <div className="relative inline-flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}
      role={label ? 'img' : undefined} aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 500ms var(--ease-out)' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  )
}

export function Stars({ value = 0, onChange, size = 18 }) {
  return (
    <div className="flex gap-0.5" role={onChange ? 'radiogroup' : 'img'} aria-label={`${value || 0} of 5 stars`}>
      {[1, 2, 3, 4, 5].map(s => (
        <button key={s} type="button" disabled={!onChange} aria-label={`${s} star${s > 1 ? 's' : ''}`}
          onClick={() => onChange?.(s === value ? 0 : s)}
          className={`p-0.5 ${onChange ? 'cursor-pointer' : 'cursor-default'}`}
          style={{ color: s <= value ? 'var(--c-warn)' : 'var(--c-line)' }}>
          <Star size={size} fill="currentColor" strokeWidth={0} />
        </button>
      ))}
    </div>
  )
}

export function Check2({ checked, onChange, label, size }) {
  return (
    <button type="button" role="checkbox" aria-checked={!!checked} aria-label={label}
      onClick={e => { e.stopPropagation(); onChange?.() }}
      className={`check ${checked ? 'check-pop' : ''}`} style={size ? { width: size, height: size } : undefined}>
      <Check size={12} strokeWidth={3.2} />
    </button>
  )
}

export function Spinner({ size = 16 }) { return <Loader2 size={size} className="spin text-faint" /> }

export function PageLoader() {
  return <div className="flex items-center justify-center py-32"><Spinner size={20} /></div>
}

export function Seg({ value, onChange, options, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.icon ? <span className="inline-flex items-center gap-1.5">{o.icon}{o.label && <span className="hidden sm:inline">{o.label}</span>}</span> : o.label}
        </button>
      ))}
    </div>
  )
}
