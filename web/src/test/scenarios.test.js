// Large-scale scenario tests over the pure commands + queries + dispatcher.
//
// These are the "would the system survive a real session" checks: full
// lifecycles, multi-step composition, regression coverage for the kind of
// state that's hard to spot in unit tests.
//
// Run before B3b runtime swap so we know the model layer is healthy.

import { describe, it, expect, vi } from 'vitest'
import {
  addCable, removeCable, pruneCablesByRoom, pruneCablesByProcessor,
  addProcessor, removeProcessor, updateProcessorFilters, updateProcessorConfig,
  setProcessorBroadcast, pruneProcessorsByRoom,
} from '../commands'
import {
  listCables, listInternalCables, listTerminalCables,
  findCablesFromPort, usedPortKeys, listProcessors, liveProcessorIdsByRoom,
} from '../queries'
import { createDispatcher } from '../signals/dispatcher'
import { createSignal } from '../signals/signal'

const room = { nodeId: 'n1', systemKey: 's3' }
const key = `${room.nodeId}:${room.systemKey}`

// ---------------------------------------------------------------------------
// Lifecycle: build → tear down
// ---------------------------------------------------------------------------

describe('scenario: full room lifecycle', () => {
  it('add processors → cables → broadcast → remove processor → remove room, all state pruned correctly', () => {
    let processors = {}
    let cables = {}

    // 1. Add three processors: heartbeat (source), tracer (relay), logger (sink)
    let r
    ;({ processors, result: r } = addProcessor(processors, { ...room, defId: 'heartbeat' }))
    const hbId = r.instanceId
    ;({ processors, result: r } = addProcessor(processors, { ...room, defId: 'tracer' }))
    const trId = r.instanceId
    ;({ processors, result: r } = addProcessor(processors, { ...room, defId: 'logger' }))
    const lgId = r.instanceId
    expect(listProcessors(processors, room)).toHaveLength(3)

    // 2. Cable them up: heartbeat.out1 → tracer.in1 → logger.in1
    ;({ cables } = addCable(cables, {
      ...room,
      source: { kind: 'jack', instanceId: hbId, portId: 'out1' },
      target: { kind: 'jack', instanceId: trId, portId: 'in1' },
    }))
    ;({ cables } = addCable(cables, {
      ...room,
      source: { kind: 'jack', instanceId: trId, portId: 'out1' },
      target: { kind: 'jack', instanceId: lgId, portId: 'in1' },
    }))
    expect(listInternalCables(cables, room)).toHaveLength(2)
    expect(listTerminalCables(cables, room)).toHaveLength(0)

    // 3. Add an external cable from tracer to a terminal (multi-room reach)
    ;({ cables } = addCable(cables, {
      ...room,
      source: { kind: 'jack', instanceId: trId, portId: 'out2' },
      target: { kind: 'terminal', terminalId: 's4-out' },
    }))
    expect(listInternalCables(cables, room)).toHaveLength(2)
    expect(listTerminalCables(cables, room)).toHaveLength(1)

    // 4. Toggle broadcast on heartbeat — cables remain untouched
    ;({ processors } = setProcessorBroadcast(processors, { ...room, instanceId: hbId, broadcast: true }))
    expect(listProcessors(processors, room).find(p => p.id === hbId).broadcast).toBe(true)
    expect(listCables(cables, room)).toHaveLength(3)

    // 5. Remove the tracer — cables touching tracer must be auto-pruned
    ;({ processors } = removeProcessor(processors, { ...room, instanceId: trId }))
    ;({ cables } = pruneCablesByProcessor(cables, liveProcessorIdsByRoom(processors)))
    expect(listProcessors(processors, room)).toHaveLength(2)
    // Both internal cables involved tracer; the external (jack→terminal) was
    // also tracer-sourced. All three should be gone.
    expect(listCables(cables, room)).toHaveLength(0)

    // 6. Remove the whole room (simulate tree node deletion)
    const liveRooms = new Set() // no rooms left
    ;({ processors } = pruneProcessorsByRoom(processors, liveRooms))
    ;({ cables } = pruneCablesByRoom(cables, liveRooms))
    expect(processors[key]).toBeUndefined()
    expect(cables[key]).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Permasync invariants — the load-bearing claim of the architecture
// ---------------------------------------------------------------------------

describe('scenario: switchboard ↔ rack permasync invariants', () => {
  it('a cable added once is visible to every query that should see it', () => {
    const cable = {
      source: { kind: 'jack', instanceId: 'A', portId: 'out1' },
      target: { kind: 'jack', instanceId: 'B', portId: 'in1' },
    }
    const { cables } = addCable({}, { ...room, ...cable })

    expect(listCables(cables, room)).toHaveLength(1)
    expect(listInternalCables(cables, room)).toHaveLength(1)
    expect(listTerminalCables(cables, room)).toHaveLength(0)
    expect(findCablesFromPort(cables, { ...room, instanceId: 'A', portId: 'out1' })).toHaveLength(1)
    expect(usedPortKeys(cables, { ...room, side: 'source' }).has('A:out1')).toBe(true)
    expect(usedPortKeys(cables, { ...room, side: 'target' }).has('B:in1')).toBe(true)
  })

  it('removing a cable clears every derived view in lockstep', () => {
    const { cables: c1, result } = addCable({}, {
      ...room,
      source: { kind: 'jack', instanceId: 'A', portId: 'out1' },
      target: { kind: 'jack', instanceId: 'B', portId: 'in1' },
    })
    const { cables: c2 } = removeCable(c1, { ...room, cableId: result.cableId })
    expect(listCables(c2, room)).toHaveLength(0)
    expect(listInternalCables(c2, room)).toHaveLength(0)
    expect(usedPortKeys(c2, { ...room, side: 'source' }).size).toBe(0)
  })

  it('broadcast flag does not leak into the cable graph', () => {
    let processors = {}
    let r
    ;({ processors, result: r } = addProcessor(processors, { ...room, defId: 'heartbeat' }))
    const id = r.instanceId

    let cables = {}
    ;({ cables } = addCable(cables, {
      ...room,
      source: { kind: 'jack', instanceId: id, portId: 'out1' },
      target: { kind: 'terminal', terminalId: 's4-out' },
    }))
    const before = JSON.stringify(cables)
    ;({ processors } = setProcessorBroadcast(processors, { ...room, instanceId: id, broadcast: true }))
    expect(JSON.stringify(cables)).toBe(before) // cables unchanged
    ;({ processors } = setProcessorBroadcast(processors, { ...room, instanceId: id, broadcast: false }))
    expect(JSON.stringify(cables)).toBe(before) // still unchanged
  })
})

// ---------------------------------------------------------------------------
// Composition — chained commands compose to the same state
// ---------------------------------------------------------------------------

describe('scenario: command composition is deterministic', () => {
  it('replaying the same command sequence produces identical state', () => {
    const replay = (steps) => {
      let processors = {}
      let cables = {}
      const ids = {}
      for (const step of steps) {
        if (step.kind === 'addProc') {
          const out = addProcessor(processors, { ...room, defId: step.defId })
          processors = out.processors
          ids[step.alias] = out.result.instanceId
        } else if (step.kind === 'addCable') {
          const out = addCable(cables, {
            ...room,
            source: { ...step.source, instanceId: ids[step.source.alias] || step.source.instanceId },
            target: { ...step.target, instanceId: ids[step.target.alias] || step.target.instanceId },
          })
          cables = out.cables
        } else if (step.kind === 'broadcast') {
          const out = setProcessorBroadcast(processors, { ...room, instanceId: ids[step.alias], broadcast: step.value })
          processors = out.processors
        } else if (step.kind === 'updateConfig') {
          const out = updateProcessorConfig(processors, { ...room, instanceId: ids[step.alias], configPatch: step.patch })
          processors = out.processors
        }
      }
      return { processors, cables, ids }
    }
    const steps = [
      { kind: 'addProc', defId: 'heartbeat', alias: 'hb' },
      { kind: 'addProc', defId: 'logger',    alias: 'lg' },
      { kind: 'addCable', source: { kind: 'jack', alias: 'hb', portId: 'out1' },
                          target: { kind: 'jack', alias: 'lg', portId: 'in1' } },
      { kind: 'broadcast', alias: 'hb', value: true },
      { kind: 'updateConfig', alias: 'hb', patch: { intervalMs: 500 } },
    ]
    const a = replay(steps)
    const b = replay(steps)
    // Instance ids will differ (uuid), but structure should be identical:
    expect(listProcessors(a.processors, room).length).toBe(listProcessors(b.processors, room).length)
    expect(listCables(a.cables, room).length).toBe(listCables(b.cables, room).length)
    expect(listProcessors(a.processors, room).find(p => p.id === a.ids.hb).broadcast).toBe(true)
    expect(listProcessors(b.processors, room).find(p => p.id === b.ids.hb).broadcast).toBe(true)
    expect(listProcessors(a.processors, room).find(p => p.id === a.ids.hb).config.intervalMs).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// Dispatcher: realistic small flows. Pre-validates B3b will land cleanly.
// ---------------------------------------------------------------------------

describe('scenario: dispatcher replicates broadcast/cable behavior', () => {
  function setup() {
    const inboxes = {}
    const onTerminal = vi.fn()
    const d = createDispatcher({ onTerminal })
    const register = (id, roomKey = key) => {
      inboxes[id] = []
      d.registerProcessor(id, {
        roomKey,
        inputHandler: ({ signal, portId }) => inboxes[id].push({ signal, portId }),
      })
    }
    return { d, inboxes, onTerminal, register }
  }

  it('chain heartbeat → tracer → logger via cables, signal arrives at logger', () => {
    const { d, inboxes, register } = setup()
    register('hb')
    register('tr')
    register('lg')
    d.setCables({
      [key]: [
        { id: 'c1', source: { kind: 'jack', instanceId: 'hb', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'tr', portId: 'in1' } },
        { id: 'c2', source: { kind: 'jack', instanceId: 'tr', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'lg', portId: 'in1' } },
      ],
    })
    // Tracer's input handler simulates pass-through: re-emit on out1
    d.registerProcessor('tr', {
      roomKey: key,
      inputHandler: ({ signal }) => {
        inboxes.tr.push({ signal })
        d.emit(signal, { fromInstanceId: 'tr', fromPortId: 'out1' })
      },
    })
    d.emit(createSignal('metric', { v: 1 }, {}), { fromInstanceId: 'hb', fromPortId: 'out1' })
    expect(inboxes.tr).toHaveLength(1)
    expect(inboxes.lg).toHaveLength(1)
  })

  it('broadcasting heartbeat reaches all room terminals AND keeps internal jack→jack live', () => {
    const { d, inboxes, onTerminal, register } = setup()
    register('hb')
    register('lg') // local logger
    d.setRoomTerminals({ [key]: ['s4-out', 's5-out', 'audit'] })
    d.setBroadcast('hb', true)
    d.setCables({
      [key]: [
        { id: 'c1', source: { kind: 'jack', instanceId: 'hb', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'lg', portId: 'in1' } },
      ],
    })
    d.emit(createSignal('metric', { v: 1 }, {}), { fromInstanceId: 'hb', fromPortId: 'out1' })
    // Internal cable fires
    expect(inboxes.lg).toHaveLength(1)
    // All three terminals fire
    expect(onTerminal).toHaveBeenCalledTimes(3)
    expect(new Set(onTerminal.mock.calls.map(c => c[1]))).toEqual(new Set(['s4-out', 's5-out', 'audit']))
  })

  it('signal carries the same id across hops, dedup blocks diamond double-delivery', () => {
    // hb → tr1, hb → tr2, both → lg. Dedup should ensure lg gets exactly one.
    const { d, inboxes, register } = setup()
    register('hb')
    register('lg')
    d.setCables({
      [key]: [
        { id: 'c1', source: { kind: 'jack', instanceId: 'hb', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'tr1', portId: 'in1' } },
        { id: 'c2', source: { kind: 'jack', instanceId: 'hb', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'tr2', portId: 'in1' } },
        { id: 'c3', source: { kind: 'jack', instanceId: 'tr1', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'lg', portId: 'in1' } },
        { id: 'c4', source: { kind: 'jack', instanceId: 'tr2', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'lg', portId: 'in1' } },
      ],
    })
    const passThru = (id) => ({
      roomKey: key,
      inputHandler: ({ signal }) => d.emit(signal, { fromInstanceId: id, fromPortId: 'out1' }),
    })
    d.registerProcessor('tr1', passThru('tr1'))
    d.registerProcessor('tr2', passThru('tr2'))
    d.emit(createSignal('metric', { v: 1 }, {}), { fromInstanceId: 'hb', fromPortId: 'out1' })
    expect(inboxes.lg).toHaveLength(1) // dedup at lg
  })

  it('cross-room terminal hop: emit in room A → onTerminal → deliverFromTerminal in room B', () => {
    // Two rooms: r1:s3 and r2:s5. Topology says terminal "to-s5" in r1:s3
    // peers terminal "from-s3" in r2:s5.
    const inboxes = {}
    const topology = { 'r1:s3:to-s5': { roomKey: 'r2:s5', terminalId: 'from-s3' } }
    const d = createDispatcher({
      onTerminal: (fromRoomKey, terminalId, signal, hopCount) => {
        const peer = topology[`${fromRoomKey}:${terminalId}`]
        if (peer) d.deliverFromTerminal(peer.roomKey, peer.terminalId, signal, hopCount)
      },
    })
    const register = (id, roomKey) => {
      inboxes[id] = []
      d.registerProcessor(id, {
        roomKey,
        inputHandler: ({ signal, portId }) => inboxes[id].push({ signal, portId }),
      })
    }
    register('hb', 'r1:s3')
    register('lg', 'r2:s5')
    d.setCables({
      'r1:s3': [
        { id: 'c1', source: { kind: 'jack', instanceId: 'hb', portId: 'out1' },
                    target: { kind: 'terminal', terminalId: 'to-s5' } },
      ],
      'r2:s5': [
        { id: 'c2', source: { kind: 'terminal', terminalId: 'from-s3' },
                    target: { kind: 'jack', instanceId: 'lg', portId: 'in1' } },
      ],
    })
    d.emit(createSignal('metric', {}, {}), { fromInstanceId: 'hb', fromPortId: 'out1' })
    expect(inboxes.lg).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Backward-compat: legacy on-disk shapes load without errors
// ---------------------------------------------------------------------------

describe('scenario: legacy state shapes load cleanly', () => {
  it('processor with old inputTerminals/outputTerminals filter loads (fields ignored)', () => {
    // Pretend we loaded an old YAML with the legacy filter shape.
    const legacyProcessors = {
      [key]: [{
        id: 'old-1',
        defId: 'logger',
        config: {},
        filters: { types: ['metric'], tags: null, inputTerminals: ['s5-out'], outputTerminals: null },
      }],
    }
    // Update should preserve the new fields and just leave the legacy ones in
    // place (they'll be normalized away on next normalizeFilters call).
    const { processors, result } = updateProcessorFilters(legacyProcessors, {
      ...room, instanceId: 'old-1', patch: { types: ['alert'] },
    })
    expect(result.ok).toBe(true)
    expect(processors[key][0].filters.types).toEqual(['alert'])
  })

  it('processor with broadcast in legacy config.broadcast is not auto-migrated', () => {
    // We chose a hard break in B2 — old config.broadcast values are simply
    // ignored. This test pins that decision so anyone restoring backward-
    // compat later sees the test fail and reconsiders.
    const legacy = {
      [key]: [{ id: 'old-1', defId: 'heartbeat', config: { intervalMs: 1000, broadcast: true }, filters: {} }],
    }
    const inst = listProcessors(legacy, room)[0]
    expect(inst.broadcast).toBeUndefined() // top-level NOT auto-set from config
    expect(inst.config.broadcast).toBe(true) // legacy value preserved (ignored at runtime)
  })
})
