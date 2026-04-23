import { createContext, useContext, useState, useCallback, useEffect } from 'react'

const AccessibilityContext = createContext({
  epilepsy: false,
  toggleEpilepsy: () => {},
  fontVisibility: 0,
  setFontVisibility: () => {},
  dyslexia: false,
  toggleDyslexia: () => {},
  colorBlind: false,
  toggleColorBlind: () => {},
})

export function AccessibilityProvider({ children }) {
  // Default epilepsy mode from OS preference
  const [userEpilepsyChoice, setUserEpilepsyChoice] = useState(null) // null = no explicit choice
  const [osReducedMotion, setOsReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [fontVisibility, setFontVisibility] = useState(0)
  const [dyslexia, setDyslexia] = useState(false)
  const [colorBlind, setColorBlind] = useState(false)

  // Listen to OS prefers-reduced-motion changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e) => setOsReducedMotion(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // User choice overrides OS preference
  const epilepsy = userEpilepsyChoice !== null ? userEpilepsyChoice : osReducedMotion
  const toggleEpilepsy = useCallback(() => setUserEpilepsyChoice(p => {
    const current = p !== null ? p : osReducedMotion
    return !current
  }), [osReducedMotion])

  const toggleDyslexia = useCallback(() => setDyslexia(p => !p), [])
  const toggleColorBlind = useCallback(() => setColorBlind(p => !p), [])

  return (
    <AccessibilityContext.Provider value={{
      epilepsy, toggleEpilepsy,
      fontVisibility, setFontVisibility,
      dyslexia, toggleDyslexia,
      colorBlind, toggleColorBlind,
    }}>
      {children}
    </AccessibilityContext.Provider>
  )
}

export function useAccessibility() {
  return useContext(AccessibilityContext)
}
