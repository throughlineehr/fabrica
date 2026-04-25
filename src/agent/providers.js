// AI Provider configurations
// Each provider defines how to call its API with the AGENT_DSL prompt

export const PROVIDERS = {
  anthropic: {
    name: 'Anthropic (Claude)',
    models: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'],
    defaultModel: 'claude-sonnet-4-20250514',
    endpoint: 'https://api.anthropic.com/v1/messages',
    keyPrefix: 'sk-ant-',
    buildRequest: (messages, model, apiKey) => ({
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        system: messages[0]?.content || '',
        messages: messages.slice(1).map(m => ({ role: m.role, content: m.content })),
      }),
    }),
    parseResponse: (data) => data.content?.[0]?.text || 'No response',
  },

  openai: {
    name: 'OpenAI (GPT)',
    models: ['gpt-4o', 'gpt-4o-mini'],
    defaultModel: 'gpt-4o-mini',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    keyPrefix: 'sk-',
    buildRequest: (messages, model, apiKey) => ({
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        max_tokens: 8192,
      }),
    }),
    parseResponse: (data) => data.choices?.[0]?.message?.content || 'No response',
  },

  google: {
    name: 'Google (Gemini)',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    defaultModel: 'gemini-2.5-flash',
    keyPrefix: 'AI',
    buildRequest: (messages, model, apiKey) => ({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: messages[0]?.content || '' }] },
        contents: messages.slice(1).map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
      }),
    }),
    parseResponse: (data) => data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response',
  },

  ollama: {
    name: 'Ollama (Local/Private)',
    models: ['llama3.1', 'mistral', 'codellama', 'custom'],
    defaultModel: 'llama3.1',
    endpoint: 'http://localhost:11434',
    keyPrefix: null, // No key needed
    buildRequest: (messages, model, apiKey, endpoint) => ({
      url: `${endpoint || 'http://localhost:11434'}/v1/chat/completions`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    }),
    parseResponse: (data) => data.choices?.[0]?.message?.content || 'No response',
  },
}

export function getProviderForKey(apiKey) {
  if (!apiKey || apiKey.length < 10) return null
  // Check most specific prefixes first
  if (apiKey.startsWith('sk-ant-')) return { id: 'anthropic', ...PROVIDERS.anthropic }
  if (apiKey.startsWith('sk-')) return { id: 'openai', ...PROVIDERS.openai }
  if (apiKey.startsWith('AIza')) return { id: 'google', ...PROVIDERS.google }
  return null
}

// Manual provider selection (if auto-detect fails)
export function getProviderById(id) {
  const p = PROVIDERS[id]
  return p ? { id, ...p } : null
}

// Pure call surface for non-UI callers (e.g. processors). Resolves to the
// parsed text or throws.
export async function callProvider({ provider, apiKey, model, endpoint, messages }) {
  if (!provider) throw new Error('No provider configured')
  if (provider.id !== 'ollama' && !apiKey) throw new Error('No API key configured')
  const req = provider.buildRequest(messages, model || provider.defaultModel, apiKey, endpoint)
  const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${provider.id} ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  return provider.parseResponse(data)
}
