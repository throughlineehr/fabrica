import { createContext, useContext, useState, useCallback } from 'react'
import { PROVIDERS, getProviderForKey, getProviderById } from './providers'

const AIConfigContext = createContext({
  apiKey: '',
  provider: null,
  model: '',
  setApiKey: () => {},
  setModel: () => {},
  isConnected: false,
})

export function AIConfigProvider({ children }) {
  const [apiKey, setApiKeyState] = useState(() => {
    try { return localStorage.getItem('fabrica_ai_key') || '' } catch { return '' }
  })
  const [endpoint, setEndpointState] = useState(() => {
    try { return localStorage.getItem('fabrica_ai_endpoint') || '' } catch { return '' }
  })
  const [modelOverride, setModelOverride] = useState('')
  const [providerOverride, setProviderOverride] = useState(() => {
    try { return localStorage.getItem('fabrica_ai_provider') || '' } catch { return '' }
  })

  const provider = providerOverride ? getProviderById(providerOverride) : getProviderForKey(apiKey)
  const model = modelOverride || provider?.defaultModel || ''
  // Ollama doesn't need an API key
  const isConnected = provider?.id === 'ollama' ? !!provider : (!!apiKey && !!provider)

  const setProvider = useCallback((id) => {
    setProviderOverride(id)
    setModelOverride('')
    try { if (id) localStorage.setItem('fabrica_ai_provider', id); else localStorage.removeItem('fabrica_ai_provider') } catch {}
  }, [])

  const setEndpoint = useCallback((url) => {
    setEndpointState(url)
    try { if (url) localStorage.setItem('fabrica_ai_endpoint', url); else localStorage.removeItem('fabrica_ai_endpoint') } catch {}
  }, [])

  const setApiKey = useCallback((key) => {
    setApiKeyState(key)
    setModelOverride('')
    setProviderOverride('')
    try { if (key) localStorage.setItem('fabrica_ai_key', key); else localStorage.removeItem('fabrica_ai_key') } catch {}
  }, [])

  const setModel = useCallback((m) => {
    setModelOverride(m)
  }, [])

  return (
    <AIConfigContext.Provider value={{ apiKey, provider, model, endpoint, setApiKey, setProvider, setModel, setEndpoint, isConnected }}>
      {children}
    </AIConfigContext.Provider>
  )
}

export function useAIConfig() {
  return useContext(AIConfigContext)
}
