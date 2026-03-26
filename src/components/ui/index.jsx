import React, { createContext, useContext, useState, useCallback } from 'react'

// ── Toast ──────────────────────────────────────────────────────
const ToastCtx = createContext(null)
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const toast = useCallback((msg, type = 'success') => {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 2800)
  }, [])
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="fixed bottom-6 right-6 z-[999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id}
            className={`px-4 py-2.5 rounded-[8px] text-[13px] font-medium shadow-md
              text-white pointer-events-auto
              ${t.type === 'error' ? 'bg-danger' : t.type === 'warn' ? 'bg-warn' : 'bg-[#1a1916]'}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

// ── Modal ──────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, width = 'max-w-lg' }) {
  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[200]" onClick={onClose} />
      <div className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[201]
                       bg-surface rounded-[14px] shadow-md w-[96vw] ${width}
                       max-h-[92vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-7 pt-6 pb-4 border-b border-border-light">
          <h2 className="font-serif text-[20px]">{title}</h2>
          <button onClick={onClose} className="text-faint hover:text-text transition-colors text-[18px]">✕</button>
        </div>
        <div className="px-7 py-5">{children}</div>
      </div>
    </>
  )
}

// ── Confirm dialog ─────────────────────────────────────────────
export function Confirm({ open, title, body, okLabel = 'Delete', onOk, onCancel }) {
  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[300]" onClick={onCancel} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[301]
                      bg-surface rounded-[12px] shadow-md w-[360px] max-w-[94vw] p-6">
        <div className="flex items-center gap-2 font-semibold text-[15px] mb-2">
          <WarnIcon className="w-4 h-4 text-danger flex-shrink-0" />
          {title}
        </div>
        <p className="text-[13px] text-muted leading-relaxed mb-5">{body}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="btn btn-ghost btn-sm">Cancel</button>
          <button onClick={onOk}     className="btn btn-danger btn-sm">{okLabel}</button>
        </div>
      </div>
    </>
  )
}

// ── Empty state ────────────────────────────────────────────────
export function Empty({ icon, title, sub, action }) {
  return (
    <div className="text-center py-16 text-faint">
      <div className="opacity-25 mb-3 flex justify-center">{icon}</div>
      <p className="text-[15px] text-muted mb-1">{title}</p>
      {sub    && <p className="text-[13px] mb-4">{sub}</p>}
      {action && <div className="flex justify-center">{action}</div>}
    </div>
  )
}

// ── Progress ring ──────────────────────────────────────────────
export function Ring({ pct = 0, size = 56, stroke = 5, color = '#2d5a3d', children }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.min(pct, 100) / 100) * circ
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e8e5e0" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset .4s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  )
}

// ── Star rating ────────────────────────────────────────────────
export function Stars({ value = 0, onChange, size = 'md' }) {
  const sz = size === 'sm' ? 'text-[14px]' : 'text-[22px]'
  return (
    <div className={`flex gap-1 ${sz}`}>
      {[1,2,3,4,5].map(s => (
        <button key={s} onClick={() => onChange?.(s)}
          className={`transition-colors ${s <= value ? 'text-[#f0a500]' : 'text-faint'} ${onChange ? 'hover:text-[#f0a500] cursor-pointer' : ''}`}>
          ★
        </button>
      ))}
    </div>
  )
}

// ── Icons ──────────────────────────────────────────────────────
export function WarnIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> }
export function PlusIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> }
export function EditIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> }
export function TrashIcon(p){ return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg> }
export function CheckIcon(p){ return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg> }
