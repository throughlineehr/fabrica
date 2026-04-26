// End-to-end plumbing tests for the signal system, dispatcher edition.
//
// In the cable-driven model, signals only flow where cables (or broadcast)
// route them. These tests build a small tree, set up the dispatcher with
// the topology bridge, drop processors with explicit cables, and assert
// signals reach the expected places.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createModel, addNode } from '../tree/model'
import { buildRenderTree } from '../tree/index'
import { createBus, eventsChannel } from '../signals/bus'
import { createSignal, appendTrace, hasTraced } from '../signals/signal'
import { getProcessorDef } from '../signals/library'
import { computeRoomSubscriptions, enumerateRooms, roomKey, buildRoomTerminals } from '../signals/topology'
import { findNode } from '../tree/queries'
import { createDispatcher } from '../signals/dispatcher'

// Two-children tree for plumbing scenarios:
//
//   Root (mgmt)
//   ├── A (mgmt)
//   │   └── op-a (operation)
//   └── B (mgmt)
//       └── op-b (operation)
function twoChildrenTree() {
  let m = createModel('management')
  m = addNode(m, m.rootId, 'management')
  const aId = m.children[m.rootId][0]
  m = addNode(m, m.rootId, 'management')
  const bId = m.children[m.rootId][1]
  m = addNode(m, aId, 'operation')
  const opA = m.children[aId][0]
  m = addNode(m, bId, 'operation')
  const opB = m.children[bId][0]
  return { tree: buildRenderTree(m), rootId: m.rootId, aId, bId, opA, opB }
}

// Stand up bus + dispatcher with topology bridge. `place` registers a
// processor instance with the dispatcher and starts it.
function harness() {
  const t = twoChildrenTree()
  const bus = createBus()
  const topo = computeRoomSubscriptions(t.tree)

  // Forward index: (sourceRoomKey|sourceTerminalId) → peer rooms.
  const idx = new Map()
  for (const [targetRoomKey, inbounds] of Object.entries(topo)) {
    for (const sub of inbounds) {
      const k = `${sub.sourceRoomKey}|${sub.sourceTerminalId}`
      if (!idx.has(k)) idx.set(k, [])
      idx.get(k).push({ targetRoomKey, targetTerminalId: sub.terminalId })
    }
  }

  let dispatcher
  dispatcher = createDispatcher({
    onTerminal: (fromRoomKey, terminalId, signal, hopCount) => {
      const peers = idx.get(`${fromRoomKey}|${terminalId}`) || []
      for (const peer of peers) {
        dispatcher.deliverFromTerminal(peer.targetRoomKey, peer.targetTerminalId, signal, hopCount)
      }
    },
  })

  // Register room terminals so broadcast knows what to fan out to.
  const terminalsByRoom = {}
  for (const r of enumerateRooms(t.tree)) {
    const node = findNode(t.tree, r.nodeId)
    if (!node) continue
    terminalsByRoom[roomKey(r.nodeId, r.systemKey)] = buildRoomTerminals(node, r.systemKey, t.tree).map(x => x.id)
  }
  dispatcher.setRoomTerminals(terminalsByRoom)

  let cables = {}
  const setCables = (next) => { cables = next; dispatcher.setCables(cables) }

  const handles = []
  const place = (defId, instanceId, nodeId, systemKey, { config = {}, filters, broadcast } = {}) => {
    const def = getProcessorDef(defId)
    const handle = def.create(
      { ...(def.defaultConfig || {}), ...config },
      { bus, dispatcher, instanceId, roomNodeId: nodeId, roomSystemKey: systemKey, filters },
    )
    // Always register so the dispatcher knows the room (sources need this
    // to emit; sinks need it to receive).
    dispatcher.registerProcessor(instanceId, {
      roomKey: roomKey(nodeId, systemKey),
      inputHandler: handle.onInput || (() => {}),
    })
    if (broadcast) dispatcher.setBroadcast(instanceId, true)
    handle.start()
    handles.push({ handle, instanceId })
    return handle
  }
  const tearDown = () => {
    for (const { handle, instanceId } of handles) {
      handle.stop()
      dispatcher.unregisterProcessor(instanceId)
    }
  }
  return { ...t, bus, dispatcher, place, setCables, tearDown }
}

describe('signal plumbing (dispatcher-driven)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('broadcast=true on a source fans out to peer rooms via topology', () => {
    // Heartbeat in A:s3 with broadcast=true sends to all A:s3 terminals.
    // s3-parent peers with Root:s3's s3-children → logger in Root:s3 receives.
    const h = harness()
    const loggerEvents = []
    h.place('logger', 'log-1', h.rootId, 's3')
    h.bus.subscribe(eventsChannel('log-1'), s => loggerEvents.push(s))

    // Cable from Root:s3's s3-children terminal to the logger's input — so
    // signals arriving from A's s3-parent reach this logger.
    h.setCables({
      [`${h.rootId}:s3`]: [
        { id: 'c1', source: { kind: 'terminal', terminalId: 's3-children' },
                    target: { kind: 'jack', instanceId: 'log-1', portId: 'in1' } },
      ],
    })

    h.place('heartbeat', 'hb-1', h.aId, 's3', { config: { intervalMs: 1000 }, broadcast: true })
    vi.advanceTimersByTime(1100)

    expect(loggerEvents.length).toBeGreaterThanOrEqual(2)
    for (const sig of loggerEvents) {
      expect(sig.source.processorType).toBe('heartbeat')
      expect(sig.trace.some(t => t.processorId === 'hb-1')).toBe(true)
    }
    h.tearDown()
  })

  it('without broadcast and without cables, source stays silent (room is not auto-wired)', () => {
    const h = harness()
    const loggerEvents = []
    h.place('logger', 'log-1', h.rootId, 's3')
    h.bus.subscribe(eventsChannel('log-1'), s => loggerEvents.push(s))
    h.place('heartbeat', 'hb-1', h.aId, 's3', { config: { intervalMs: 1000 } })

    vi.advanceTimersByTime(1100)
    expect(loggerEvents).toHaveLength(0)
    h.tearDown()
  })

  it('explicit jack→jack cable in same room: heartbeat → logger directly', () => {
    const h = harness()
    const loggerEvents = []
    h.place('logger', 'log-1', h.rootId, 's3')
    h.bus.subscribe(eventsChannel('log-1'), s => loggerEvents.push(s))

    h.setCables({
      [`${h.rootId}:s3`]: [
        { id: 'c1', source: { kind: 'jack', instanceId: 'hb-1', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'log-1', portId: 'in1' } },
      ],
    })
    h.place('heartbeat', 'hb-1', h.rootId, 's3', { config: { intervalMs: 1000 } })

    vi.advanceTimersByTime(1100)
    expect(loggerEvents.length).toBeGreaterThanOrEqual(2)
    h.tearDown()
  })

  it('tracer stamps signals it sees and forwards to next-hop cables', () => {
    const h = harness()
    const tracerEvents = []
    h.place('tracer', 'tr-1', h.rootId, 's3')
    h.bus.subscribe(eventsChannel('tr-1'), s => tracerEvents.push(s))

    h.setCables({
      [`${h.rootId}:s3`]: [
        { id: 'c1', source: { kind: 'jack', instanceId: 'hb-1', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'tr-1', portId: 'in1' } },
      ],
    })
    h.place('heartbeat', 'hb-1', h.rootId, 's3', { config: { intervalMs: 1000 } })

    vi.advanceTimersByTime(1100)
    expect(tracerEvents.length).toBeGreaterThan(0)
    for (const sig of tracerEvents) {
      const order = sig.trace.map(t => t.processorId)
      expect(order).toContain('hb-1')
      expect(order).toContain('tr-1')
      expect(order.indexOf('hb-1')).toBeLessThan(order.indexOf('tr-1'))
    }
    h.tearDown()
  })

  it('tracer does not re-stamp its own output (hasTraced loop guard)', () => {
    const h = harness()
    const tracerEvents = []
    h.place('tracer', 'tr-1', h.rootId, 's3')
    h.bus.subscribe(eventsChannel('tr-1'), s => tracerEvents.push(s))

    // Self-loop: tracer's output cabled back to its own input.
    h.setCables({
      [`${h.rootId}:s3`]: [
        { id: 'c1', source: { kind: 'jack', instanceId: 'tr-1', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'tr-1', portId: 'in1' } },
      ],
    })

    // Inject a signal directly via the dispatcher's deliverFromTerminal-ish
    // entry point. Simplest: register a synthetic emitter that triggers tracer.
    h.dispatcher.registerProcessor('synthetic', {
      roomKey: roomKey(h.rootId, 's3'),
      inputHandler: () => {},
    })
    h.setCables({
      [`${h.rootId}:s3`]: [
        { id: 'c0', source: { kind: 'jack', instanceId: 'synthetic', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'tr-1', portId: 'in1' } },
        { id: 'c1', source: { kind: 'jack', instanceId: 'tr-1', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'tr-1', portId: 'in1' } },
      ],
    })

    h.dispatcher.emit(createSignal('metric', { v: 1 }, {}), { fromInstanceId: 'synthetic', fromPortId: 'out1' })

    expect(tracerEvents).toHaveLength(1)
    expect(tracerEvents[0].trace.filter(t => t.processorId === 'tr-1')).toHaveLength(1)

    h.dispatcher.unregisterProcessor('synthetic')
    h.tearDown()
  })

  it('filters gate processor reactions (type only — terminal filtering moved to cables)', () => {
    const h = harness()
    const loggerEvents = []
    h.place('logger', 'log-1', h.rootId, 's3', {
      filters: { types: ['alert'], tags: null },
    })
    h.bus.subscribe(eventsChannel('log-1'), s => loggerEvents.push(s))

    h.dispatcher.registerProcessor('synthetic', {
      roomKey: roomKey(h.rootId, 's3'),
      inputHandler: () => {},
    })
    h.setCables({
      [`${h.rootId}:s3`]: [
        { id: 'c0', source: { kind: 'jack', instanceId: 'synthetic', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'log-1', portId: 'in1' } },
      ],
    })

    h.dispatcher.emit(createSignal('metric', {}, {}), { fromInstanceId: 'synthetic', fromPortId: 'out1' })
    h.dispatcher.emit(createSignal('event',  {}, {}), { fromInstanceId: 'synthetic', fromPortId: 'out1' })
    h.dispatcher.emit(createSignal('alert',  {}, {}), { fromInstanceId: 'synthetic', fromPortId: 'out1' })
    expect(loggerEvents).toHaveLength(1)
    expect(loggerEvents[0].type).toBe('alert')

    h.dispatcher.unregisterProcessor('synthetic')
    h.tearDown()
  })

  it('signal shape contract: id, trace[], hops[], delivered[], tags[]', () => {
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
    expect(sig.trace).toHaveLength(0)
  })
})
