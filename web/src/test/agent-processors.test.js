// End-to-end tests for processor commands through the agent API.
// This is the chokepoint: if these pass, the UI can mutate processors
// via agentAPI.* and an audit log / undo / websocket relay will see the
// same events.

import { describe, it, expect, beforeEach } from 'vitest'
import { createAgentAPI } from '../agent/commands'
import { defaultFilters } from '../signals/filter'
import { createModel } from '../tree/model'

function makeHarness() {
  // Minimal harness — same contract as App.jsx but without React.
  let model = createModel('management')
  let processors = {}
  let announcements = []
  const api = createAgentAPI({
    getModel: () => model,
    setModel: (next) => { model = typeof next === 'function' ? next(model) : next },
    getProcessors: () => processors,
    setProcessors: (next) => { processors = typeof next === 'function' ? next(processors) : next },
    getNavState: () => ({}),
    navigate: { openProcessor: () => {} },
    panels: { open: () => {}, close: () => {} },
    filters: { set: () => {} },
    announce: (msg) => announcements.push(msg),
  })
  return { api, getModel: () => model, getProcessors: () => processors, announcements }
}

describe('agent processor commands', () => {
  let h
  beforeEach(() => { h = makeHarness() })

  it('addProcessor rejects unknown defId', () => {
    const r = h.api.addProcessor(h.getModel().rootId, 's3', 'bogus')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/Unknown/)
  })

  it('addProcessor creates an instance with default filters', () => {
    const r = h.api.addProcessor(h.getModel().rootId, 's3', 'heartbeat')
    expect(r.ok).toBe(true)
    expect(r.instanceId).toBeTypeOf('string')
    const key = `${h.getModel().rootId}:s3`
    const list = h.getProcessors()[key]
    expect(list).toHaveLength(1)
    expect(list[0].defId).toBe('heartbeat')
    expect(list[0].filters).toEqual(defaultFilters())
    expect(list[0].config.intervalMs).toBe(3000)
    expect(h.announcements.some(a => /Heartbeat added/.test(a))).toBe(true)
  })

  it('addProcessor accepts an initial config override', () => {
    const r = h.api.addProcessor(h.getModel().rootId, 's3', 'heartbeat', { intervalMs: 500 })
    expect(r.ok).toBe(true)
    const key = `${h.getModel().rootId}:s3`
    expect(h.getProcessors()[key][0].config.intervalMs).toBe(500)
  })

  it('removeProcessor drops the instance', () => {
    const r = h.api.addProcessor(h.getModel().rootId, 's3', 'logger')
    h.api.removeProcessor(h.getModel().rootId, 's3', r.instanceId)
    const key = `${h.getModel().rootId}:s3`
    expect(h.getProcessors()[key]).toHaveLength(0)
  })

  it('removeProcessor errors when instance not found', () => {
    const r = h.api.removeProcessor(h.getModel().rootId, 's3', 'nope')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/not found/)
  })

  it('updateProcessorFilters merges the patch into existing filters', () => {
    const a = h.api.addProcessor(h.getModel().rootId, 's3', 'tracer')
    const r = h.api.updateProcessorFilters(h.getModel().rootId, 's3', a.instanceId, {
      types: ['metric'],
    })
    expect(r.ok).toBe(true)
    const key = `${h.getModel().rootId}:s3`
    const inst = h.getProcessors()[key][0]
    expect(inst.filters.types).toEqual(['metric'])
    // Other filter fields preserved
    expect(inst.filters.tags).toBeNull()
  })

  it('updateProcessorFilters can clear a field with null', () => {
    const a = h.api.addProcessor(h.getModel().rootId, 's3', 'tracer')
    h.api.updateProcessorFilters(h.getModel().rootId, 's3', a.instanceId, { types: ['alert'] })
    h.api.updateProcessorFilters(h.getModel().rootId, 's3', a.instanceId, { types: null })
    const key = `${h.getModel().rootId}:s3`
    expect(h.getProcessors()[key][0].filters.types).toBeNull()
  })

  it('updateProcessorConfig merges operational config', () => {
    const a = h.api.addProcessor(h.getModel().rootId, 's3', 'heartbeat')
    h.api.updateProcessorConfig(h.getModel().rootId, 's3', a.instanceId, { intervalMs: 1500 })
    const key = `${h.getModel().rootId}:s3`
    expect(h.getProcessors()[key][0].config.intervalMs).toBe(1500)
  })

  // ---------------------------------------------------------------------
  // Announcement coverage — the live region in App.jsx feeds from these,
  // so screen-reader users hear every processor mutation.
  // ---------------------------------------------------------------------

  it('announces on addProcessor', () => {
    h.announcements.length = 0
    h.api.addProcessor(h.getModel().rootId, 's3', 'heartbeat')
    expect(h.announcements.some(a => /Heartbeat added/.test(a))).toBe(true)
  })

  it('announces on removeProcessor', () => {
    const r = h.api.addProcessor(h.getModel().rootId, 's3', 'heartbeat')
    h.announcements.length = 0
    h.api.removeProcessor(h.getModel().rootId, 's3', r.instanceId)
    expect(h.announcements.some(a => /Heartbeat removed/.test(a))).toBe(true)
  })

  it('announces on updateProcessorFilters', () => {
    const a = h.api.addProcessor(h.getModel().rootId, 's3', 'heartbeat')
    h.announcements.length = 0
    h.api.updateProcessorFilters(h.getModel().rootId, 's3', a.instanceId, { types: ['metric'] })
    expect(h.announcements.some(a => /filters updated/i.test(a))).toBe(true)
  })

  it('announces on updateProcessorConfig', () => {
    const a = h.api.addProcessor(h.getModel().rootId, 's3', 'heartbeat')
    h.announcements.length = 0
    h.api.updateProcessorConfig(h.getModel().rootId, 's3', a.instanceId, { intervalMs: 500 })
    expect(h.announcements.some(a => /config updated/i.test(a))).toBe(true)
  })

  it('listProcessors returns short + full ids and configs', () => {
    h.api.addProcessor(h.getModel().rootId, 's3', 'heartbeat')
    h.api.addProcessor(h.getModel().rootId, 's3', 'logger')
    const r = h.api.listProcessors(h.getModel().rootId, 's3')
    expect(r.ok).toBe(true)
    expect(r.processors).toHaveLength(2)
    expect(r.processors[0]).toHaveProperty('id')
    expect(r.processors[0]).toHaveProperty('fullId')
    expect(r.processors[0].id).toHaveLength(8)
  })

  it('openProcessor errors when instance missing, succeeds when present', () => {
    expect(h.api.openProcessor(h.getModel().rootId, 's3', 'x').ok).toBe(false)
    const a = h.api.addProcessor(h.getModel().rootId, 's3', 'heartbeat')
    const r = h.api.openProcessor(h.getModel().rootId, 's3', a.instanceId)
    expect(r.ok).toBe(true)
    expect(r.view).toBe('processor')
  })

  it('getState reports processorView when set', () => {
    let nav = {}
    const api = createAgentAPI({
      getModel: () => createModel('management'),
      setModel: () => {},
      getProcessors: () => ({}),
      setProcessors: () => {},
      getNavState: () => nav,
      navigate: {},
      panels: { open: () => {}, close: () => {} },
      filters: { set: () => {} },
      announce: () => {},
    })
    expect(api.getState().view).toBe('overview')
    nav = { focusedId: 'a' }
    expect(api.getState().view).toBe('focus')
    nav = { systemView: { nodeId: 'a', systemKey: 's3' } }
    expect(api.getState().view).toBe('system')
    nav = { processorView: { nodeId: 'a', systemKey: 's3', instanceId: 'x' } }
    expect(api.getState().view).toBe('processor')
  })

  // ---------------------------------------------------------------------
  // shorthand command — BUILD a tree from indented text.
  // ---------------------------------------------------------------------

  it('shorthand replaces the model with the parsed tree', () => {
    const text = `HQ: m
  Engineering: m
    Frontend: o
  Sales: m
    Pipeline: o`
    const r = h.api.shorthand(text)
    expect(r.ok).toBe(true)
    expect(r.nodeCount).toBe(5)
    const model = h.getModel()
    expect(model.rootId).toBe(r.rootId)
    expect(model.entities[r.rootId].name).toBe('HQ')
    const eng = model.children[r.rootId].find(id => model.entities[id].name === 'Engineering')
    expect(eng).toBeTruthy()
    const frontendId = model.children[eng][0]
    expect(model.entities[frontendId].type).toBe('operation')
  })

  it('shorthand returns an error for empty/invalid input', () => {
    expect(h.api.shorthand('').ok).toBe(false)
    expect(h.api.shorthand('   \n   ').ok).toBe(false)
  })

  it('shorthand announces success', () => {
    h.announcements.length = 0
    h.api.shorthand('Root: m\n  Op: o')
    expect(h.announcements.some(a => /shorthand/i.test(a))).toBe(true)
  })
})
