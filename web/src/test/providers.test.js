import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { callProvider, getProviderById, getProviderForKey } from '../agent/providers'

describe('callProvider', () => {
  let originalFetch
  beforeEach(() => {
    originalFetch = globalThis.fetch
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  function mockFetch(responseShape, ok = true, status = 200) {
    globalThis.fetch = vi.fn(async () => ({
      ok,
      status,
      json: async () => responseShape,
      text: async () => JSON.stringify(responseShape),
    }))
  }

  it('throws when provider is missing', async () => {
    await expect(callProvider({ provider: null, apiKey: 'x', messages: [] }))
      .rejects.toThrow(/no provider/i)
  })

  it('throws when apiKey is missing for non-Ollama providers', async () => {
    const provider = getProviderById('anthropic')
    await expect(callProvider({ provider, apiKey: '', messages: [] }))
      .rejects.toThrow(/api key/i)
  })

  it('does not require an apiKey for Ollama', async () => {
    mockFetch({ choices: [{ message: { content: 'hello' } }] })
    const provider = getProviderById('ollama')
    const out = await callProvider({ provider, apiKey: '', model: 'llama3.1', messages: [{ role: 'user', content: 'hi' }] })
    expect(out).toBe('hello')
  })

  it('builds Anthropic request and parses response', async () => {
    mockFetch({ content: [{ text: 'claude-says' }] })
    const provider = getProviderById('anthropic')
    const out = await callProvider({
      provider, apiKey: 'sk-ant-test', model: 'claude-sonnet-4-20250514',
      messages: [
        { role: 'system', content: 'be concise' },
        { role: 'user', content: 'hello' },
      ],
    })
    expect(out).toBe('claude-says')
    const call = globalThis.fetch.mock.calls[0]
    expect(call[0]).toBe('https://api.anthropic.com/v1/messages')
    expect(call[1].headers['x-api-key']).toBe('sk-ant-test')
    const body = JSON.parse(call[1].body)
    expect(body.system).toBe('be concise')
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }])
  })

  it('builds OpenAI request and parses response', async () => {
    mockFetch({ choices: [{ message: { content: 'gpt-says' } }] })
    const provider = getProviderById('openai')
    const out = await callProvider({
      provider, apiKey: 'sk-test', model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(out).toBe('gpt-says')
    const call = globalThis.fetch.mock.calls[0]
    expect(call[0]).toBe('https://api.openai.com/v1/chat/completions')
    expect(call[1].headers.Authorization).toBe('Bearer sk-test')
  })

  it('builds Google request and parses response', async () => {
    mockFetch({ candidates: [{ content: { parts: [{ text: 'gemini-says' }] } }] })
    const provider = getProviderById('google')
    const out = await callProvider({
      provider, apiKey: 'AIzaTest', model: 'gemini-2.5-flash',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'q' },
      ],
    })
    expect(out).toBe('gemini-says')
    const call = globalThis.fetch.mock.calls[0]
    expect(call[0]).toContain('gemini-2.5-flash:generateContent')
    expect(call[0]).toContain('key=AIzaTest')
  })

  it('uses provider.defaultModel when model is omitted', async () => {
    mockFetch({ content: [{ text: 'ok' }] })
    const provider = getProviderById('anthropic')
    await callProvider({ provider, apiKey: 'sk-ant-x', messages: [{ role: 'user', content: 'hi' }] })
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(body.model).toBe(provider.defaultModel)
  })

  it('throws on non-OK HTTP status with provider id + status in message', async () => {
    mockFetch({ error: 'rate limited' }, false, 429)
    const provider = getProviderById('anthropic')
    await expect(callProvider({ provider, apiKey: 'sk-ant-x', messages: [{ role: 'user', content: 'hi' }] }))
      .rejects.toThrow(/anthropic 429/)
  })

  it('truncates large error bodies to 200 chars', async () => {
    const longBody = 'x'.repeat(500)
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => longBody,
      json: async () => ({}),
    }))
    const provider = getProviderById('anthropic')
    await expect(callProvider({ provider, apiKey: 'sk-ant-x', messages: [{ role: 'user', content: 'hi' }] }))
      .rejects.toThrow(/x{200}/)
  })
})

describe('provider resolution', () => {
  it('getProviderForKey returns null for missing key', () => {
    expect(getProviderForKey('')).toBeNull()
    expect(getProviderForKey('short')).toBeNull()
  })

  it('getProviderForKey identifies Anthropic', () => {
    expect(getProviderForKey('sk-ant-test123456789')?.id).toBe('anthropic')
  })

  it('getProviderForKey identifies OpenAI', () => {
    expect(getProviderForKey('sk-test123456789')?.id).toBe('openai')
  })

  it('getProviderForKey identifies Google', () => {
    expect(getProviderForKey('AIzaTest123456789')?.id).toBe('google')
  })

  it('getProviderById returns provider with id', () => {
    expect(getProviderById('ollama')?.id).toBe('ollama')
    expect(getProviderById('nonexistent')).toBeNull()
  })
})
