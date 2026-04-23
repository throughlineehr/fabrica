import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createModel, addNode } from '../tree/model'
import { buildRenderTree } from '../tree/index'
import { createBus, roomChannel, publishToRoom } from '../signals/bus'
import { createSignal } from '../signals/signal'
import { computeRoomSubscriptions } from '../signals/topology'
import { wireTopology } from '../signals/wiring'
import { getProcessorDef } from '../signals/library'

function twoLevelTree() {
  let m = createModel('management')
  m = addNode(m, m.rootId, 'management')
  const aId = m.children[m.rootId][0]
  m = addNode(m, aId, 'operation')
  const op1 = m.children[aId][0]
  return { tree: buildRenderTree(m), rootId: m.rootId, aId, op1 }
}

describe('wireTopology', () => {
  let bus
  beforeEach(() => { bus = createBus() })

  it('forwards a signal from source room to subscribing target rooms', () => {
    const { tree, rootId, aId } = twoLevelTree()
    const topo = computeRoomSubscriptions(tree)
    const cleanup = wireTopology(bus, topo)

    // Root's S5 subscribes to A's S5 (s5-children terminal).
    const rootS5Signals = []
    bus.subscribe(roomChannel(rootId, 's5'), (s) => rootS5Signals.push(s))

    publishToRoom(bus, aId, 's5', createSignal('metric', { v: 1 }, {}))
    expect(rootS5Signals).toHaveLength(1)
    cleanup()
  })

  it('hops-based loop prevention: bidirectional subscriptions do not loop', () => {
    // Root's S3 and S4 have bidirectional subscriptions to each other
    // (S3 subscribes to S4 via s4-out; S4 subscribes to S3 via s3-in, both 'both')
    const { tree, rootId } = twoLevelTree()
    const topo = computeRoomSubscriptions(tree)
    const cleanup = wireTopology(bus, topo)

    const s3Count = []
    const s4Count = []
    bus.subscribe(roomChannel(rootId, 's3'), () => s3Count.push(1))
    bus.subscribe(roomChannel(rootId, 's4'), () => s4Count.push(1))

    publishToRoom(bus, rootId, 's3', createSignal('metric', {}, {}))
    // s3 got the original; s4 got the forwarded copy; no further bounces
    expect(s3Count.length).toBe(1)
    expect(s4Count.length).toBe(1)
    cleanup()
  })

  it('cleanup removes all forwarders', () => {
    const { tree, rootId, aId } = twoLevelTree()
    const topo = computeRoomSubscriptions(tree)
    const cleanup = wireTopology(bus, topo)

    const received = []
    bus.subscribe(roomChannel(rootId, 's5'), (s) => received.push(s))
    cleanup()

    publishToRoom(bus, aId, 's5', createSignal('metric', {}, {}))
    expect(received).toHaveLength(0)
  })

  it('heartbeat in child A S3 flows to root S3 via the S3-children subscription', () => {
    vi.useFakeTimers()
    const { tree, rootId, aId } = twoLevelTree()
    const topo = computeRoomSubscriptions(tree)
    const wiringCleanup = wireTopology(bus, topo)

    const hb = getProcessorDef('heartbeat').create({ intervalMs: 1000 }, {
      bus, instanceId: 'hb-1', roomNodeId: aId, roomSystemKey: 's3',
    })

    const rootS3Signals = []
    bus.subscribe(roomChannel(rootId, 's3'), (s) => rootS3Signals.push(s))

    hb.start()
    // Immediate emit
    expect(rootS3Signals.length).toBeGreaterThanOrEqual(1)
    vi.advanceTimersByTime(1000)
    expect(rootS3Signals.length).toBeGreaterThanOrEqual(2)

    hb.stop()
    wiringCleanup()
    vi.useRealTimers()
  })

  it('signal hops record every room the signal passed through', () => {
    const { tree, rootId, aId } = twoLevelTree()
    const topo = computeRoomSubscriptions(tree)
    const cleanup = wireTopology(bus, topo)

    let captured = null
    bus.subscribe(roomChannel(rootId, 's5'), (s) => { captured = s })

    // A's S5 → Root's S5 (via s5-children subscription on Root's S5)
    publishToRoom(bus, aId, 's5', createSignal('metric', {}, {}))
    expect(captured).toBeTruthy()
    expect(captured.hops).toContain(`${aId}:s5`)       // origin
    expect(captured.hops).toContain(`${rootId}:s5`)     // forwarded destination
    cleanup()
  })

  it('outgoingTerminals gates which forwarders deliver (output routing)', () => {
    const { tree, rootId } = twoLevelTree()
    const topo = computeRoomSubscriptions(tree)
    const cleanup = wireTopology(bus, topo)

    // Publish from Root:s5 with outgoingTerminals restricted to 's3-in' only.
    // Root:s5 has an out-side edge to Root:s3 via 's3-in' terminal (source side).
    // Root:s5 also edges to Root:s4 via 's4-in' (source side) — this one should be blocked.
    const s3Count = []
    const s4Count = []
    bus.subscribe(roomChannel(rootId, 's3'), () => s3Count.push(1))
    bus.subscribe(roomChannel(rootId, 's4'), () => s4Count.push(1))

    const sig = createSignal('metric', {}, {})
    sig.outgoingTerminals = ['s3-in']
    publishToRoom(bus, rootId, 's5', sig)
    expect(s3Count.length).toBe(1)
    expect(s4Count.length).toBe(0)
    cleanup()
  })

  it('hops reflect the path to THIS subscriber, not the union of all forwarder paths', () => {
    // With shared mutable hops, a subscriber at room X could see hops ending at
    // some OTHER room Y because a sibling forwarder fired after delivery.
    // With cloned hops, each subscriber's hops must end at its own room.
    const { tree, rootId, aId } = twoLevelTree()
    const topo = computeRoomSubscriptions(tree)
    const cleanup = wireTopology(bus, topo)

    let rootS5Cap = null
    let aS3Cap = null
    bus.subscribe(roomChannel(rootId, 's5'), (s) => { rootS5Cap = s })
    bus.subscribe(roomChannel(aId, 's3'), (s) => { aS3Cap = s })

    publishToRoom(bus, aId, 's5', createSignal('metric', {}, {}))

    expect(rootS5Cap.hops[rootS5Cap.hops.length - 1]).toBe(`${rootId}:s5`)
    expect(aS3Cap.hops[aS3Cap.hops.length - 1]).toBe(`${aId}:s3`)
    cleanup()
  })
})
