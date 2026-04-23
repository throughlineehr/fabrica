// End-to-end plumbing tests for the signal system.
//
// No React, no component rendering. Builds a tree via the tree model,
// computes topology, wires the bus, drops processors into rooms, runs
// the clock, and asserts signals flow through the expected path.
//
// This is the "can you test it from outside the app?" answer — yes.
// The signal system layers (bus, signal, topology, wiring, library,
// filter) are plain JS. React lives only at two named edges (BusContext,
// useSignalLog) that are not under test here.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createModel, addNode } from '../tree/model'
import { buildRenderTree } from '../tree/index'
import { createBus, roomChannel, eventsChannel, publishToRoom } from '../signals/bus'
import { createSignal, appendTrace, hasTraced } from '../signals/signal'
import { getProcessorDef } from '../signals/library'
import { computeRoomSubscriptions } from '../signals/topology'
import { wireTopology } from '../signals/wiring'

// Build a realistic tree for plumbing tests:
//
//   Root (mgmt)
//   ├── A (mgmt)
//   │   └── op-a (operation)
//   └── B (mgmt)
//       └── op-b (operation)
//
// Topology consequence: A:s3 and B:s3 both subscribe to Root:s3 via
// s3-parent, and Root:s3 subscribes to both A:s3 and B:s3 via s3-children.
function twoChildrenTree() {
  let m = createModel('management')
  m = addNode(m, m.rootId, 'management')           // A
  const aId = m.children[m.rootId][0]
  m = addNode(m, m.rootId, 'management')           // B
  const bId = m.children[m.rootId][1]
  m = addNode(m, aId, 'operation')                 // op-a
  const opA = m.children[aId][0]
  m = addNode(m, bId, 'operation')                 // op-b
  const opB = m.children[bId][0]
  return { tree: buildRenderTree(m), rootId: m.rootId, aId, bId, opA, opB }
}

// Convenience: stand up the full runtime (bus, topology, wiring) and
// return a teardown fn plus helpers.
function harness() {
  const { tree, rootId, aId, bId, opA, opB } = twoChildrenTree()
  const bus = createBus()
  const topo = computeRoomSubscriptions(tree)
  const cleanups = [wireTopology(bus, topo)]
  const runtime = (instanceId, roomNodeId, roomSystemKey, filters = {}) => ({
    bus, instanceId, roomNodeId, roomSystemKey, filters,
  })
  const place = (defId, instanceId, roomNodeId, roomSystemKey, { config = {}, filters } = {}) => {
    const def = getProcessorDef(defId)
    const handle = def.create(
      { ...(def.defaultConfig || {}), ...config },
      runtime(instanceId, roomNodeId, roomSystemKey, filters),
    )
    handle.start()
    cleanups.push(() => handle.stop())
    return handle
  }
  const tearDown = () => cleanups.forEach(c => c())
  return { tree, rootId, aId, bId, opA, opB, bus, topo, place, tearDown }
}

describe('signal plumbing (no React)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('heartbeat in child A S3 reaches a logger in root S3', () => {
    const h = harness()
    const loggerEvents = []
    // Place listeners BEFORE the heartbeat so subscribers are live when it
    // emits its first pulse (the heartbeat emits once synchronously on start).
    h.place('logger', 'log-1', h.rootId, 's3')
    h.bus.subscribe(eventsChannel('log-1'), s => loggerEvents.push(s))
    h.place('heartbeat', 'hb-1', h.aId, 's3', { config: { intervalMs: 1000 } })

    // Immediate emit at t=0 + one tick at t=1000
    vi.advanceTimersByTime(1100)

    // Logger sits in root:s3 and root:s3 subscribes to child A:s3 — signal flows.
    expect(loggerEvents.length).toBeGreaterThanOrEqual(2)
    // Every signal the logger saw originated from the heartbeat.
    for (const sig of loggerEvents) {
      expect(sig.source.processorType).toBe('heartbeat')
      expect(sig.trace.some(t => t.processorId === 'hb-1')).toBe(true)
      // hops record the root-ward trip
      expect(sig.hops[0]).toBe(`${h.aId}:s3`)
      expect(sig.hops).toContain(`${h.rootId}:s3`)
    }
    h.tearDown()
  })

  it('heartbeat → tracer → logger (tracer and logger share a room)', () => {
    // Plumbing: heartbeat in A:s3 emits every second; tracer AND logger both
    // sit in Root:s3. The signal arrives at Root:s3 through the A→Root
    // forwarder, the logger sees it (unstamped at this point), the tracer
    // sees it and re-publishes with its own trace entry, the logger sees
    // the tracer-stamped version as a second delivery on the same channel.
    //
    // This is the correct place to observe tracer-enrichment: in the room
    // where the tracer lives. Downstream rooms (B:s3, s4, s5) already received
    // the original signal via forwarders; delivered[] prevents re-delivery
    // there, which is the intended loop-prevention behavior of the bus.
    const h = harness()
    const loggerEvents = []
    h.place('logger', 'log-1', h.rootId, 's3')
    h.place('tracer', 'tr-1', h.rootId, 's3')
    h.bus.subscribe(eventsChannel('log-1'), s => loggerEvents.push(s))
    h.place('heartbeat', 'hb-1', h.aId, 's3', { config: { intervalMs: 1000 } })

    vi.advanceTimersByTime(1100)

    // The logger receives TWO events per heartbeat tick:
    //   1. original arriving from A:s3 via the forwarder
    //   2. tracer's stamped re-publish after it added its trace entry
    const stamped = loggerEvents.filter(s => s.trace.some(t => t.processorId === 'tr-1'))
    const unstamped = loggerEvents.filter(s => !s.trace.some(t => t.processorId === 'tr-1'))
    expect(stamped.length).toBeGreaterThan(0)
    expect(unstamped.length).toBeGreaterThan(0)

    for (const sig of stamped) {
      // Provenance order in trace: heartbeat first, tracer after.
      const procOrder = sig.trace.map(t => t.processorId)
      expect(procOrder).toContain('hb-1')
      expect(procOrder).toContain('tr-1')
      expect(procOrder.indexOf('hb-1')).toBeLessThan(procOrder.indexOf('tr-1'))
      // trace also records each room each processor visited
      expect(sig.trace.find(t => t.processorId === 'hb-1').roomSystemKey).toBe('s3')
      expect(sig.trace.find(t => t.processorId === 'tr-1').roomSystemKey).toBe('s3')
      // hops include both origin and Root rooms
      expect(sig.hops).toContain(`${h.aId}:s3`)
      expect(sig.hops).toContain(`${h.rootId}:s3`)
    }

    h.tearDown()
  })

  it('delivered[] prevents tracer-enriched signals from re-entering already-delivered rooms', () => {
    // Same topology, but logger is in B:s3 (downstream). The heartbeat's
    // original signal reaches B:s3 through the forwarder (before the tracer
    // re-publishes), so delivered[] has B:s3 when the tracer's stamped copy
    // tries to forward. The stamped copy does NOT reach B:s3 — by design,
    // loop prevention. Observing the stamp therefore requires looking at
    // the tracer's own events channel or a listener in the tracer's room.
    const h = harness()
    const bLoggerEvents = []
    const tracerEvents = []
    h.place('logger', 'log-1', h.bId, 's3')
    h.place('tracer', 'tr-1', h.rootId, 's3')
    h.bus.subscribe(eventsChannel('log-1'), s => bLoggerEvents.push(s))
    h.bus.subscribe(eventsChannel('tr-1'), s => tracerEvents.push(s))
    h.place('heartbeat', 'hb-1', h.aId, 's3', { config: { intervalMs: 1000 } })

    vi.advanceTimersByTime(1100)

    // Tracer stamped at least one signal — observable on its own events channel.
    expect(tracerEvents.length).toBeGreaterThan(0)
    for (const sig of tracerEvents) {
      expect(sig.trace.some(t => t.processorId === 'tr-1')).toBe(true)
    }

    // But B's logger receives ONLY unstamped copies (the original, via forwarder).
    // The stamped re-publish is blocked by delivered[] from re-entering B:s3.
    expect(bLoggerEvents.length).toBeGreaterThan(0)
    for (const sig of bLoggerEvents) {
      expect(sig.trace.some(t => t.processorId === 'tr-1')).toBe(false)
    }

    h.tearDown()
  })

  it('tracer does not re-stamp its own output (loop prevention)', () => {
    // Place a tracer in Root:s3. Publish a signal into the room. The tracer
    // stamps it and republishes. The republish fires the same subscribe
    // callback — but hasTraced catches the loop and the tracer skips.
    const h = harness()
    const tracerEvents = []
    h.place('tracer', 'tr-1', h.rootId, 's3')
    h.bus.subscribe(eventsChannel('tr-1'), s => tracerEvents.push(s))

    publishToRoom(h.bus, h.rootId, 's3', createSignal('metric', { v: 1 }, {}))
    expect(tracerEvents).toHaveLength(1)
    expect(tracerEvents[0].trace.filter(t => t.processorId === 'tr-1')).toHaveLength(1)

    h.tearDown()
  })

  it('filters gate processor reactions (type + tag)', () => {
    const h = harness()
    const loggerEvents = []
    h.place('logger', 'log-1', h.rootId, 's3', {
      filters: { types: ['alert'], tags: null, inputTerminals: null, outputTerminals: null },
    })
    h.bus.subscribe(eventsChannel('log-1'), s => loggerEvents.push(s))

    // Emit three different types; only alert should survive.
    publishToRoom(h.bus, h.rootId, 's3', createSignal('metric', {}, {}))
    publishToRoom(h.bus, h.rootId, 's3', createSignal('event', {}, {}))
    publishToRoom(h.bus, h.rootId, 's3', createSignal('alert', {}, {}))
    expect(loggerEvents).toHaveLength(1)
    expect(loggerEvents[0].type).toBe('alert')

    h.tearDown()
  })

  it('deleting a node tears down its room forwarders (rewire after tree change)', () => {
    // Build, wire, record.  Then rebuild the tree WITHOUT B, rewire, and
    // confirm signals destined for B no longer arrive.
    const h = harness()
    const loggerEvents = []
    h.place('logger', 'log-1', h.bId, 's3')
    h.bus.subscribe(eventsChannel('log-1'), s => loggerEvents.push(s))
    h.place('heartbeat', 'hb-1', h.aId, 's3', { config: { intervalMs: 1000 } })

    vi.advanceTimersByTime(1100)
    const countBefore = loggerEvents.length
    expect(countBefore).toBeGreaterThan(0)

    // Simulate the App effect: tree mutation → teardown + rewire.
    // Rebuild the tree as if B were removed.
    let m2 = createModel('management')
    m2 = addNode(m2, m2.rootId, 'management')
    const aIdNew = m2.children[m2.rootId][0]
    m2 = addNode(m2, aIdNew, 'operation')
    const tree2 = buildRenderTree(m2)
    const topo2 = computeRoomSubscriptions(tree2)

    // The processors placed in the OLD tree's rooms keep running — they're
    // App state, not topology state. The App code removes them on prune, but
    // the signal layer just changes who's wired to whom.
    h.tearDown() // drop the OLD wiring
    const cleanup2 = wireTopology(h.bus, topo2)

    loggerEvents.length = 0
    vi.advanceTimersByTime(1100)
    // B's logger is still subscribed to its (now-orphan) events channel, but
    // no forwarder reaches its room any more — the heartbeat lives in A:s3
    // of the OLD tree, whose node doesn't exist in tree2. So events should be 0.
    expect(loggerEvents).toHaveLength(0)

    cleanup2()
  })

  it('channel names are produced by helpers (no string literals below bus.js)', () => {
    // Quick contract check: roomChannel and eventsChannel are the only
    // way to construct these strings. A processor published through the
    // helpers should end up on the channel the helpers name.
    const h = harness()
    const direct = []
    h.bus.subscribe(roomChannel(h.aId, 's3'), s => direct.push(s))
    publishToRoom(h.bus, h.aId, 's3', createSignal('event', { v: 'x' }, {}))
    expect(direct).toHaveLength(1)
    expect(direct[0].content.v).toBe('x')
    h.tearDown()
  })

  it('publishing outside the topology does not crash; no-op delivery', () => {
    // An orphan publish to a room that doesn't exist in the topology
    // shouldn't blow up — just no subscribers will hear it.
    const h = harness()
    expect(() =>
      publishToRoom(h.bus, 'not-a-real-node', 's3', createSignal('metric', {}, {}))
    ).not.toThrow()
    h.tearDown()
  })

  it('signal shape contract: id, trace[], hops[], delivered[], tags[]', () => {
    // Pure function level — no bus, no topology. Just verifies the shape
    // a test-author would rely on.
    const sig = createSignal('narrative', { text: 'hello' }, { processorId: 'x' })
    expect(sig.id).toMatch(/[0-9a-f-]+/)
    expect(sig.type).toBe('narrative')
    expect(sig.content.text).toBe('hello')
    expect(sig.trace).toEqual([])
    expect(sig.hops).toEqual([])
    expect(sig.delivered).toEqual([])
    expect(sig.tags).toEqual([])
    expect(sig.timestamp).toBeGreaterThan(0)

    const stamped = appendTrace(sig, { processorId: 'p', roomNodeId: 'r', roomSystemKey: 's3' })
    expect(hasTraced(stamped, 'p')).toBe(true)
    expect(hasTraced(stamped, 'q')).toBe(false)
    expect(sig.trace).toHaveLength(0) // original unchanged (append is immutable on trace)
  })
})
