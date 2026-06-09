import { describe, it, expect } from 'vitest'
import { createSignal, appendTrace, hasTraced } from '../signals/signal'

describe('createSignal', () => {
  it('produces a signal with all the canonical fields', () => {
    const s = createSignal('metric', { v: 1 }, { processorType: 'heartbeat' })
    expect(s.id).toBeTypeOf('string')
    expect(s.id.length).toBeGreaterThan(0)
    expect(s.type).toBe('metric')
    expect(s.content).toEqual({ v: 1 })
    expect(s.source).toEqual({ processorType: 'heartbeat' })
    expect(s.trace).toEqual([])
    expect(s.hops).toEqual([])
    expect(s.delivered).toEqual([])
    expect(s.tags).toEqual([])
    expect(s.timestamp).toBeTypeOf('number')
  })

  it('different signals get different ids', () => {
    const a = createSignal('event', {}, {})
    const b = createSignal('event', {}, {})
    expect(a.id).not.toBe(b.id)
  })

  it('source defaults to {} when missing', () => {
    const s = createSignal('event', {})
    expect(s.source).toEqual({})
  })
})

describe('appendTrace', () => {
  it('returns a new signal with the entry pushed onto trace', () => {
    const s = createSignal('event', {})
    const t = appendTrace(s, { processorId: 'p1', processorType: 'tracer' })
    expect(t).not.toBe(s)
    expect(s.trace).toEqual([])           // original unchanged
    expect(t.trace).toHaveLength(1)
    expect(t.trace[0].processorId).toBe('p1')
    expect(t.trace[0].timestamp).toBeTypeOf('number')
  })

  it('chains multiple times', () => {
    let s = createSignal('event', {})
    s = appendTrace(s, { processorId: 'a' })
    s = appendTrace(s, { processorId: 'b' })
    s = appendTrace(s, { processorId: 'c' })
    expect(s.trace.map(t => t.processorId)).toEqual(['a', 'b', 'c'])
  })

  it('does not mutate the input signal', () => {
    const original = createSignal('event', { v: 1 })
    const traced = appendTrace(original, { processorId: 'p1' })
    expect(original.trace).toEqual([])
    expect(traced.content).toEqual({ v: 1 })   // content carried forward
  })
})

describe('hasTraced', () => {
  it('false on a fresh signal', () => {
    const s = createSignal('event', {})
    expect(hasTraced(s, 'p1')).toBe(false)
  })

  it('true after appendTrace with that processorId', () => {
    let s = createSignal('event', {})
    s = appendTrace(s, { processorId: 'p1' })
    expect(hasTraced(s, 'p1')).toBe(true)
  })

  it('false for processor ids not in the trace', () => {
    let s = createSignal('event', {})
    s = appendTrace(s, { processorId: 'p1' })
    s = appendTrace(s, { processorId: 'p2' })
    expect(hasTraced(s, 'pX')).toBe(false)
  })

  it('finds a processor visit anywhere in the trace history', () => {
    let s = createSignal('event', {})
    s = appendTrace(s, { processorId: 'a' })
    s = appendTrace(s, { processorId: 'b' })
    s = appendTrace(s, { processorId: 'c' })
    expect(hasTraced(s, 'a')).toBe(true)
    expect(hasTraced(s, 'b')).toBe(true)
    expect(hasTraced(s, 'c')).toBe(true)
  })
})
