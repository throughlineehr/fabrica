import { describe, it, expect } from 'vitest'
import { createBus } from '../signals/bus'
import { createSignal } from '../signals/signal'
import { getProcessorDef } from '../signals/library'
import { createDispatcher } from '../signals/dispatcher'

const ROOM = 'r:s3'

describe('splitter', () => {
  it('forwards an input signal to every cabled output unchanged', () => {
    const bus = createBus()
    const dispatcher = createDispatcher({ onTerminal: () => {} })
    // Three downstream sinks
    const a = [], b = [], c = []
    dispatcher.registerProcessor('a', { roomKey: ROOM, inputHandler: ({ signal }) => a.push(signal) })
    dispatcher.registerProcessor('b', { roomKey: ROOM, inputHandler: ({ signal }) => b.push(signal) })
    dispatcher.registerProcessor('c', { roomKey: ROOM, inputHandler: ({ signal }) => c.push(signal) })
    const def = getProcessorDef('splitter')
    const inst = def.create({}, {
      bus, dispatcher, instanceId: 's', roomNodeId: 'r', roomSystemKey: 's3', filters: {},
    })
    dispatcher.registerProcessor('s', { roomKey: ROOM, inputHandler: inst.onInput })
    dispatcher.setCables({
      [ROOM]: [
        { id: 'c1', source: { kind: 'jack', instanceId: 's', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'a', portId: 'in' } },
        { id: 'c2', source: { kind: 'jack', instanceId: 's', portId: 'out2' },
                    target: { kind: 'jack', instanceId: 'b', portId: 'in' } },
        { id: 'c3', source: { kind: 'jack', instanceId: 's', portId: 'out3' },
                    target: { kind: 'jack', instanceId: 'c', portId: 'in' } },
      ],
    })
    inst.start()

    const sig = createSignal('metric', { value: 42 }, {})
    inst.onInput({ signal: sig })

    expect(a).toHaveLength(1); expect(b).toHaveLength(1); expect(c).toHaveLength(1)
    expect(a[0].id).toBe(sig.id)
    expect(b[0].content.value).toBe(42)
    expect(c[0].type).toBe('metric')
  })

  it('uncabled outputs are silent (no-op)', () => {
    const bus = createBus()
    const dispatcher = createDispatcher({ onTerminal: () => {} })
    const a = []
    dispatcher.registerProcessor('a', { roomKey: ROOM, inputHandler: ({ signal }) => a.push(signal) })
    const def = getProcessorDef('splitter')
    const inst = def.create({}, {
      bus, dispatcher, instanceId: 's', roomNodeId: 'r', roomSystemKey: 's3', filters: {},
    })
    dispatcher.registerProcessor('s', { roomKey: ROOM, inputHandler: inst.onInput })
    // Only out1 cabled; out2..out8 are dangling
    dispatcher.setCables({
      [ROOM]: [
        { id: 'c1', source: { kind: 'jack', instanceId: 's', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'a', portId: 'in' } },
      ],
    })
    inst.start()
    inst.onInput({ signal: createSignal('event', { kind: 'tick' }, {}) })
    expect(a).toHaveLength(1)
  })

  it('a downstream node reached via two splitter outputs dedupes (same signal id)', () => {
    const bus = createBus()
    const dispatcher = createDispatcher({ onTerminal: () => {} })
    const z = []
    dispatcher.registerProcessor('z', { roomKey: ROOM, inputHandler: ({ signal }) => z.push(signal) })
    const def = getProcessorDef('splitter')
    const inst = def.create({}, {
      bus, dispatcher, instanceId: 's', roomNodeId: 'r', roomSystemKey: 's3', filters: {},
    })
    dispatcher.registerProcessor('s', { roomKey: ROOM, inputHandler: inst.onInput })
    // Both out1 AND out2 wired to the same target — dedupe should kick in.
    dispatcher.setCables({
      [ROOM]: [
        { id: 'c1', source: { kind: 'jack', instanceId: 's', portId: 'out1' },
                    target: { kind: 'jack', instanceId: 'z', portId: 'in' } },
        { id: 'c2', source: { kind: 'jack', instanceId: 's', portId: 'out2' },
                    target: { kind: 'jack', instanceId: 'z', portId: 'in' } },
      ],
    })
    inst.start()
    inst.onInput({ signal: createSignal('metric', { value: 1 }, {}) })
    expect(z).toHaveLength(1)
  })
})
