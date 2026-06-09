import { describe, it, expect } from 'vitest'
import {
  addCable, removeCable, pruneCablesByRoom, pruneCablesByProcessor,
  addProcessor, removeProcessor, updateProcessorFilters, updateProcessorConfig,
  setProcessorBroadcast,
} from '../commands'
import { liveProcessorIdsByRoom, listInternalCables, usedPortKeys } from '../queries'

const room = { nodeId: 'n1', systemKey: 's3' }
const key = `${room.nodeId}:${room.systemKey}`

describe('cable commands', () => {
  it('addCable inserts a cable with a generated id and returns it', () => {
    const { cables, result } = addCable({}, {
      ...room,
      source: { kind: 'jack', instanceId: 'i1', portId: 'out1' },
      target: { kind: 'jack', instanceId: 'i2', portId: 'in1' },
      color: '#000',
    })
    expect(result.ok).toBe(true)
    expect(cables[key]).toHaveLength(1)
    expect(cables[key][0].id).toMatch(/^c-/)
    expect(cables[key][0].source.instanceId).toBe('i1')
  })

  it('addCable refuses without source/target', () => {
    const { result } = addCable({}, { ...room, source: null, target: null })
    expect(result.ok).toBe(false)
  })

  it('removeCable returns ok:false when cable not found', () => {
    const { result } = removeCable({}, { ...room, cableId: 'nope' })
    expect(result.ok).toBe(false)
  })

  it('pruneCablesByRoom drops keys not in liveRoomKeys', () => {
    const cables = { 'a:s1': [{ id: 'c1' }], 'b:s2': [{ id: 'c2' }] }
    const { cables: next } = pruneCablesByRoom(cables, new Set(['a:s1']))
    expect(Object.keys(next)).toEqual(['a:s1'])
  })

  it('pruneCablesByProcessor drops cables whose jack endpoint vanished', () => {
    const cables = {
      [key]: [
        { id: 'c1', source: { kind: 'jack', instanceId: 'i1', portId: 'out1' }, target: { kind: 'jack', instanceId: 'i2', portId: 'in1' } },
        { id: 'c2', source: { kind: 'jack', instanceId: 'gone', portId: 'out1' }, target: { kind: 'jack', instanceId: 'i2', portId: 'in1' } },
      ],
    }
    const live = { [key]: new Set(['i1', 'i2']) }
    const { cables: next } = pruneCablesByProcessor(cables, live)
    expect(next[key]).toHaveLength(1)
    expect(next[key][0].id).toBe('c1')
  })
})

describe('processor commands', () => {
  it('addProcessor refuses unknown defId', () => {
    const { result } = addProcessor({}, { ...room, defId: 'not-a-real-thing' })
    expect(result.ok).toBe(false)
  })

  it('addProcessor inserts a heartbeat with config defaults merged', () => {
    const { processors, result } = addProcessor({}, { ...room, defId: 'heartbeat', config: { intervalMs: 500 } })
    expect(result.ok).toBe(true)
    expect(processors[key]).toHaveLength(1)
    expect(processors[key][0].defId).toBe('heartbeat')
    expect(processors[key][0].config.intervalMs).toBe(500)
  })

  it('removeProcessor finds and removes by id', () => {
    const { processors: p1, result: r1 } = addProcessor({}, { ...room, defId: 'heartbeat' })
    const id = r1.instanceId
    const { processors: p2, result: r2 } = removeProcessor(p1, { ...room, instanceId: id })
    expect(r2.ok).toBe(true)
    expect(p2[key]).toHaveLength(0)
  })

  it('updateProcessorFilters merges patch onto filters', () => {
    const { processors: p1, result: r1 } = addProcessor({}, { ...room, defId: 'tracer' })
    const { processors: p2 } = updateProcessorFilters(p1, { ...room, instanceId: r1.instanceId, patch: { types: ['metric'] } })
    expect(p2[key][0].filters.types).toEqual(['metric'])
  })

  it('updateProcessorConfig merges patch onto config', () => {
    const { processors: p1, result: r1 } = addProcessor({}, { ...room, defId: 'heartbeat' })
    const { processors: p2 } = updateProcessorConfig(p1, { ...room, instanceId: r1.instanceId, configPatch: { intervalMs: 999 } })
    expect(p2[key][0].config.intervalMs).toBe(999)
  })

  it('setProcessorBroadcast sets the top-level broadcast flag', () => {
    const { processors: p1, result: r1 } = addProcessor({}, { ...room, defId: 'heartbeat' })
    expect(p1[key][0].broadcast).toBeUndefined()
    const { processors: p2 } = setProcessorBroadcast(p1, { ...room, instanceId: r1.instanceId, broadcast: true })
    expect(p2[key][0].broadcast).toBe(true)
    const { processors: p3 } = setProcessorBroadcast(p2, { ...room, instanceId: r1.instanceId, broadcast: false })
    expect(p3[key][0].broadcast).toBe(false)
  })
})

describe('queries', () => {
  it('liveProcessorIdsByRoom returns sets keyed by roomKey', () => {
    const { processors } = addProcessor({}, { ...room, defId: 'heartbeat' })
    const live = liveProcessorIdsByRoom(processors)
    expect(live[key]).toBeInstanceOf(Set)
    expect(live[key].size).toBe(1)
  })

  it('listInternalCables filters jack→jack only', () => {
    let cables = {}
    ;({ cables } = addCable(cables, {
      ...room,
      source: { kind: 'jack', instanceId: 'i1', portId: 'out1' },
      target: { kind: 'jack', instanceId: 'i2', portId: 'in1' },
    }))
    ;({ cables } = addCable(cables, {
      ...room,
      source: { kind: 'jack', instanceId: 'i1', portId: 'out2' },
      target: { kind: 'terminal', terminalId: 's3-out' },
    }))
    expect(listInternalCables(cables, room)).toHaveLength(1)
  })

  it('usedPortKeys reports source-side jacks in use', () => {
    let cables = {}
    ;({ cables } = addCable(cables, {
      ...room,
      source: { kind: 'jack', instanceId: 'i1', portId: 'out1' },
      target: { kind: 'jack', instanceId: 'i2', portId: 'in1' },
    }))
    const used = usedPortKeys(cables, { ...room, side: 'source' })
    expect(used.has('i1:out1')).toBe(true)
    expect(used.size).toBe(1)
  })
})
