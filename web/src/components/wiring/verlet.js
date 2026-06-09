// Verlet spring chain for patch cables. Pure module — no React, no
// DOM. Used by WiringDemo today and ready to be the production
// primitive when internal wiring lands per INTERNAL-WIRING-DESIGN.md.
//
// A "chain" is { points: [{x,y}], prev: [{x,y}] } plus optional
// transient fields the runtime mutates (sleeping, restFrames,
// lastA, lastB). The constants live with the consumer (a tuning
// object) so different rooms can have different cable feels.

export function makeChain(a, b, segments) {
  const points = []
  const prev = []
  for (let i = 0; i < segments; i++) {
    const t = i / (segments - 1)
    const x = a.x + (b.x - a.x) * t
    const y = a.y + (b.y - a.y) * t + 24
    points.push({ x, y })
    prev.push({ x, y })
  }
  return { points, prev }
}

export function stepChain(chain, a, b, t) {
  const segments = chain.points.length
  // Skip the sim entirely when anchors are unchanged and the chain
  // has settled. Stops idle cables from twitching.
  const anchorMoved =
    !chain.lastA || !chain.lastB ||
    chain.lastA.x !== a.x || chain.lastA.y !== a.y ||
    chain.lastB.x !== b.x || chain.lastB.y !== b.y
  if (anchorMoved) {
    chain.sleeping = false
    chain.restFrames = 0
  }
  if (chain.sleeping) {
    chain.points[0].x = a.x; chain.points[0].y = a.y
    chain.points[segments - 1].x = b.x; chain.points[segments - 1].y = b.y
    return
  }

  const dx = b.x - a.x
  const dy = b.y - a.y
  const dist = Math.hypot(dx, dy) || 1
  const restLen = (dist * t.slack) / (segments - 1)
  const { points, prev } = chain

  for (let i = 1; i < segments - 1; i++) {
    const px = points[i].x, py = points[i].y
    const vx = (px - prev[i].x) * t.damping
    const vy = (py - prev[i].y) * t.damping
    prev[i].x = px; prev[i].y = py
    points[i].x = px + vx
    points[i].y = py + vy + t.gravity
  }
  points[0].x = a.x; points[0].y = a.y
  prev[0].x = a.x; prev[0].y = a.y
  points[segments - 1].x = b.x; points[segments - 1].y = b.y
  prev[segments - 1].x = b.x; prev[segments - 1].y = b.y

  for (let it = 0; it < t.iterations; it++) {
    for (let i = 0; i < segments - 1; i++) {
      const p = points[i], q = points[i + 1]
      const ddx = q.x - p.x, ddy = q.y - p.y
      const d = Math.hypot(ddx, ddy) || 1
      const diff = ((d - restLen) / d) * 0.5
      const tx = ddx * diff, ty = ddy * diff
      if (i > 0) { p.x += tx; p.y += ty }
      if (i < segments - 2) { q.x -= tx; q.y -= ty }
    }
    points[0].x = a.x; points[0].y = a.y
    points[segments - 1].x = b.x; points[segments - 1].y = b.y
  }

  let maxDelta = 0
  for (let i = 1; i < segments - 1; i++) {
    const ddx = points[i].x - prev[i].x
    const ddy = points[i].y - prev[i].y
    const d = Math.hypot(ddx, ddy)
    if (d > maxDelta) maxDelta = d
  }
  if (maxDelta < t.restEpsilon) {
    chain.restFrames = (chain.restFrames || 0) + 1
    if (chain.restFrames > t.restFramesNeeded) chain.sleeping = true
  } else {
    chain.restFrames = 0
  }
  chain.lastA = { x: a.x, y: a.y }
  chain.lastB = { x: b.x, y: b.y }
}

export function pathFromPoints(points) {
  if (!points || points.length === 0) return ''
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`
  }
  return d
}
