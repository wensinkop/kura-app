// Language selection state (Session 13). Mirrors ThemeContext: the choice lives
// in localStorage for an instant, per-device load. (Cross-device sync via a
// profiles.language column is a planned follow-up — wired here when it lands.)

import { createContext, useContext, useEffect, useState } from 'react'
import i18n, { loadLanguage, LANGUAGE_CODES, STORAGE_KEY } from './i18n'

const LanguageContext = createContext({})

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const s = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    return LANGUAGE_CODES.includes(s) ? s : 'en'
  })

  // Keep React state in sync if i18n changes the language by another path.
  useEffect(() => {
    const onChange = (lng) => setLang(lng)
    i18n.on('languageChanged', onChange)
    return () => i18n.off('languageChanged', onChange)
  }, [])

  async function setLanguage(code) {
    if (!LANGUAGE_CODES.includes(code)) return
    try { localStorage.setItem(STORAGE_KEY, code) } catch { /* private mode */ }
    await loadLanguage(code)
    setLang(code)
  }

  return (
    <LanguageContext.Provider value={{ lang, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its provider
export function useLanguage() {
  return useContext(LanguageContext)
}
