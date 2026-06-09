import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { act, render, cleanup } from '@testing-library/react'
import { AccessibilityProvider, useAccessibility } from '../accessibility'

// jsdom doesn't ship matchMedia
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })
  }
})

afterEach(() => cleanup())

function Probe({ onCtx }) {
  const ctx = useAccessibility()
  onCtx(ctx)
  return null
}

describe('AccessibilityProvider', () => {
  it('default values: all modes off, fontVisibility 0', () => {
    let ctx
    render(
      <AccessibilityProvider>
        <Probe onCtx={(c) => { ctx = c }} />
      </AccessibilityProvider>
    )
    expect(ctx.epilepsy).toBe(false)
    expect(ctx.dyslexia).toBe(false)
    expect(ctx.colorBlind).toBe(false)
    expect(ctx.fontVisibility).toBe(0)
  })

  it('toggleEpilepsy flips the value', () => {
    let ctx
    render(
      <AccessibilityProvider>
        <Probe onCtx={(c) => { ctx = c }} />
      </AccessibilityProvider>
    )
    expect(ctx.epilepsy).toBe(false)
    act(() => ctx.toggleEpilepsy())
    // re-read after toggle (Probe re-runs, ctx ref refreshed)
    expect(ctx.epilepsy).toBe(true)
    act(() => ctx.toggleEpilepsy())
    expect(ctx.epilepsy).toBe(false)
  })

  it('toggleDyslexia flips the value', () => {
    let ctx
    render(
      <AccessibilityProvider>
        <Probe onCtx={(c) => { ctx = c }} />
      </AccessibilityProvider>
    )
    act(() => ctx.toggleDyslexia())
    expect(ctx.dyslexia).toBe(true)
  })

  it('toggleColorBlind flips the value', () => {
    let ctx
    render(
      <AccessibilityProvider>
        <Probe onCtx={(c) => { ctx = c }} />
      </AccessibilityProvider>
    )
    act(() => ctx.toggleColorBlind())
    expect(ctx.colorBlind).toBe(true)
  })

  it('setFontVisibility writes the slider value', () => {
    let ctx
    render(
      <AccessibilityProvider>
        <Probe onCtx={(c) => { ctx = c }} />
      </AccessibilityProvider>
    )
    act(() => ctx.setFontVisibility(0.6))
    expect(ctx.fontVisibility).toBeCloseTo(0.6)
  })

  it('useAccessibility outside Provider returns the default context', () => {
    let ctx
    render(<Probe onCtx={(c) => { ctx = c }} />)
    expect(ctx.epilepsy).toBe(false)
    expect(ctx.dyslexia).toBe(false)
    // The default context's setters are no-ops; calling them shouldn't throw.
    expect(() => ctx.toggleEpilepsy()).not.toThrow()
    expect(() => ctx.setFontVisibility(0.5)).not.toThrow()
  })

  it('matchMedia listener cleans up on unmount', () => {
    // Verify removeEventListener is called when the provider unmounts.
    // Replace matchMedia with a tracking impl just for this test.
    const realMatchMedia = window.matchMedia
    const adds = []
    const removes = []
    window.matchMedia = (q) => ({
      matches: false,
      media: q,
      addEventListener: (ev, h) => adds.push(h),
      removeEventListener: (ev, h) => removes.push(h),
    })
    const { unmount } = render(
      <AccessibilityProvider>
        <Probe onCtx={() => {}} />
      </AccessibilityProvider>
    )
    expect(adds).toHaveLength(1)
    expect(removes).toHaveLength(0)
    unmount()
    expect(removes).toHaveLength(1)
    expect(removes[0]).toBe(adds[0])
    window.matchMedia = realMatchMedia
  })
})
