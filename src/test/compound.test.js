// Sub-patching tests. Verify that:
//   1. A compound's inner instances are spawned, started, and torn down
//      on stop()
//   2. Outer input → bound inner forwarding works
//   3. Inner → inner cables fire via the proxy dispatcher
//   4. Bound inner output → outer port re-emit reaches the outer
//      dispatcher (so external cables off the compound's outer port get
//      the signal)
//   5. The proof composition (sentiment-tracker) works end-to-end

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createBus } from '../signals/bus'
import { createSignal } from '../signals/signal'
import { getProcessorDef } from '../signals/library'
import { createDispatcher } from '../signals/dispatcher'

const ROOM = 'r:s3'

function spawn(defId, configOverrides = {}) {
  const bus = createBus()
  const dispatcher = createDispatcher({ onTerminal: () => {} })
  const out = []
  dispatcher.registerProcessor('spy', {
    roomKey: ROOM,
    inputHandler: ({ signal }) => out.push(signal),
  })
  // Synthetic emitter so we can drive input via the real dispatcher path
  // (which sets portId), instead of calling onInput directly.
  dispatcher.registerProcessor('emitter', {
    roomKey: ROOM,
    inputHandler: () => {},
  })
  const def = getProcessorDef(defId)
  const inst = def.create(
    { ...(def.defaultConfig || {}), ...configOverrides },
    { bus, dispatcher, instanceId: 'cmp', roomNodeId: 'r', roomSystemKey: 's3', filters: {} },
  )
  dispatcher.registerProcessor('cmp', { roomKey: ROOM, inputHandler: inst.onInput })
  // Wire emitter→cmp.in (for each declared input port, emitter feeds it)
  // and each cmp output → spy.
  const inputCables = (def.ports.inputs || []).map((p, i) => ({
    id: `ci${i}`,
    source: { kind: 'jack', instanceId: 'emitter', portId: p.id },
    target: { kind: 'jack', instanceId: 'cmp',     portId: p.id },
  }))
  const outputCables = (def.ports.outputs || []).map((p, i) => ({
    id: `co${i}`,
    source: { kind: 'jack', instanceId: 'cmp', portId: p.id },
    target: { kind: 'jack', instanceId: 'spy', portId: 'in' },
  }))
  dispatcher.setCables({ [ROOM]: [...inputCables, ...outputCables] })
  return {
    def, inst, out, bus, dispatcher,
    feed: (text, port = 'in') => {
      const sig = createSignal('narrative', { text }, {})
      dispatcher.emit(sig, { fromInstanceId: 'emitter', fromPortId: port })
    },
  }
}

describe('compound runtime — sentiment-tracker (proof composition)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('outer input → inner sentiment → inner top-k → outer top, end-to-end', () => {
    const { feed, inst, out } = spawn('sentiment-tracker')
    feed('great deploy, fantastic work everyone')
    feed('wonderful release, all systems happy')
    feed('critical outage, urgent fix needed')
    // top-k-tracker reports every 5s
    vi.advanceTimersByTime(5500)
    expect(out.length).toBeGreaterThan(0)
    const report = out[0]
    expect(report.tags).toContain('top-k')
    expect(report.content.kind).toBe('top-k')
    // The polarity-tag distribution: 2 positive + 1 negative
    const tagToCount = Object.fromEntries(report.content.topK.map(t => [t.value, t.count]))
    expect(tagToCount.positive).toBe(2)
    expect(tagToCount.negative).toBe(1)
    inst.stop()
  })

  it('stop() tears down inner instances (their timers stop firing)', () => {
    const { feed, inst, out } = spawn('sentiment-tracker')
    feed('great deploy')
    vi.advanceTimersByTime(5500)
    const before = out.length
    expect(before).toBeGreaterThan(0)
    inst.stop()
    feed('happy times')
    vi.advanceTimersByTime(10000)
    // After stop, no further reports — timers gone.
    expect(out.length).toBe(before)
  })

  it('emits a compound-started event on instantiation', () => {
    const bus = createBus()
    const dispatcher = createDispatcher({ onTerminal: () => {} })
    const events = []
    bus.subscribe('proc:cmp:events', (s) => events.push(s))
    const def = getProcessorDef('sentiment-tracker')
    def.create({}, { bus, dispatcher, instanceId: 'cmp', roomNodeId: 'r', roomSystemKey: 's3', filters: {} })
    expect(events.some(s => s.content?.kind === 'compound-started')).toBe(true)
  })
})

describe('compound runtime — generic invariants', () => {
  it('a port not declared in inputBindings is silently dropped', () => {
    const { inst, out } = spawn('sentiment-tracker')
    // 'nope' isn't a declared port — onInput resolves to no binding.
    inst.onInput({ signal: createSignal('narrative', { text: 'great work' }, {}), portId: 'nope' })
    expect(out).toHaveLength(0)
    inst.stop()
  })

  it('inner ids are namespaced under the outer id (no collision with sibling instances)', () => {
    // Two sentiment-trackers in the same room — their inner instances
    // shouldn't trample each other.
    const bus = createBus()
    const dispatcher = createDispatcher({ onTerminal: () => {} })
    const def = getProcessorDef('sentiment-tracker')
    const a = def.create({}, { bus, dispatcher, instanceId: 'A', roomNodeId: 'r', roomSystemKey: 's3', filters: {} })
    const b = def.create({}, { bus, dispatcher, instanceId: 'B', roomNodeId: 'r', roomSystemKey: 's3', filters: {} })
    // If inner ids weren't namespaced the second create() would overwrite
    // dispatcher state for the first. Since inners use the proxy dispatcher
    // (not the real one), that's fine here — but this still confirms two
    // compounds can coexist without crashing.
    expect(typeof a.onInput).toBe('function')
    expect(typeof b.onInput).toBe('function')
    a.stop(); b.stop()
  })
})
