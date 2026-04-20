import { createContext, useContext, useState, useCallback } from 'react'

const AccessibilityContext = createContext({
  epilepsy: false,
  toggleEpilepsy: () => {},
  fontVisibility: 0,
  setFontVisibility: () => {},
  dyslexia: false,
  toggleDyslexia: () => {},
})

export function AccessibilityProvider({ children }) {
  const [epilepsy, setEpilepsy] = useState(false)
  const [fontVisibility, setFontVisibility] = useState(0) // 0 = normal, 1 = max
  const [dyslexia, setDyslexia] = useState(false)
  const toggleEpilepsy = useCallback(() => setEpilepsy(p => !p), [])
  const toggleDyslexia = useCallback(() => setDyslexia(p => !p), [])

  return (
    <AccessibilityContext.Provider value={{
      epilepsy, toggleEpilepsy,
      fontVisibility, setFontVisibility,
      dyslexia, toggleDyslexia,
    }}>
      {children}
    </AccessibilityContext.Provider>
  )
}

export function useAccessibility() {
  return useContext(AccessibilityContext)
}
