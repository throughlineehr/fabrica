import { describe, it, expect } from 'vitest'
import { signalMatches, normalizeFilters, defaultFilters } from '../signals/filter'

function sig({ type = 'metric', tags = [], arrivalTerminal = undefined } = {}) {
  return { id: 'x', type, tags, arrivalTerminal }
}

describe('defaultFilters / normalizeFilters', () => {
  it('defaultFilters returns null for every axis', () => {
    expect(defaultFilters()).toEqual({
      types: null, tags: null, inputTerminals: null, outputTerminals: null,
    })
  })

  it('normalizeFilters maps undefined / empty to null', () => {
    const n = normalizeFilters({})
    expect(n.types).toBeNull()
    expect(n.tags).toBeNull()
    expect(n.inputTerminals).toBeNull()
    expect(n.outputTerminals).toBeNull()
  })

  it('normalizeFilters treats empty tags array as null', () => {
    expect(normalizeFilters({ tags: [] }).tags).toBeNull()
  })

  it('normalizeFilters preserves non-empty arrays', () => {
    const n = normalizeFilters({
      types: ['metric'], tags: ['urgent'], inputTerminals: ['t1'], outputTerminals: ['t2'],
    })
    expect(n.types).toEqual(['metric'])
    expect(n.tags).toEqual(['urgent'])
    expect(n.inputTerminals).toEqual(['t1'])
    expect(n.outputTerminals).toEqual(['t2'])
  })
})

describe('signalMatches — wildcards', () => {
  it('null filter matches any signal', () => {
    expect(signalMatches(sig(), null)).toBe(true)
    expect(signalMatches(sig({ type: 'alert', tags: ['x'] }), null)).toBe(true)
  })

  it('default filters match any signal', () => {
    expect(signalMatches(sig(), defaultFilters())).toBe(true)
  })

  it('empty arrays are equivalent to null (no constraint)', () => {
    expect(signalMatches(sig({ type: 'metric' }), { tags: [] })).toBe(true)
  })
})

describe('signalMatches — types', () => {
  it('passes when type is in allowlist', () => {
    expect(signalMatches(sig({ type: 'metric' }), { types: ['metric', 'alert'] })).toBe(true)
  })

  it('fails when type not in allowlist', () => {
    expect(signalMatches(sig({ type: 'event' }), { types: ['metric', 'alert'] })).toBe(false)
  })
})

describe('signalMatches — tags', () => {
  it('passes when at least one signal tag intersects filter tags', () => {
    expect(signalMatches(sig({ tags: ['slack', 'urgent'] }), { tags: ['urgent'] })).toBe(true)
  })

  it('fails when no signal tag intersects filter tags', () => {
    expect(signalMatches(sig({ tags: ['slack'] }), { tags: ['urgent'] })).toBe(false)
  })

  it('fails when signal has no tags but filter requires some', () => {
    expect(signalMatches(sig({ tags: undefined }), { tags: ['urgent'] })).toBe(false)
  })
})

describe('signalMatches — inputTerminals', () => {
  it('passes when arrivalTerminal is in allowlist', () => {
    expect(signalMatches(
      sig({ arrivalTerminal: 's3-out' }),
      { inputTerminals: ['s3-out', 's4-out'] }
    )).toBe(true)
  })

  it('fails when arrivalTerminal is not in allowlist', () => {
    expect(signalMatches(
      sig({ arrivalTerminal: 's5-out' }),
      { inputTerminals: ['s3-out'] }
    )).toBe(false)
  })

  it('excludes internal signals (no arrivalTerminal) when terminals are restricted', () => {
    // This is the gotcha called out in SIGNALS.md §7
    expect(signalMatches(
      sig({ arrivalTerminal: undefined }),
      { inputTerminals: ['s3-out'] }
    )).toBe(false)
  })

  it('includes internal signals when no inputTerminals filter is set', () => {
    expect(signalMatches(
      sig({ arrivalTerminal: undefined }),
      { types: ['metric'] }
    )).toBe(true)
  })
})

describe('signalMatches — combined filters', () => {
  it('all axes must pass for the signal to match', () => {
    const filter = {
      types: ['metric'],
      tags: ['urgent'],
      inputTerminals: ['s3-out'],
    }
    // Passes everything
    expect(signalMatches(
      sig({ type: 'metric', tags: ['urgent'], arrivalTerminal: 's3-out' }),
      filter,
    )).toBe(true)
    // Fails type
    expect(signalMatches(
      sig({ type: 'event', tags: ['urgent'], arrivalTerminal: 's3-out' }),
      filter,
    )).toBe(false)
    // Fails tag
    expect(signalMatches(
      sig({ type: 'metric', tags: ['routine'], arrivalTerminal: 's3-out' }),
      filter,
    )).toBe(false)
    // Fails terminal
    expect(signalMatches(
      sig({ type: 'metric', tags: ['urgent'], arrivalTerminal: 's5-out' }),
      filter,
    )).toBe(false)
  })

  it('outputTerminals does NOT affect signalMatches (it is enforced by forwarders)', () => {
    // outputTerminals controls publishing, not subscribing — signalMatches
    // ignores it.
    expect(signalMatches(
      sig({ type: 'metric' }),
      { outputTerminals: ['s5-out'] },
    )).toBe(true)
  })
})
