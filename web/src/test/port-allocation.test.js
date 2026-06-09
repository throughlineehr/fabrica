import { describe, it, expect } from 'vitest'
import { nextFreeOutputPort, nextFreeInputPort } from '../components/rack/portAllocation'

const heartbeatLike = {
  ports: {
    inputs: [],
    outputs: Array.from({ length: 4 }, (_, i) => ({ id: `out${i + 1}`, label: String(i + 1) })),
  },
}

const inputOnly = {
  ports: {
    inputs: Array.from({ length: 3 }, (_, i) => ({ id: `in${i + 1}`, label: String(i + 1) })),
    outputs: [],
  },
}

describe('nextFreeOutputPort', () => {
  it('returns null when the processor has no outputs', () => {
    expect(nextFreeOutputPort([], 'i1', inputOnly)).toEqual({ portId: null, allTaken: false })
  })

  it('returns the first port when no cables exist', () => {
    expect(nextFreeOutputPort([], 'i1', heartbeatLike)).toEqual({ portId: 'out1', allTaken: false })
  })

  it('skips ports already used by an existing cable', () => {
    const cables = [
      { id: 'c1', source: { kind: 'jack', instanceId: 'i1', portId: 'out1' }, target: { kind: 'jack', instanceId: 'i2', portId: 'in1' } },
      { id: 'c2', source: { kind: 'jack', instanceId: 'i1', portId: 'out2' }, target: { kind: 'jack', instanceId: 'i2', portId: 'in2' } },
    ]
    expect(nextFreeOutputPort(cables, 'i1', heartbeatLike)).toEqual({ portId: 'out3', allTaken: false })
  })

  it('returns first port + allTaken:true when every output is used', () => {
    const cables = heartbeatLike.ports.outputs.map((p, i) => ({
      id: `c${i}`,
      source: { kind: 'jack', instanceId: 'i1', portId: p.id },
      target: { kind: 'jack', instanceId: 'iX', portId: 'in1' },
    }))
    expect(nextFreeOutputPort(cables, 'i1', heartbeatLike)).toEqual({ portId: 'out1', allTaken: true })
  })

  it('only counts cables for the given instance', () => {
    const cables = [
      { id: 'c1', source: { kind: 'jack', instanceId: 'OTHER', portId: 'out1' }, target: { kind: 'jack', instanceId: 'iX', portId: 'in1' } },
    ]
    expect(nextFreeOutputPort(cables, 'i1', heartbeatLike).portId).toBe('out1')
  })

  it('ignores terminal-source cables', () => {
    const cables = [
      { id: 'c1', source: { kind: 'terminal', terminalId: 's2-out' }, target: { kind: 'jack', instanceId: 'i1', portId: 'out1' } },
    ]
    expect(nextFreeOutputPort(cables, 'i1', heartbeatLike).portId).toBe('out1')
  })
})

describe('nextFreeInputPort', () => {
  it('returns the first input when none used', () => {
    expect(nextFreeInputPort([], 'i1', inputOnly)).toEqual({ portId: 'in1', allTaken: false })
  })

  it('skips inputs already used as a cable target', () => {
    const cables = [
      { id: 'c1', source: { kind: 'jack', instanceId: 'iY', portId: 'out1' }, target: { kind: 'jack', instanceId: 'i1', portId: 'in1' } },
    ]
    expect(nextFreeInputPort(cables, 'i1', inputOnly).portId).toBe('in2')
  })
})
