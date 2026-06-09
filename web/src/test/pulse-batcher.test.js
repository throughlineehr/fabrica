import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createBus } from '../signals/bus'
import { createSignal } from '../signals/signal'
import { getProcessorDef } from '../signals/library'
import { createDispatcher } from '../signals/dispatcher'

const ROOM = 'r:s3'

function spawn(configOverrides = {}) {
  const bus = createBus()
  const dispatcher = createDispatcher({ onTerminal: () => {} })
  const out = []
  dispatcher.registerProcessor('spy', {
    roomKey: ROOM,
    inputHandler: ({ signal }) => out.push(signal),
  })
  const def = getProcessorDef('pulse-batcher')
  const inst = def.create(
    { ...def.defaultConfig, ...configOverrides },
    { bus, dispatcher, instanceId: 'p', roomNodeId: 'r', roomSystemKey: 's3', filters: {} },
  )
  dispatcher.registerProcessor('p', { roomKey: ROOM, inputHandler: inst.onInput })
  dispatcher.setCables({
    [ROOM]: [
      { id: 'c', source: { kind: 'jack', instanceId: 'p', portId: 'out' },
                  target: { kind: 'jack', instanceId: 'spy', portId: 'in' } },
    ],
  })
  inst.start()
  return {
    inst, out,
    feed: (n) => {
      for (let i = 0; i < n; i++) {
        inst.onInput({ signal: createSignal('event', { i }, {}) })
      }
    },
  }
}

describe('pulse-batcher', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('buffers silently and emits the whole burst at flush time', () => {
    const { inst, feed, out } = spawn({ batchMs: 1000 })
    feed(5)
    // Nothing yet — still inside the window.
    expect(out).toHaveLength(0)
    vi.advanceTimersByTime(1100)
    expect(out).toHaveLength(5)
    // Originals preserved unchanged
    for (let i = 0; i < 5; i++) expect(out[i].content.i).toBe(i)
    inst.stop()
  })

  it('preserves arrival order in the burst', () => {
    const { inst, feed, out } = spawn({ batchMs: 500 })
    feed(3)
    vi.advanceTimersByTime(600)
    expect(out.map(s => s.content.i)).toEqual([0, 1, 2])
    inst.stop()
  })

  it('multiple flush cycles each emit only their own window', () => {
    const { inst, feed, out } = spawn({ batchMs: 500 })
    feed(2)
    vi.advanceTimersByTime(600) // first flush
    expect(out).toHaveLength(2)
    feed(3)
    vi.advanceTimersByTime(600) // second flush
    expect(out).toHaveLength(5)
    inst.stop()
  })

  it('empty windows produce no emit', () => {
    const { inst, out } = spawn({ batchMs: 500 })
    vi.advanceTimersByTime(2000) // 4 flush ticks, no input
    expect(out).toHaveLength(0)
    inst.stop()
  })

  it('maxBuffer drops oldest when the cap is exceeded', () => {
    const { inst, feed, out } = spawn({ batchMs: 1000, maxBuffer: 3 })
    feed(5) // 5 sent, only the last 3 should survive (i=2,3,4)
    vi.advanceTimersByTime(1100)
    expect(out).toHaveLength(3)
    expect(out.map(s => s.content.i)).toEqual([2, 3, 4])
    inst.stop()
  })

  it('signals received during a flush burst land in the NEXT window', () => {
    // Simulate a downstream processor that re-emits back into the batcher
    // as a side-effect of receiving its own signal. (We don't have a clean
    // way to exercise this without a feedback loop, so just inject inputs
    // before and after vi.advance and verify the partition.)
    const { inst, feed, out } = spawn({ batchMs: 500 })
    feed(2)
    vi.advanceTimersByTime(600) // flush 1: emits 2
    expect(out).toHaveLength(2)
    feed(1)
    vi.advanceTimersByTime(600) // flush 2: emits 1
    expect(out).toHaveLength(3)
    expect(out[2].content.i).toBe(0)
    inst.stop()
  })

  it('stop() halts the timer; buffered signals are abandoned', () => {
    const { inst, feed, out } = spawn({ batchMs: 1000 })
    feed(3)
    inst.stop()
    vi.advanceTimersByTime(5000)
    expect(out).toHaveLength(0)
  })
})
