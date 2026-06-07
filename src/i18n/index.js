// Internationalisation (Session 13). react-i18next with English as the base /
// fallback language and the others lazy-loaded on demand, so we can grow to many
// languages without bloating the main bundle.
//
// English ships in the main bundle (it's the fallback every other language falls
// back to for any missing key). Every other locale is a separate chunk pulled in
// the first time it's selected. Number / date / currency formatting is handled
// elsewhere by Intl (lib/currencies, lib/format) — this layer is just text.

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'

// Active languages shown in the switcher. We launch with English + Indonesian
// only and add more after launch (maintaining 6 locales while the app is still
// changing was too much churn). The ms/th/vi/fil drafts and their loaders below
// are kept on disk — re-add an entry here to re-enable one. `beta` flags an
// AI draft awaiting native review (none active right now).
export const LANGUAGES = [
  { code: 'en', label: 'English', beta: false },
  { code: 'id', label: 'Bahasa Indonesia', beta: false },
]
export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code)
export const STORAGE_KEY = 'kura-lang'

// Lazy loaders for the non-bundled locales (Vite turns each into its own chunk).
const loaders = {
  id: () => import('./locales/id.json'),
  ms: () => import('./locales/ms.json'),
  th: () => import('./locales/th.json'),
  vi: () => import('./locales/vi.json'),
  fil: () => import('./locales/fil.json'),
}

function savedLang() {
  if (typeof window === 'undefined') return 'en'
  const s = localStorage.getItem(STORAGE_KEY)
  return LANGUAGE_CODES.includes(s) ? s : 'en'
}

const initial = savedLang()

i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: initial,
  fallbackLng: 'en',
  supportedLngs: LANGUAGE_CODES,
  interpolation: { escapeValue: false }, // React already escapes
  returnEmptyString: false, // empty string → fall back to English
})

// Ensure a locale's strings are loaded, then switch to it. Safe to call with any
// code; 'en' is always present, unknown codes fall back to English.
export async function loadLanguage(code) {
  const lng = LANGUAGE_CODES.includes(code) ? code : 'en'
  if (lng !== 'en' && !i18n.hasResourceBundle(lng, 'translation') && loaders[lng]) {
    try {
      const mod = await loaders[lng]()
      i18n.addResourceBundle(lng, 'translation', mod.default ?? mod, true, true)
    } catch { /* keep English fallback if the chunk fails to load */ }
  }
  await i18n.changeLanguage(lng)
}

// Kick off loading the saved non-English locale at startup (English renders
// immediately as the fallback, then the chosen language swaps in).
if (initial !== 'en') loadLanguage(initial)

export default i18n
