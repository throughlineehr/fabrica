// Black-box test for the near-duplicate detector. Drop the processor on a
// dispatcher harness with two spies (one per output port), feed text, and
// assert which signals land where.

import { describe, it, expect } from 'vitest'
import { createBus } from '../signals/bus'
import { createSignal } from '../signals/signal'
import { getProcessorDef } from '../signals/library'
import { createDispatcher } from '../signals/dispatcher'

const ROOM = 'r:s3'

function spawn(configOverrides = {}) {
  const bus = createBus()
  const dispatcher = createDispatcher({ onTerminal: () => {} })
  const uniques = []
  const duplicates = []
  dispatcher.registerProcessor('spyU', {
    roomKey: ROOM,
    inputHandler: ({ signal }) => uniques.push(signal),
  })
  dispatcher.registerProcessor('spyD', {
    roomKey: ROOM,
    inputHandler: ({ signal }) => duplicates.push(signal),
  })
  const def = getProcessorDef('near-duplicate-detector')
  const inst = def.create(
    { ...def.defaultConfig, ...configOverrides },
    { bus, dispatcher, instanceId: 'p', roomNodeId: 'r', roomSystemKey: 's3', filters: {} },
  )
  dispatcher.registerProcessor('p', { roomKey: ROOM, inputHandler: inst.onInput })
  dispatcher.setCables({
    [ROOM]: [
      { id: 'cu', source: { kind: 'jack', instanceId: 'p', portId: 'unique' },
                  target: { kind: 'jack', instanceId: 'spyU', portId: 'in' } },
      { id: 'cd', source: { kind: 'jack', instanceId: 'p', portId: 'duplicate' },
                  target: { kind: 'jack', instanceId: 'spyD', portId: 'in' } },
    ],
  })
  inst.start()
  return {
    inst, uniques, duplicates,
    feed: (text) => inst.onInput({ signal: createSignal('narrative', { text }, {}) }),
  }
}

describe('near-duplicate-detector', () => {
  it('first occurrence passes through unique; identical second is a duplicate', () => {
    const { feed, uniques, duplicates } = spawn()
    feed('the deploy succeeded after a long delay')
    feed('the deploy succeeded after a long delay')
    expect(uniques).toHaveLength(1)
    expect(duplicates).toHaveLength(1)
    expect(duplicates[0].content.distance).toBe(0)
    expect(duplicates[0].content.matchedSignalId).toBe(uniques[0].id)
    expect(duplicates[0].tags).toContain('near-duplicate')
  })

  it('reordered words are still considered the same (bag-of-words SimHash)', () => {
    const { feed, uniques, duplicates } = spawn()
    feed('database connection pool exhausted during peak traffic')
    feed('peak traffic exhausted database connection pool during')
    expect(uniques).toHaveLength(1)
    expect(duplicates).toHaveLength(1)
  })

  it('a single-word edit on a long message is a near-duplicate (not a unique)', () => {
    const { feed, uniques, duplicates } = spawn({ hammingThreshold: 5 })
    feed('the rolling deployment of service A finished, no errors observed in the canary, traffic shifted at noon')
    feed('the rolling deployment of service A finished, no errors observed in the canary, traffic shifted at midnight')
    expect(uniques).toHaveLength(1)
    expect(duplicates).toHaveLength(1)
  })

  it('genuinely different messages both pass as unique', () => {
    const { feed, uniques, duplicates } = spawn()
    feed('database connection pool exhausted')
    feed('release notes for version 2.4 published')
    expect(uniques).toHaveLength(2)
    expect(duplicates).toHaveLength(0)
  })

  it('passes the original signal through unchanged on `unique` (with appended tag)', () => {
    const { feed, uniques } = spawn()
    feed('singular event')
    expect(uniques).toHaveLength(1)
    expect(uniques[0].type).toBe('narrative')
    expect(uniques[0].content.text).toBe('singular event')
    expect(uniques[0].tags).toContain('unique-after-dedup')
  })

  it('threshold knob = 0 only catches exact-bit-fingerprint matches', () => {
    const { feed, uniques, duplicates } = spawn({ hammingThreshold: 0 })
    feed('alpha beta gamma delta epsilon zeta eta theta')
    feed('alpha beta gamma delta epsilon zeta eta theta')
    feed('alpha beta gamma delta epsilon zeta eta theta iota')  // one extra token
    expect(uniques).toHaveLength(2)   // first + the +iota one
    expect(duplicates).toHaveLength(1) // exact repeat
  })

  it('windowSize cap evicts the oldest fingerprint', () => {
    const { feed, uniques, duplicates } = spawn({ hammingThreshold: 0, windowSize: 2 })
    feed('alpha beta gamma')
    feed('zeta eta theta')
    feed('mu nu xi')
    // Now window is [zeta..., mu...] — the alpha one was evicted.
    feed('alpha beta gamma')
    expect(uniques).toHaveLength(4)
    expect(duplicates).toHaveLength(0)
  })

  it('skips signals with no extractable text', () => {
    const { inst, uniques, duplicates } = spawn()
    inst.onInput({ signal: createSignal('metric', { key: 'cpu', value: 0.42 }, {}) })
    expect(uniques).toHaveLength(0)
    expect(duplicates).toHaveLength(0)
  })
})
