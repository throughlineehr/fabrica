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
        max_tokens: 1024,
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
        max_tokens: 1024,
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
}

export function getProviderForKey(apiKey) {
  if (!apiKey) return null
  for (const [id, provider] of Object.entries(PROVIDERS)) {
    if (apiKey.startsWith(provider.keyPrefix)) return { id, ...provider }
  }
  return null
}
