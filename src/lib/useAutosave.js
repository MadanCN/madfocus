import { useCallback, useEffect, useRef, useState } from 'react'

// Debounced, patch-merging autosave.
//
//   const { queue, flush, status } = useAutosave(async (key, patch) => {...}, 700)
//   queue(task.id, { title: 'New title' })
//
// • Patches for the same key merge, so a quick title edit followed by a notes
//   edit both land (the old per-field timers cancelled each other).
// • flush() writes immediately — call it before closing a sheet or switching.
// • Pending work is flushed on unmount and when the tab is hidden/closed.
export function useAutosave(save, delay = 700) {
  const pending = useRef(new Map())
  const timer = useRef(null)
  const saveRef = useRef(save)
  saveRef.current = save
  const [status, setStatus] = useState('idle') // idle | pending | saving | saved | error
  const inflight = useRef(0)

  const run = useCallback(async () => {
    clearTimeout(timer.current)
    if (pending.current.size === 0) return
    const batch = [...pending.current.entries()]
    pending.current.clear()
    inflight.current++
    setStatus('saving')
    let failed = false
    for (const [key, patch] of batch) {
      try { await saveRef.current(key, patch) }
      catch (e) {
        failed = true
        // Put it back so the next edit (or retry) carries it
        pending.current.set(key, { ...patch, ...(pending.current.get(key) || {}) })
      }
    }
    inflight.current--
    if (inflight.current === 0) setStatus(failed ? 'error' : pending.current.size ? 'pending' : 'saved')
  }, [])

  const queue = useCallback((key, patch) => {
    pending.current.set(key, { ...(pending.current.get(key) || {}), ...patch })
    setStatus('pending')
    clearTimeout(timer.current)
    timer.current = setTimeout(run, delay)
  }, [delay, run])

  const flush = useCallback(() => run(), [run])

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') run() }
    const onUnload = () => run()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('beforeunload', onUnload)
      run()
    }
  }, [run])

  return { queue, flush, status, retry: run }
}
