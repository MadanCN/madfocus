import { useEffect, useRef } from 'react'

// Tiny app-wide event bus so a capture made from anywhere (command palette,
// quick capture, AI coach) refreshes whichever page is open.
const listeners = new Map()

export function emit(event, payload) {
  ;(listeners.get(event) || []).forEach(fn => fn(payload))
}

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set())
  listeners.get(event).add(fn)
  return () => listeners.get(event)?.delete(fn)
}

export function useBus(event, handler) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => on(event, p => ref.current(p)), [event])
}
