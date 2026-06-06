import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { useAuth } from './AuthContext'

const ThemeContext = createContext({})
const STORAGE_KEY = 'kura-theme'

function initialTheme() {
  if (typeof window === 'undefined') return 'light'
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'dark' || saved === 'light') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// Must be rendered INSIDE AuthProvider so it can follow the signed-in user's
// saved theme across devices and persist changes back to their profile.
export function ThemeProvider({ children }) {
  const { profile, updateProfile, user } = useAuth()
  const [theme, setTheme] = useState(initialTheme)

  // Apply the theme to <html> and remember it locally on every change.
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    localStorage.setItem(STORAGE_KEY, theme)
    // Native: match the status-bar icon colour to the theme so the clock/battery
    // icons stay legible over our header. Style.Dark = light icons (for our dark
    // UI), Style.Light = dark icons (for our light UI). Icon colour only — this
    // does not change insets or the keyboard resize behaviour. No-op on web.
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light }).catch(() => {})
    }
  }, [theme])

  // When a profile loads (login / cross-device), adopt its saved theme.
  const lastProfileTheme = useRef(null)
  useEffect(() => {
    const t = profile?.theme
    if ((t === 'dark' || t === 'light') && t !== lastProfileTheme.current) {
      lastProfileTheme.current = t
      setTheme(t)
    }
  }, [profile?.theme])

  // Change theme locally and, if signed in, persist to the DB.
  function applyTheme(next) {
    setTheme(next)
    lastProfileTheme.current = next
    if (user) updateProfile({ theme: next })
  }

  function toggleTheme() {
    applyTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme: applyTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its provider
export function useTheme() {
  return useContext(ThemeContext)
}
