import React, { createContext, useContext, useState, useEffect } from 'react'

const ThemeCtx = createContext(null)
export const useTheme = () => useContext(ThemeCtx)

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false
    const saved = localStorage.getItem('mf-theme')
    if (saved) return saved === 'dark'
    return true // dark by default
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('mf-theme', dark ? 'dark' : 'light')
  }, [dark])

  return (
    <ThemeCtx.Provider value={{ dark, toggle: () => setDark(d => !d) }}>
      {children}
    </ThemeCtx.Provider>
  )
}
