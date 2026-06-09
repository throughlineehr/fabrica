// Black-box test for the Top-K Tracker. Drop the processor on a dispatcher
// harness with a spy on its `top` output, feed signals at known property
// values, advance fake timers to trigger a report, and assert ranking.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createBus } from '../signals/bus'
import { createSignal } from '../signals/signal'
import { getProcessorDef } from '../signals/library'
import { createDispatcher } from '../signals/dispatcher'

const ROOM = 'r:s3'

function spawn(configOverrides = {}) {
  const bus = createBus()
  const dispatcher = createDispatcher({ onTerminal: () => {} })
  const reports = []
  dispatcher.registerProcessor('spy', {
    roomKey: ROOM,
    inputHandler: ({ signal }) => reports.push(signal),
  })
  const def = getProcessorDef('top-k-tracker')
  const inst = def.create(
    { ...def.defaultConfig, ...configOverrides },
    { bus, dispatcher, instanceId: 'p', roomNodeId: 'r', roomSystemKey: 's3', filters: {} },
  )
  dispatcher.registerProcessor('p', { roomKey: ROOM, inputHandler: inst.onInput })
  dispatcher.setCables({
    [ROOM]: [
      { id: 'c', source: { kind: 'jack', instanceId: 'p', portId: 'top' },
                  target: { kind: 'jack', instanceId: 'spy', portId: 'in' } },
    ],
  })
  inst.start()
  // Returns helpers to push signals with known shape.
  return {
    inst, reports,
    feedTags: (tags) => inst.onInput({ signal: { ...createSignal('event', {}, {}), tags } }),
    feedKind: (kind) => inst.onInput({ signal: createSignal('event', { kind }, {}) }),
    feedNested: (entityKind) => inst.onInput({ signal: createSignal('event', { entityKind }, {}) }),
  }
}

describe('top-k-tracker', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('counts tag occurrences across signals and emits a ranked top-K', () => {
    const { feedTags, reports } = spawn({ topK: 3, reportIntervalMs: 1000 })
    feedTags(['logger', 'audit'])
    feedTags(['logger', 'audit'])
    feedTags(['logger'])
    feedTags(['ops'])
    vi.advanceTimersByTime(1100)
    expect(reports).toHaveLength(1)
    const top = reports[0].content.topK
    expect(top[0]).toEqual({ value: 'logger', count: 3, share: expect.any(Number) })
    expect(top[1].value).toBe('audit')
    expect(top[2].value).toBe('ops')
  })

  it('reads from a configured nested path', () => {
    const { feedNested, reports } = spawn({ key: 'content.entityKind', reportIntervalMs: 1000 })
    feedNested('url')
    feedNested('url')
    feedNested('mention')
    vi.advanceTimersByTime(1100)
    const top = reports[0].content.topK
    expect(top[0]).toEqual({ value: 'url', count: 2, share: expect.any(Number) })
    expect(top[1].value).toBe('mention')
  })

  it('counts each element when the path resolves to an array', () => {
    const { inst, reports } = spawn({ key: 'content.values', reportIntervalMs: 1000 })
    inst.onInput({ signal: createSignal('event', { values: ['@alice', '@bob', '@alice'] }, {}) })
    inst.onInput({ signal: createSignal('event', { values: ['@alice', '@carol'] }, {}) })
    vi.advanceTimersByTime(1100)
    const top = reports[0].content.topK
    // @alice 3, @bob 1, @carol 1
    expect(top[0]).toEqual({ value: '@alice', count: 3, share: expect.any(Number) })
    expect(top.slice(1).map(t => t.value).sort()).toEqual(['@bob', '@carol'])
  })

  it('respects topK limit', () => {
    const { feedKind, reports } = spawn({ topK: 2, key: 'content.kind', reportIntervalMs: 1000 })
    feedKind('a'); feedKind('a'); feedKind('a')
    feedKind('b'); feedKind('b')
    feedKind('c')
    feedKind('d')
    vi.advanceTimersByTime(1100)
    expect(reports[0].content.topK).toHaveLength(2)
    expect(reports[0].content.topK.map(t => t.value)).toEqual(['a', 'b'])
    expect(reports[0].content.distinct).toBe(4)
  })

  it('honours minCount — values below threshold drop out', () => {
    const { feedKind, reports } = spawn({ minCount: 2, key: 'content.kind', reportIntervalMs: 1000, topK: 10 })
    feedKind('a'); feedKind('a')
    feedKind('b')
    vi.advanceTimersByTime(1100)
    const values = reports[0].content.topK.map(t => t.value)
    expect(values).toEqual(['a'])
  })

  it('windowMs evicts old samples', () => {
    const { feedKind, reports } = spawn({ key: 'content.kind', windowMs: 2000, reportIntervalMs: 1000 })
    feedKind('old'); feedKind('old')
    vi.advanceTimersByTime(2500)        // window has expired
    feedKind('fresh')
    vi.advanceTimersByTime(1000)        // next report tick
    // Reports[0] (after 1000ms) saw {old:2}; reports[1] (after 2000ms) might
    // still have it; what matters is reports[reports.length-1] sees 'fresh'.
    const last = reports[reports.length - 1].content.topK
    expect(last.map(t => t.value)).toContain('fresh')
    expect(last.map(t => t.value)).not.toContain('old')
  })

  it('emits nothing when no input has arrived', () => {
    const { reports } = spawn({ reportIntervalMs: 1000 })
    vi.advanceTimersByTime(3000)
    expect(reports).toHaveLength(0)
  })

  it('skips signals where the configured path is missing', () => {
    const { inst, reports } = spawn({ key: 'content.entityKind', reportIntervalMs: 1000 })
    // No content.entityKind on these — should be ignored.
    inst.onInput({ signal: createSignal('metric', { value: 1 }, {}) })
    inst.onInput({ signal: createSignal('metric', { value: 2 }, {}) })
    vi.advanceTimersByTime(1100)
    expect(reports).toHaveLength(0)
  })

  it('share is count / totalSamples (not signals — values)', () => {
    const { inst, reports } = spawn({ key: 'content.values', reportIntervalMs: 1000 })
    inst.onInput({ signal: createSignal('event', { values: ['x', 'x', 'y'] }, {}) })
    vi.advanceTimersByTime(1100)
    const top = reports[0].content.topK
    expect(top[0].value).toBe('x')
    expect(top[0].share).toBeCloseTo(2 / 3, 2)
    expect(reports[0].content.totalSamples).toBe(3)
  })
})
