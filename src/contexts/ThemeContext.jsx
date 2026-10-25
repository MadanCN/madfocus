import React, { createContext, useContext, useState, useEffect } from 'react'

const ThemeCtx = createContext(null)
export const useTheme = () => useContext(ThemeCtx)

function initial() {
  try {
    const saved = localStorage.getItem('mf-theme')
    if (saved) return saved === 'dark'
  } catch {}
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(initial)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', dark ? '#0F1420' : '#EEF0F3'))
  }, [dark])

  function toggle() {
    setDark(d => {
      try { localStorage.setItem('mf-theme', !d ? 'dark' : 'light') } catch {}
      return !d
    })
  }

  return <ThemeCtx.Provider value={{ dark, toggle }}>{children}</ThemeCtx.Provider>
}
