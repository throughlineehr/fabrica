import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createBus, eventsChannel } from '../signals/bus'
import { createSignal, appendTrace, hasTraced } from '../signals/signal'
import { PROCESSOR_LIBRARY, getProcessorDef, canPlaceProcessor } from '../signals/library'
import { createDispatcher } from '../signals/dispatcher'

const ROOM = 'room-node:s3'

describe('createBus', () => {
  it('delivers published signals to subscribers', () => {
    const bus = createBus()
    const received = []
    bus.subscribe('ch1', (sig) => received.push(sig))
    bus.publish('ch1', { id: '1', type: 'metric' })
    bus.publish('ch1', { id: '2', type: 'event' })
    expect(received).toHaveLength(2)
  })

  it('does not deliver to unsubscribed channels', () => {
    const bus = createBus()
    const received = []
    bus.subscribe('ch1', (sig) => received.push(sig))
    bus.publish('ch2', { id: '1' })
    expect(received).toHaveLength(0)
  })

  it('unsubscribe stops delivery', () => {
    const bus = createBus()
    const received = []
    const unsub = bus.subscribe('ch1', (sig) => received.push(sig))
    bus.publish('ch1', { id: '1' })
    unsub()
    bus.publish('ch1', { id: '2' })
    expect(received).toHaveLength(1)
  })

  it('multiple subscribers on same channel', () => {
    const bus = createBus()
    const a = [], b = []
    bus.subscribe('ch1', (sig) => a.push(sig))
    bus.subscribe('ch1', (sig) => b.push(sig))
    bus.publish('ch1', { id: '1' })
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
  })

  it('publish to channel with no subscribers does not throw', () => {
    const bus = createBus()
    expect(() => bus.publish('empty', { id: '1' })).not.toThrow()
  })
})

describe('signal', () => {
  it('creates a signal with id, timestamp, empty trace', () => {
    const sig = createSignal('metric', { key: 'temp', value: 72 }, { processorId: 'test' })
    expect(sig.id).toBeDefined()
    expect(sig.type).toBe('metric')
    expect(sig.content.value).toBe(72)
    expect(sig.source.processorId).toBe('test')
    expect(sig.trace).toEqual([])
    expect(sig.timestamp).toBeGreaterThan(0)
  })

  it('appendTrace returns a new signal with the new entry', () => {
    const sig = createSignal('event', {}, {})
    const traced = appendTrace(sig, { processorId: 'p1', roomNodeId: 'n1', roomSystemKey: 's3' })
    expect(traced).not.toBe(sig)
    expect(traced.trace).toHaveLength(1)
    expect(traced.trace[0].processorId).toBe('p1')
    expect(traced.trace[0].timestamp).toBeGreaterThan(0)
    expect(sig.trace).toHaveLength(0) // original untouched
  })

  it('hasTraced detects prior visits by processor id', () => {
    const sig = createSignal('event', {}, {})
    const t1 = appendTrace(sig, { processorId: 'p1' })
    expect(hasTraced(t1, 'p1')).toBe(true)
    expect(hasTraced(t1, 'p2')).toBe(false)
  })
})

describe('library metadata', () => {
  it('exports the expected library', () => {
    expect(PROCESSOR_LIBRARY.map(p => p.id).sort()).toEqual([
      'anomaly-detector', 'digest', 'entity-extractor', 'heartbeat',
      'keyword-extractor', 'logger', 'near-duplicate-detector',
      'period-detector', 'sentiment', 'step-detector', 'test-explainer',
      'test-generator', 'top-k-tracker', 'tracer', 'trend-detector',
      'websocket-transducer',
    ])
  })

  it('getProcessorDef returns by id', () => {
    expect(getProcessorDef('heartbeat')?.name).toBe('Heartbeat')
    expect(getProcessorDef('nope')).toBeUndefined()
  })

  it('canPlaceProcessor returns true for any placement', () => {
    const hb = getProcessorDef('heartbeat')
    expect(canPlaceProcessor(hb, 's1')).toBe(true)
    expect(canPlaceProcessor(hb, 's5')).toBe(true)
  })

  it('canPlaceProcessor respects explicit placement list', () => {
    expect(canPlaceProcessor({ placement: ['s3'] }, 's3')).toBe(true)
    expect(canPlaceProcessor({ placement: ['s3'] }, 's1')).toBe(false)
  })

  it('processor capabilities: heartbeat is source-only, logger is sink-only', () => {
    expect(getProcessorDef('heartbeat').hasInputs).toBe(false)
    expect(getProcessorDef('heartbeat').hasOutputs).toBe(true)
    expect(getProcessorDef('logger').hasInputs).toBe(true)
    expect(getProcessorDef('logger').hasOutputs).toBe(false)
  })
})

describe('filters', () => {
  // Wire a logger via the dispatcher and inject signals via a synthetic
  // emitter cable. Filtering is done by the processor's onInput.
  function setup(filters) {
    const bus = createBus()
    const dispatcher = createDispatcher({ onTerminal: () => {} })
    const events = []
    bus.subscribe(eventsChannel('inst-1'), (s) => events.push(s))
    const logger = getProcessorDef('logger').create({}, {
      bus, dispatcher, instanceId: 'inst-1', roomNodeId: 'n', roomSystemKey: 's3', filters,
    })
    dispatcher.registerProcessor('inst-1', { roomKey: 'n:s3', inputHandler: logger.onInput })
    dispatcher.registerProcessor('emitter', { roomKey: 'n:s3', inputHandler: () => {} })
    dispatcher.setCables({
      'n:s3': [
        { id: 'c1', source: { kind: 'jack', instanceId: 'emitter', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'inst-1', portId: 'in1' } },
      ],
    })
    return {
      events,
      send: (sig) => dispatcher.emit(sig, { fromInstanceId: 'emitter', fromPortId: 'out1' }),
    }
  }

  it('logger filters by type', async () => {
    const { defaultFilters } = await import('../signals/filter')
    const { events, send } = setup({ ...defaultFilters(), types: ['metric'] })
    send(createSignal('metric', {}, {}))
    send(createSignal('alert', {}, {}))
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('metric')
  })

  it('logger filters by tag (signal needs at least one matching tag)', async () => {
    const { defaultFilters } = await import('../signals/filter')
    const { events, send } = setup({ ...defaultFilters(), tags: ['urgent'] })
    const tagged = createSignal('metric', {}, {})
    tagged.tags = ['urgent', 'audit']
    send(tagged)
    send(createSignal('metric', {}, {}))
    expect(events).toHaveLength(1)
  })
})

describe('processor runtime', () => {
  let bus, dispatcher, runtime, spy

  beforeEach(() => {
    vi.useFakeTimers()
    bus = createBus()
    dispatcher = createDispatcher({ onTerminal: () => {} })
    spy = []
    dispatcher.registerProcessor('spy', {
      roomKey: ROOM,
      inputHandler: ({ signal }) => spy.push(signal),
    })
    dispatcher.registerProcessor('emitter', {
      roomKey: ROOM,
      inputHandler: () => {},
    })
    runtime = {
      bus, dispatcher,
      instanceId: 'inst-1',
      roomNodeId: 'room-node',
      roomSystemKey: 's3',
    }
  })

  afterEach(() => { vi.useRealTimers() })

  it('heartbeat emits per tick; cabled out1 → spy delivers reliably', () => {
    const hb = getProcessorDef('heartbeat').create({ intervalMs: 1000 }, runtime)
    dispatcher.registerProcessor('inst-1', { roomKey: ROOM, inputHandler: () => {} })
    dispatcher.setCables({
      [ROOM]: [
        { id: 'c1', source: { kind: 'jack', instanceId: 'inst-1', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'spy', portId: 'in1' } },
      ],
    })
    hb.start()
    expect(spy).toHaveLength(1)
    vi.advanceTimersByTime(1000)
    expect(spy).toHaveLength(2)
    vi.advanceTimersByTime(2500)
    expect(spy).toHaveLength(4)
    hb.stop()
    vi.advanceTimersByTime(5000)
    expect(spy).toHaveLength(4)
    expect(spy[0].trace[0].processorId).toBe('inst-1')
    expect(spy[0].trace[0].roomNodeId).toBe('room-node')
  })

  it('heartbeat also logs to its events channel', () => {
    const hb = getProcessorDef('heartbeat').create({ intervalMs: 1000 }, runtime)
    const events = []
    bus.subscribe(eventsChannel('inst-1'), (s) => events.push(s))
    hb.start()
    expect(events).toHaveLength(1)
    hb.stop()
  })

  it('tracer stamps passing signals and forwards via cables', () => {
    const tracer = getProcessorDef('tracer').create({}, runtime)
    dispatcher.registerProcessor('inst-1', { roomKey: ROOM, inputHandler: tracer.onInput })
    dispatcher.setCables({
      [ROOM]: [
        { id: 'c0', source: { kind: 'jack', instanceId: 'emitter', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'inst-1', portId: 'in1' } },
        { id: 'c1', source: { kind: 'jack', instanceId: 'inst-1', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'spy', portId: 'in1' } },
      ],
    })
    dispatcher.emit(createSignal('metric', { key: 'x' }, {}), { fromInstanceId: 'emitter', fromPortId: 'out1' })
    expect(spy.length).toBeGreaterThanOrEqual(1)
    expect(spy[0].trace.some(t => t.processorId === 'inst-1')).toBe(true)
  })

  it('tracer skips signals it has already traced', () => {
    const tracer = getProcessorDef('tracer').create({}, runtime)
    dispatcher.registerProcessor('inst-1', { roomKey: ROOM, inputHandler: tracer.onInput })
    dispatcher.setCables({
      [ROOM]: [
        { id: 'c0', source: { kind: 'jack', instanceId: 'emitter', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'inst-1', portId: 'in1' } },
      ],
    })
    const events = []
    bus.subscribe(eventsChannel('inst-1'), (s) => events.push(s))
    const pre = appendTrace(createSignal('event', {}, {}), { processorId: 'inst-1' })
    dispatcher.emit(pre, { fromInstanceId: 'emitter', fromPortId: 'out1' })
    expect(events).toHaveLength(0)
  })

  it('logger publishes every cabled signal to its events channel', () => {
    const logger = getProcessorDef('logger').create({}, runtime)
    dispatcher.registerProcessor('inst-1', { roomKey: ROOM, inputHandler: logger.onInput })
    dispatcher.setCables({
      [ROOM]: [
        { id: 'c0', source: { kind: 'jack', instanceId: 'emitter', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'inst-1', portId: 'in1' } },
      ],
    })
    const events = []
    bus.subscribe(eventsChannel('inst-1'), (s) => events.push(s))
    dispatcher.emit(createSignal('alert', {}, {}), { fromInstanceId: 'emitter', fromPortId: 'out1' })
    dispatcher.emit(createSignal('metric', {}, {}), { fromInstanceId: 'emitter', fromPortId: 'out1' })
    expect(events).toHaveLength(2)
  })

  it('start is idempotent; stop is safe to call without start', () => {
    const hb = getProcessorDef('heartbeat').create({ intervalMs: 1000 }, runtime)
    dispatcher.registerProcessor('inst-1', { roomKey: ROOM, inputHandler: () => {} })
    dispatcher.setCables({
      [ROOM]: [
        { id: 'c1', source: { kind: 'jack', instanceId: 'inst-1', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'spy', portId: 'in1' } },
      ],
    })
    hb.start()
    hb.start()
    expect(spy).toHaveLength(1)
    hb.stop()
    hb.stop()
    expect(() => hb.stop()).not.toThrow()
  })
})
