import { describe, it, expect } from 'vitest'
import { signalMatches, normalizeFilters, defaultFilters } from '../signals/filter'

function sig({ type = 'metric', tags = [] } = {}) {
  return { id: 'x', type, tags }
}

describe('defaultFilters / normalizeFilters', () => {
  it('defaultFilters returns null for every axis', () => {
    expect(defaultFilters()).toEqual({ types: null, tags: null })
  })

  it('normalizeFilters maps undefined / empty to null', () => {
    const n = normalizeFilters({})
    expect(n.types).toBeNull()
    expect(n.tags).toBeNull()
  })

  it('normalizeFilters treats empty tags array as null', () => {
    expect(normalizeFilters({ tags: [] }).tags).toBeNull()
  })

  it('normalizeFilters preserves non-empty arrays', () => {
    const n = normalizeFilters({ types: ['metric'], tags: ['urgent'] })
    expect(n.types).toEqual(['metric'])
    expect(n.tags).toEqual(['urgent'])
  })

  it('normalizeFilters drops legacy terminal fields silently', () => {
    // Older instances may have inputTerminals/outputTerminals on disk; the
    // normalizer simply does not read them. Routing concerns moved to cables.
    const n = normalizeFilters({ types: ['metric'], inputTerminals: ['t1'], outputTerminals: ['t2'] })
    expect(n).toEqual({ types: ['metric'], tags: null })
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

describe('signalMatches — combined filters', () => {
  it('all axes must pass for the signal to match', () => {
    const filter = { types: ['metric'], tags: ['urgent'] }
    expect(signalMatches(sig({ type: 'metric', tags: ['urgent'] }), filter)).toBe(true)
    expect(signalMatches(sig({ type: 'event',  tags: ['urgent'] }), filter)).toBe(false)
    expect(signalMatches(sig({ type: 'metric', tags: ['routine'] }), filter)).toBe(false)
  })
})
