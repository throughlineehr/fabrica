// Verify settings/preferences commands go through the agent.

import { describe, it, expect, beforeEach } from 'vitest'
import { createAgentAPI } from '../agent/commands'
import { createModel } from '../tree/model'

function makeHarness(overrides = {}) {
  let model = createModel('management')
  const accessibilityCalls = []
  const languageCalls = []
  const aiConfigCalls = []
  const announcements = []
  const api = createAgentAPI({
    getModel: () => model,
    setModel: (next) => { model = typeof next === 'function' ? next(model) : next },
    getProcessors: () => ({}),
    setProcessors: () => {},
    getNavState: () => ({}),
    navigate: {},
    panels: { open: () => {}, close: () => {} },
    filters: { set: () => {} },
    accessibility: 'accessibility' in overrides ? overrides.accessibility : {
      toggleEpilepsy: () => accessibilityCalls.push('epilepsy'),
      toggleDyslexia: () => accessibilityCalls.push('dyslexia'),
      toggleColorBlind: () => accessibilityCalls.push('colorBlind'),
      setFontVisibility: (v) => accessibilityCalls.push(['fontVisibility', v]),
    },
    language: 'language' in overrides ? overrides.language : {
      set: (code) => languageCalls.push(code),
    },
    aiConfig: 'aiConfig' in overrides ? overrides.aiConfig : {
      setProvider: (v) => aiConfigCalls.push(['provider', v]),
      setModel: (v) => aiConfigCalls.push(['model', v]),
      setEndpoint: (v) => aiConfigCalls.push(['endpoint', v]),
      setApiKey: (v) => aiConfigCalls.push(['apiKey', v]),
    },
    announce: (msg) => announcements.push(msg),
  })
  return { api, accessibilityCalls, languageCalls, aiConfigCalls, announcements }
}

describe('agent settings commands', () => {
  let h
  beforeEach(() => { h = makeHarness() })

  it('setLanguage forwards to the language runtime', () => {
    const r = h.api.setLanguage('es')
    expect(r.ok).toBe(true)
    expect(r.language).toBe('es')
    expect(h.languageCalls).toEqual(['es'])
  })

  it('setLanguage errors when language runtime is missing', () => {
    const h2 = makeHarness({ language: undefined })
    const r = h2.api.setLanguage('fr')
    expect(r.ok).toBe(false)
  })

  it('toggleAccessibility dispatches to the right toggle', () => {
    h.api.toggleAccessibility('epilepsy')
    h.api.toggleAccessibility('dyslexia')
    h.api.toggleAccessibility('colorBlind')
    expect(h.accessibilityCalls).toEqual(['epilepsy', 'dyslexia', 'colorBlind'])
  })

  it('toggleAccessibility rejects unknown modes', () => {
    const r = h.api.toggleAccessibility('bogus')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/Unknown mode/)
  })

  it('setFontVisibility clamps to [0, 1]', () => {
    h.api.setFontVisibility(0.5)
    h.api.setFontVisibility(-0.5)
    h.api.setFontVisibility(1.5)
    expect(h.accessibilityCalls).toEqual([
      ['fontVisibility', 0.5],
      ['fontVisibility', 0],
      ['fontVisibility', 1],
    ])
  })

  it('setAIConfig patches only provided keys', () => {
    h.api.setAIConfig({ provider: 'openai', apiKey: 'sk-123' })
    expect(h.aiConfigCalls).toEqual([
      ['provider', 'openai'],
      ['apiKey', 'sk-123'],
    ])
    // Not touched
    expect(h.aiConfigCalls.some(([k]) => k === 'model' || k === 'endpoint')).toBe(false)
  })

  it('setAIConfig errors when runtime missing', () => {
    const h2 = makeHarness({ aiConfig: undefined })
    const r = h2.api.setAIConfig({ provider: 'x' })
    expect(r.ok).toBe(false)
  })
})
