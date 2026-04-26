import { describe, it, expect, vi } from 'vitest'
import { createDispatcher } from '../signals/dispatcher'

const sig = (id, extra = {}) => ({ id, type: 'metric', tags: [], ...extra })

function setup(opts = {}) {
  const onTerminal = vi.fn()
  const d = createDispatcher({ onTerminal, ...opts })
  const inboxes = {} // instanceId → [{signal, portId}]
  const register = (instanceId, roomKey) => {
    inboxes[instanceId] = []
    d.registerProcessor(instanceId, {
      roomKey,
      inputHandler: ({ signal, portId }) => inboxes[instanceId].push({ signal, portId }),
    })
  }
  return { d, onTerminal, inboxes, register }
}

describe('createDispatcher — internal cable routing', () => {
  it('delivers a jack→jack cable to the target processor', () => {
    const { d, inboxes, register } = setup()
    register('A', 'r1:s3')
    register('B', 'r1:s3')
    d.setCables({
      'r1:s3': [
        { id: 'c1', source: { kind: 'jack', instanceId: 'A', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'B', portId: 'in1' } },
      ],
    })
    d.emit(sig('s1'), { fromInstanceId: 'A', fromPortId: 'out1' })
    expect(inboxes.B).toHaveLength(1)
    expect(inboxes.B[0].portId).toBe('in1')
    expect(inboxes.B[0].signal.hopCount).toBe(1)
  })

  it('does not deliver when no cable sources from this jack', () => {
    const { d, inboxes, register } = setup()
    register('A', 'r1:s3')
    register('B', 'r1:s3')
    d.setCables({
      'r1:s3': [
        { id: 'c1', source: { kind: 'jack', instanceId: 'A', portId: 'out2' },
                    target: { kind: 'jack', instanceId: 'B', portId: 'in1' } },
      ],
    })
    d.emit(sig('s1'), { fromInstanceId: 'A', fromPortId: 'out1' })
    expect(inboxes.B).toHaveLength(0)
  })

  it('fans out to multiple jack targets from one source', () => {
    const { d, inboxes, register } = setup()
    register('A', 'r1:s3')
    register('B', 'r1:s3')
    register('C', 'r1:s3')
    d.setCables({
      'r1:s3': [
        { id: 'c1', source: { kind: 'jack', instanceId: 'A', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'B', portId: 'in1' } },
        { id: 'c2', source: { kind: 'jack', instanceId: 'A', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'C', portId: 'in1' } },
      ],
    })
    d.emit(sig('s1'), { fromInstanceId: 'A', fromPortId: 'out1' })
    expect(inboxes.B).toHaveLength(1)
    expect(inboxes.C).toHaveLength(1)
  })

  it('dedups: a signal id arriving via two paths fires the handler once', () => {
    const { d, inboxes, register } = setup()
    register('A', 'r1:s3')
    register('B', 'r1:s3')
    register('C', 'r1:s3')
    // A→B and A→C, then B→C and B's handler also re-emits
    d.setCables({
      'r1:s3': [
        { id: 'c1', source: { kind: 'jack', instanceId: 'A', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'C', portId: 'in1' } },
        { id: 'c2', source: { kind: 'jack', instanceId: 'A', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'B', portId: 'in1' } },
        { id: 'c3', source: { kind: 'jack', instanceId: 'B', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'C', portId: 'in1' } },
      ],
    })
    // Simulate B re-emitting on receipt: dedup at C should kick in.
    d.registerProcessor('B', {
      roomKey: 'r1:s3',
      inputHandler: ({ signal }) => {
        d.emit(signal, { fromInstanceId: 'B', fromPortId: 'out1' })
      },
    })
    inboxes.B = [] // re-init after re-register
    d.emit(sig('s1'), { fromInstanceId: 'A', fromPortId: 'out1' })
    expect(inboxes.C).toHaveLength(1) // direct A→C OR via B→C, not both
  })
})

describe('createDispatcher — broadcast', () => {
  it('broadcast=true fires onTerminal for every room terminal', () => {
    const { d, onTerminal, register } = setup()
    register('A', 'r1:s3')
    d.setRoomTerminals({ 'r1:s3': ['t1', 't2', 't3'] })
    d.setBroadcast('A', true)
    d.emit(sig('s1'), { fromInstanceId: 'A', fromPortId: 'out1' })
    expect(onTerminal).toHaveBeenCalledTimes(3)
    expect(onTerminal.mock.calls.map(c => c[1])).toEqual(['t1', 't2', 't3'])
  })

  it('broadcast=true still fires internal jack→jack cables', () => {
    const { d, inboxes, register } = setup()
    register('A', 'r1:s3')
    register('B', 'r1:s3')
    d.setCables({
      'r1:s3': [
        { id: 'c1', source: { kind: 'jack', instanceId: 'A', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'B', portId: 'in1' } },
      ],
    })
    d.setRoomTerminals({ 'r1:s3': ['t1'] })
    d.setBroadcast('A', true)
    d.emit(sig('s1'), { fromInstanceId: 'A', fromPortId: 'out1' })
    expect(inboxes.B).toHaveLength(1) // internal cable still fires
  })

  it('broadcast=true overrides external jack→terminal cables (broadcast wins)', () => {
    const { d, onTerminal, register } = setup()
    register('A', 'r1:s3')
    d.setCables({
      'r1:s3': [
        // External cable to t1 — would normally fire.
        { id: 'c1', source: { kind: 'jack', instanceId: 'A', portId: 'out1' },
                    target: { kind: 'terminal', terminalId: 't1' } },
      ],
    })
    d.setRoomTerminals({ 'r1:s3': ['t1', 't2'] })
    d.setBroadcast('A', true)
    d.emit(sig('s1'), { fromInstanceId: 'A', fromPortId: 'out1' })
    // Expect t1 + t2 (broadcast), not t1 twice.
    expect(onTerminal).toHaveBeenCalledTimes(2)
    expect(new Set(onTerminal.mock.calls.map(c => c[1]))).toEqual(new Set(['t1', 't2']))
  })

  it('broadcast=false fires only declared external cables', () => {
    const { d, onTerminal, register } = setup()
    register('A', 'r1:s3')
    d.setCables({
      'r1:s3': [
        { id: 'c1', source: { kind: 'jack', instanceId: 'A', portId: 'out1' },
                    target: { kind: 'terminal', terminalId: 't1' } },
      ],
    })
    d.setRoomTerminals({ 'r1:s3': ['t1', 't2', 't3'] })
    d.emit(sig('s1'), { fromInstanceId: 'A', fromPortId: 'out1' })
    expect(onTerminal).toHaveBeenCalledTimes(1)
    expect(onTerminal.mock.calls[0][1]).toBe('t1')
  })
})

describe('createDispatcher — hop cap', () => {
  it('drops a signal once hopCount reaches the cap', () => {
    const { d, inboxes, register } = setup({ hopCap: 3 })
    register('A', 'r1:s3')
    register('B', 'r1:s3')
    d.setCables({
      'r1:s3': [
        { id: 'c1', source: { kind: 'jack', instanceId: 'A', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'B', portId: 'in1' } },
      ],
    })
    // Already at cap — must drop.
    d.emit(sig('s1', { hopCount: 3 }), { fromInstanceId: 'A', fromPortId: 'out1' })
    expect(inboxes.B).toHaveLength(0)
  })

  it('terminates a self-feeding cycle in bounded time', () => {
    // A→B and B→A in a cycle. B's handler re-emits on its out1.
    // Should terminate after ~hopCap deliveries.
    const onTerminal = vi.fn()
    const d = createDispatcher({ onTerminal, hopCap: 8 })
    let count = 0
    d.registerProcessor('A', {
      roomKey: 'r1:s3',
      inputHandler: ({ signal }) => {
        count++
        d.emit(signal, { fromInstanceId: 'A', fromPortId: 'out1' })
      },
    })
    d.registerProcessor('B', {
      roomKey: 'r1:s3',
      inputHandler: ({ signal }) => {
        count++
        d.emit(signal, { fromInstanceId: 'B', fromPortId: 'out1' })
      },
    })
    d.setCables({
      'r1:s3': [
        { id: 'c1', source: { kind: 'jack', instanceId: 'A', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'B', portId: 'in1' } },
        { id: 'c2', source: { kind: 'jack', instanceId: 'B', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'A', portId: 'in1' } },
      ],
    })
    // Two-cable cycle is dedupe-trapped on the second visit — that's the
    // primary termination, hop cap is the safety net.
    d.emit(sig('s1'), { fromInstanceId: 'A', fromPortId: 'out1' })
    expect(count).toBeLessThanOrEqual(8)
  })

  it('a fresh signal id traverses the cycle anew (each id capped independently)', () => {
    const onTerminal = vi.fn()
    const d = createDispatcher({ onTerminal, hopCap: 4 })
    let count = 0
    const handler = (instId) => ({ signal }) => {
      count++
      d.emit({ ...signal, id: signal.id }, { fromInstanceId: instId, fromPortId: 'out1' })
    }
    d.registerProcessor('A', { roomKey: 'r1:s3', inputHandler: handler('A') })
    d.registerProcessor('B', { roomKey: 'r1:s3', inputHandler: handler('B') })
    d.setCables({
      'r1:s3': [
        { id: 'c1', source: { kind: 'jack', instanceId: 'A', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'B', portId: 'in1' } },
        { id: 'c2', source: { kind: 'jack', instanceId: 'B', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'A', portId: 'in1' } },
      ],
    })
    d.emit(sig('first'),  { fromInstanceId: 'A', fromPortId: 'out1' })
    const afterFirst = count
    d.emit(sig('second'), { fromInstanceId: 'A', fromPortId: 'out1' })
    expect(count).toBeGreaterThan(afterFirst) // second signal also traversed
  })
})

describe('createDispatcher — cross-room via terminal', () => {
  it('jack→terminal calls onTerminal hook with room + terminal info', () => {
    const { d, onTerminal, register } = setup()
    register('A', 'r1:s3')
    d.setCables({
      'r1:s3': [
        { id: 'c1', source: { kind: 'jack', instanceId: 'A', portId: 'out1' },
                    target: { kind: 'terminal', terminalId: 's3-out' } },
      ],
    })
    const s = sig('s1')
    d.emit(s, { fromInstanceId: 'A', fromPortId: 'out1' })
    expect(onTerminal).toHaveBeenCalledTimes(1)
    expect(onTerminal).toHaveBeenCalledWith('r1:s3', 's3-out', s, 1)
  })

  it('deliverFromTerminal walks terminal-sourced cables in target room', () => {
    const { d, inboxes, register } = setup()
    register('B', 'r2:s3')
    d.setCables({
      'r2:s3': [
        { id: 'c1', source: { kind: 'terminal', terminalId: 's5-parent' },
                    target: { kind: 'jack', instanceId: 'B', portId: 'in1' } },
      ],
    })
    d.deliverFromTerminal('r2:s3', 's5-parent', sig('s1'), 1)
    expect(inboxes.B).toHaveLength(1)
    expect(inboxes.B[0].signal.hopCount).toBe(2)
  })
})

describe('createDispatcher — register/unregister', () => {
  it('unregistered processor is unreachable', () => {
    const { d, inboxes, register } = setup()
    register('A', 'r1:s3')
    register('B', 'r1:s3')
    d.setCables({
      'r1:s3': [
        { id: 'c1', source: { kind: 'jack', instanceId: 'A', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'B', portId: 'in1' } },
      ],
    })
    d.unregisterProcessor('B')
    inboxes.B.length = 0
    d.emit(sig('s1'), { fromInstanceId: 'A', fromPortId: 'out1' })
    expect(inboxes.B).toHaveLength(0)
  })
})
