import { describe, it, expect } from 'vitest'
import { makeChain, stepChain, pathFromPoints } from '../components/wiring/verlet'

const TUNING = {
  segments: 14,
  iterations: 10,
  gravity: 0.28,
  damping: 0.86,
  slack: 1.07,
  restEpsilon: 0.06,
  restFramesNeeded: 4,
}

describe('makeChain', () => {
  it('creates the requested number of points', () => {
    const c = makeChain({ x: 0, y: 0 }, { x: 100, y: 0 }, 14)
    expect(c.points).toHaveLength(14)
    expect(c.prev).toHaveLength(14)
  })

  it('endpoints lie on the anchors (with the sag offset on Y)', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 100, y: 0 }
    const c = makeChain(a, b, 14)
    expect(c.points[0].x).toBeCloseTo(a.x)
    expect(c.points[c.points.length - 1].x).toBeCloseTo(b.x)
    // sag offset adds +24 to initial y on every point
    expect(c.points[0].y).toBeCloseTo(a.y + 24)
  })
})

describe('stepChain', () => {
  it('settles to a static shape after a few steps with stable anchors', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 200, y: 0 }
    const chain = makeChain(a, b, TUNING.segments)
    // Run until sleeping (or 200 frames as a safety cap)
    for (let i = 0; i < 200 && !chain.sleeping; i++) {
      stepChain(chain, a, b, TUNING)
    }
    expect(chain.sleeping).toBe(true)
  })

  it('a sleeping chain is a no-op when called with the same anchors', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 200, y: 0 }
    const chain = makeChain(a, b, TUNING.segments)
    // Settle
    for (let i = 0; i < 200 && !chain.sleeping; i++) stepChain(chain, a, b, TUNING)
    expect(chain.sleeping).toBe(true)

    // Snapshot interior points
    const snapshot = chain.points.slice(1, -1).map(p => ({ x: p.x, y: p.y }))
    // Step many more times — should not change
    for (let i = 0; i < 50; i++) stepChain(chain, a, b, TUNING)
    const after = chain.points.slice(1, -1).map(p => ({ x: p.x, y: p.y }))
    expect(after).toEqual(snapshot)
  })

  it('wakes up when an anchor moves', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 200, y: 0 }
    const chain = makeChain(a, b, TUNING.segments)
    for (let i = 0; i < 200 && !chain.sleeping; i++) stepChain(chain, a, b, TUNING)
    expect(chain.sleeping).toBe(true)

    // Move anchor — chain should wake up
    const b2 = { x: 250, y: 30 }
    stepChain(chain, a, b2, TUNING)
    expect(chain.sleeping).toBe(false)
    expect(chain.restFrames).toBe(0)
  })

  it('endpoints are always pinned to the anchors after stepping', () => {
    const a = { x: 10, y: 20 }
    const b = { x: 210, y: 60 }
    const chain = makeChain(a, b, TUNING.segments)
    for (let i = 0; i < 30; i++) stepChain(chain, a, b, TUNING)
    expect(chain.points[0].x).toBeCloseTo(a.x)
    expect(chain.points[0].y).toBeCloseTo(a.y)
    expect(chain.points[chain.points.length - 1].x).toBeCloseTo(b.x)
    expect(chain.points[chain.points.length - 1].y).toBeCloseTo(b.y)
  })

  it('settled mid-points hang BELOW the line between anchors (gravity)', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 400, y: 0 }
    const chain = makeChain(a, b, TUNING.segments)
    for (let i = 0; i < 200 && !chain.sleeping; i++) stepChain(chain, a, b, TUNING)
    const mid = chain.points[Math.floor(chain.points.length / 2)]
    // y is greater (down) than the line through anchors (which is y=0)
    expect(mid.y).toBeGreaterThan(0)
  })
})

describe('pathFromPoints', () => {
  it('returns empty string for empty input', () => {
    expect(pathFromPoints([])).toBe('')
    expect(pathFromPoints(undefined)).toBe('')
  })

  it('starts with M and chains L commands for the rest', () => {
    const path = pathFromPoints([
      { x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 10 },
    ])
    expect(path).toMatch(/^M 0\.0 0\.0/)
    expect(path).toContain('L 10.0 5.0')
    expect(path).toContain('L 20.0 10.0')
  })
})
