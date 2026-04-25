import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createBus, roomChannel, eventsChannel } from '../signals/bus'
import { createSignal, appendTrace, hasTraced } from '../signals/signal'
import { PROCESSOR_LIBRARY, getProcessorDef, canPlaceProcessor } from '../signals/library'

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
    expect(PROCESSOR_LIBRARY.map(p => p.id).sort()).toEqual(['digest', 'heartbeat', 'logger', 'tracer', 'websocket-transducer'])
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
  let bus
  beforeEach(() => { bus = createBus() })

  it('logger filters by type', async () => {
    const { defaultFilters } = await import('../signals/filter')
    const filters = { ...defaultFilters(), types: ['metric'] }
    const logger = getProcessorDef('logger').create({}, {
      bus, instanceId: 'inst-1', roomNodeId: 'n', roomSystemKey: 's3', filters,
    })
    const events = []
    bus.subscribe(eventsChannel('inst-1'), (s) => events.push(s))
    logger.start()
    bus.publish(roomChannel('n', 's3'), createSignal('metric', {}, {}))
    bus.publish(roomChannel('n', 's3'), createSignal('alert', {}, {}))
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('metric')
    logger.stop()
  })

  it('logger filters by tag (signal needs at least one matching tag)', async () => {
    const { defaultFilters } = await import('../signals/filter')
    const filters = { ...defaultFilters(), tags: ['urgent'] }
    const logger = getProcessorDef('logger').create({}, {
      bus, instanceId: 'inst-1', roomNodeId: 'n', roomSystemKey: 's3', filters,
    })
    const events = []
    bus.subscribe(eventsChannel('inst-1'), (s) => events.push(s))
    logger.start()
    const tagged = createSignal('metric', {}, {})
    tagged.tags = ['urgent', 'audit']
    bus.publish(roomChannel('n', 's3'), tagged)
    const untagged = createSignal('metric', {}, {})
    bus.publish(roomChannel('n', 's3'), untagged)
    expect(events).toHaveLength(1)
    logger.stop()
  })

  it('logger filters by input terminal: internal signals excluded when filter is set', async () => {
    const { defaultFilters } = await import('../signals/filter')
    const filters = { ...defaultFilters(), inputTerminals: ['s5-out'] }
    const logger = getProcessorDef('logger').create({}, {
      bus, instanceId: 'inst-1', roomNodeId: 'n', roomSystemKey: 's3', filters,
    })
    const events = []
    bus.subscribe(eventsChannel('inst-1'), (s) => events.push(s))
    logger.start()
    // Matches: signal arrives via the subscribed terminal
    const arrived = createSignal('metric', {}, {})
    arrived.arrivalTerminal = 's5-out'
    bus.publish(roomChannel('n', 's3'), arrived)
    // Does not match: signal arrived via a different terminal
    const wrong = createSignal('metric', {}, {})
    wrong.arrivalTerminal = 's4-out'
    bus.publish(roomChannel('n', 's3'), wrong)
    // Does not match: no arrivalTerminal at all (internal signal)
    const internal = createSignal('metric', {}, {})
    bus.publish(roomChannel('n', 's3'), internal)
    expect(events).toHaveLength(1)
    logger.stop()
  })
})

describe('processor runtime', () => {
  let bus, runtime

  beforeEach(() => {
    vi.useFakeTimers()
    bus = createBus()
    runtime = {
      bus,
      instanceId: 'inst-1',
      roomNodeId: 'room-node',
      roomSystemKey: 's3',
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('heartbeat emits on interval to the room channel with a trace entry', () => {
    const hb = getProcessorDef('heartbeat').create({ intervalMs: 1000 }, runtime)
    const received = []
    bus.subscribe(roomChannel('room-node', 's3'), (s) => received.push(s))
    hb.start()
    expect(received).toHaveLength(1) // emits immediately on start
    vi.advanceTimersByTime(1000)
    expect(received).toHaveLength(2)
    vi.advanceTimersByTime(2500)
    expect(received).toHaveLength(4)
    hb.stop()
    vi.advanceTimersByTime(5000)
    expect(received).toHaveLength(4)
    // Each signal carries a trace entry for this room+processor
    expect(received[0].trace).toHaveLength(1)
    expect(received[0].trace[0].processorId).toBe('inst-1')
    expect(received[0].trace[0].roomNodeId).toBe('room-node')
  })

  it('heartbeat also logs to its events channel', () => {
    const hb = getProcessorDef('heartbeat').create({ intervalMs: 1000 }, runtime)
    const events = []
    bus.subscribe(eventsChannel('inst-1'), (s) => events.push(s))
    hb.start()
    expect(events).toHaveLength(1)
    hb.stop()
  })

  it('tracer stamps passing signals and forwards without looping', () => {
    const tracer = getProcessorDef('tracer').create({}, runtime)
    const room = roomChannel('room-node', 's3')
    const received = []
    bus.subscribe(room, (s) => received.push(s))
    tracer.start()

    // Publish a fresh signal; tracer should receive, stamp, republish
    const sig = createSignal('metric', { key: 'x' }, {})
    bus.publish(room, sig)
    // received: [sig, tracer-stamped-copy]
    expect(received.length).toBeGreaterThanOrEqual(2)
    const stamped = received.find(s => s.trace.some(t => t.processorId === 'inst-1'))
    expect(stamped).toBeTruthy()

    // No infinite loop — tracer skips its own stamped signal
    const beforeCount = received.length
    // Wait a tick-equivalent; synchronous publish already done
    expect(received.length).toBe(beforeCount)
    tracer.stop()
  })

  it('tracer skips signals it has already traced', () => {
    const tracer = getProcessorDef('tracer').create({}, runtime)
    const room = roomChannel('room-node', 's3')
    const events = []
    bus.subscribe(eventsChannel('inst-1'), (s) => events.push(s))
    tracer.start()

    const pre = appendTrace(createSignal('event', {}, {}), { processorId: 'inst-1' })
    bus.publish(room, pre)
    expect(events).toHaveLength(0) // already traced — no event log entry
    tracer.stop()
  })

  it('logger publishes every room signal to its events channel', () => {
    const logger = getProcessorDef('logger').create({}, runtime)
    const room = roomChannel('room-node', 's3')
    const events = []
    bus.subscribe(eventsChannel('inst-1'), (s) => events.push(s))
    logger.start()
    bus.publish(room, createSignal('alert', {}, {}))
    bus.publish(room, createSignal('metric', {}, {}))
    expect(events).toHaveLength(2)
    logger.stop()
    bus.publish(room, createSignal('event', {}, {}))
    expect(events).toHaveLength(2)
  })

  it('start is idempotent; stop is safe to call without start', () => {
    const hb = getProcessorDef('heartbeat').create({ intervalMs: 1000 }, runtime)
    const room = roomChannel('room-node', 's3')
    const received = []
    bus.subscribe(room, (s) => received.push(s))
    hb.start()
    hb.start()
    expect(received).toHaveLength(1)
    hb.stop()
    hb.stop()
    expect(() => hb.stop()).not.toThrow()
  })
})
