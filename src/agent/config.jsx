import { createContext, useContext, useState, useCallback } from 'react'
import { PROVIDERS, getProviderForKey } from './providers'

const AIConfigContext = createContext({
  apiKey: '',
  provider: null,
  model: '',
  setApiKey: () => {},
  setModel: () => {},
  isConnected: false,
})

export function AIConfigProvider({ children }) {
  // Load from localStorage if available
  const [apiKey, setApiKeyState] = useState(() => {
    try { return localStorage.getItem('fabrica_ai_key') || '' } catch { return '' }
  })
  const [modelOverride, setModelOverride] = useState('')

  const provider = getProviderForKey(apiKey)
  const model = modelOverride || provider?.defaultModel || ''
  const isConnected = !!apiKey && !!provider

  const setApiKey = useCallback((key) => {
    setApiKeyState(key)
    setModelOverride('')
    try { if (key) localStorage.setItem('fabrica_ai_key', key); else localStorage.removeItem('fabrica_ai_key') } catch {}
  }, [])

  const setModel = useCallback((m) => {
    setModelOverride(m)
  }, [])

  return (
    <AIConfigContext.Provider value={{ apiKey, provider, model, setApiKey, setModel, isConnected }}>
      {children}
    </AIConfigContext.Provider>
  )
}

export function useAIConfig() {
  return useContext(AIConfigContext)
}
