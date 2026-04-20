import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react'
import en from './en'
import es from './es'
import fr from './fr'
import it from './it'
import ar from './ar'
import ja from './ja'
import zh from './zh'
import hi from './hi'
import id from './id'

const translations = { en, es, fr, it, ar, ja, zh, hi, id }

export const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳' },
  { code: 'id', label: 'Bahasa Indonesia', flag: '🇮🇩' },
]

const I18nContext = createContext({
  lang: 'en',
  setLang: () => {},
  t: (key) => key,
  dir: 'ltr',
})

function resolve(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj)
}

export function I18nProvider({ children }) {
  const [lang, setLang] = useState('en')

  const strings = translations[lang] || en
  const dir = strings._meta?.dir || 'ltr'

  const t = useCallback((key) => {
    return resolve(strings, key) ?? resolve(en, key) ?? key
  }, [strings])

  // Keep <html lang> in sync
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang, dir])

  const value = useMemo(() => ({ lang, setLang, t, dir }), [lang, t, dir])

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  )
}

export function useTranslation() {
  return useContext(I18nContext)
}
