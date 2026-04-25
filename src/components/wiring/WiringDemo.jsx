// Working demonstration of the rack-back wiring primitives — to be
// promoted into src/components/room/ when the real feature lands.
//
// Demonstrates:
//   - Plugin-defined panels with jacks at meaningful (not uniform)
//     positions
//   - Cables as the "idea" of a cable: single solid color, no shading,
//     verlet-spring physics for sag and sway
//   - Mouse drag to patch
//   - Keyboard patching with ghost cable (Tab/Enter/Arrow/Escape)
//   - Click cable midspan to select; Delete to remove
//   - Pulse on signal traversal
//
// Visual + interaction reference for INTERNAL-WIRING-DESIGN.md.

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { type, color } from '../../styles'

// ---------------------------------------------------------------------------
// Tuning — every numerical parameter exposed for the styleguide sliders
// ---------------------------------------------------------------------------

const DEFAULT_TUNING = {
  // Physics — guitar/patch cable feel: heavy, hangs naturally, settles fast
  segments: 16,
  iterations: 18,
  gravity: 0.32,
  damping: 0.78,        // lower = more drag → kills wobble fast
  slack: 1.10,          // ~10% length excess for natural hang
  restEpsilon: 0.06,
  restFramesNeeded: 4,
  // Cable look
  cableStroke: 11,
  cableStrokeSelected: 13,
  ghostStroke: 11,
  ghostDashOn: 0,       // 0 on either dash slider → solid ghost
  ghostDashOff: 0,
  endpointRadius: 13,
  cableOpacity: 0.92,
  // Processor jacks
  jackVisual: 22,
  jackHole: 9,
  jackHitPadding: 4,
  // Wall terminal
  termSize: 29,
  termHole: 15,
  termCable: 23,
  termBend: 22,
  termVisible: 60,
}

// ---------------------------------------------------------------------------
// Verlet physics — parameterized by tuning
// ---------------------------------------------------------------------------

function makeChain(a, b, segments) {
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

function stepChain(chain, a, b, t) {
  const segments = chain.points.length
  // If anchors haven't moved AND the chain is settled, skip the sim entirely.
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

function pathFromPoints(points) {
  if (!points || points.length === 0) return ''
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`
  }
  return d
}

// ---------------------------------------------------------------------------
// Demo data — two heterogeneous panels showing plugin-author freedom
// ---------------------------------------------------------------------------

const PANELS = [
  {
    id: 'tx',
    title: 'SLACK TRANSDUCER',
    width: 240,
    height: 168,
    jacks: [
      { id: 'tx.stream', label: 'stream', kind: 'output', x: 220, y: 78,  color: color.s1.fill },
      { id: 'tx.errors', label: 'errors', kind: 'output', x: 220, y: 138, color: color.algedonic.fill },
    ],
  },
  {
    id: 'di',
    title: 'DIGEST',
    width: 240,
    height: 168,
    jacks: [
      { id: 'di.in',     label: 'in',     kind: 'input',  x: 20,  y: 100, color: color.s3.fill },
      { id: 'di.alerts', label: 'alerts', kind: 'input',  x: 20,  y: 144, color: color.algedonic.fill },
      { id: 'di.themes', label: 'themes', kind: 'output', x: 220, y: 80,  color: color.s2.fill },
    ],
  },
]

// A wall terminal — the same primitive room walls render. Position is the
// CENTER OF THE DOT in container space. Patch cables connect to the dot.
// The 45°-bent stub is decorative — it represents the cable continuing
// through the wall to the next room.
const WALL_TERMINALS = [
  {
    id: 'term.s2-out',
    label: 'to S2',
    kind: 'input',          // outputs patch INTO the terminal
    wall: 'right',
    x: 838, y: 100,
    color: color.s2.fill,
  },
]

const ALL_JACKS = [...PANELS.flatMap(p => p.jacks), ...WALL_TERMINALS]
const JACK_BY_ID = Object.fromEntries(ALL_JACKS.map(j => [j.id, j]))

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WiringDemo() {
  const [cables, setCables] = useState([
    { id: 'c-1', sourceId: 'tx.stream', targetId: 'di.in' },
    { id: 'c-2', sourceId: 'di.themes', targetId: 'term.s2-out' },
  ])
  const [selectedCable, setSelectedCable] = useState(null)
  const [patching, setPatching] = useState(null)
  const [pulsingCableId, setPulsingCableId] = useState(null)
  const [announce, setAnnounce] = useState('')
  const tuning = DEFAULT_TUNING

  // Render-time data computed by the rAF loop.
  const [frame, setFrame] = useState({
    cablePaths: {},     // cableId -> SVG path string
    ghostPath: null,    // SVG path string while patching
    anchors: {},        // jackId -> { x, y } in container space
  })

  const containerRef = useRef(null)
  const jackElRefs = useRef({})
  // Physics state that must survive across cables/patching state changes.
  // Read/written ONLY inside the rAF effect — never during render.
  const chainsRef = useRef(new Map())
  const ghostChainRef = useRef(null)

  // Helper: read jack positions from DOM. Allowed in event handlers + effects;
  // never call from render.
  const readAnchors = useCallback(() => {
    const c = containerRef.current
    if (!c) return {}
    const cb = c.getBoundingClientRect()
    const anchors = {}
    for (const id of Object.keys(jackElRefs.current)) {
      const el = jackElRefs.current[id]
      if (!el) continue
      const r = el.getBoundingClientRect()
      anchors[id] = {
        x: r.left - cb.left + r.width / 2,
        y: r.top - cb.top + r.height / 2,
      }
    }
    return anchors
  }, [])

  // Reset chains when segment count changes — existing chains have wrong size.
  useEffect(() => {
    chainsRef.current.clear()
    ghostChainRef.current = null
  }, [tuning.segments])

  // ---- Animation loop --------------------------------------------------
  useEffect(() => {
    let raf
    const loop = () => {
      const anchors = readAnchors()
      const chains = chainsRef.current

      // Drop chains for cables that no longer exist
      const liveIds = new Set(cables.map(c => c.id))
      for (const id of Array.from(chains.keys())) {
        if (!liveIds.has(id)) chains.delete(id)
      }

      const cablePaths = {}
      for (const cable of cables) {
        const a = anchors[cable.sourceId]
        const b = anchors[cable.targetId]
        if (!a || !b) continue
        let chain = chains.get(cable.id)
        if (!chain || chain.points.length !== tuning.segments) {
          chain = makeChain(a, b, tuning.segments)
          chains.set(cable.id, chain)
        }
        stepChain(chain, a, b, tuning)
        cablePaths[cable.id] = pathFromPoints(chain.points)
      }

      let ghostPath = null
      if (patching) {
        const a = anchors[patching.sourceId]
        const b = patching.cursor
        if (a && b) {
          if (!ghostChainRef.current || ghostChainRef.current.points.length !== tuning.segments) {
            ghostChainRef.current = makeChain(a, b, tuning.segments)
          }
          stepChain(ghostChainRef.current, a, b, tuning)
          ghostPath = pathFromPoints(ghostChainRef.current.points)
        }
      } else if (ghostChainRef.current) {
        ghostChainRef.current = null
      }

      setFrame({ cablePaths, ghostPath, anchors })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [cables, patching, readAnchors, tuning])

  // ---- Cable commit ----------------------------------------------------
  const commitCable = useCallback((sourceId, targetId) => {
    const a = JACK_BY_ID[sourceId], b = JACK_BY_ID[targetId]
    if (!a || !b) return
    const [outId, inId] = a.kind === 'output' ? [sourceId, targetId] : [targetId, sourceId]
    setCables(cs => {
      if (cs.some(c => c.sourceId === outId && c.targetId === inId)) {
        setAnnounce('Cable already exists.')
        return cs
      }
      const id = 'c-' + Math.random().toString(36).slice(2, 8)
      setAnnounce(`Cable from ${JACK_BY_ID[outId].label} to ${JACK_BY_ID[inId].label} created.`)
      setPulsingCableId(id)
      setTimeout(() => setPulsingCableId(null), 320)
      return [...cs, { id, sourceId: outId, targetId: inId }]
    })
  }, [])

  // ---- Mouse: start patch / detach existing cable ----------------------
  const onJackPointerDown = useCallback((jackId) => (e) => {
    e.preventDefault()
    const jack = JACK_BY_ID[jackId]
    if (!jack) return
    setSelectedCable(null)
    const anchors = readAnchors()

    // If this jack already has a cable, detach it. The other end becomes
    // the patch's fixed source; the cursor begins at THIS jack so the
    // user can drop the dangling end somewhere new.
    const existing = cables.find(c => c.sourceId === jackId || c.targetId === jackId)
    if (existing) {
      const otherId = existing.sourceId === jackId ? existing.targetId : existing.sourceId
      // Drop the chain so it rebuilds from the new endpoints if reused.
      chainsRef.current.delete(existing.id)
      setCables(cs => cs.filter(c => c.id !== existing.id))
      const here = anchors[jackId] ?? { x: 0, y: 0 }
      setPatching({ sourceId: otherId, cursor: here, mode: 'mouse', kbdIndex: 0 })
      setAnnounce(`Cable detached. Drag to a new ${jack.kind}.`)
      return
    }

    const a = anchors[jackId]
    setPatching({ sourceId: jackId, cursor: { x: a?.x ?? 0, y: a?.y ?? 0 }, mode: 'mouse', kbdIndex: 0 })
    setAnnounce(`Patching from ${jack.label}. Drag to a target jack.`)
  }, [cables, readAnchors])

  // ---- Mouse: track + drop ---------------------------------------------
  useEffect(() => {
    if (!patching || patching.mode !== 'mouse') return
    const onMove = (e) => {
      const c = containerRef.current
      if (!c) return
      const cb = c.getBoundingClientRect()
      setPatching(p => p && ({ ...p, cursor: { x: e.clientX - cb.left, y: e.clientY - cb.top } }))
    }
    const onUp = (e) => {
      const c = containerRef.current
      if (!c) { setPatching(null); return }
      const cb = c.getBoundingClientRect()
      const x = e.clientX - cb.left, y = e.clientY - cb.top
      const targetId = findEligibleTarget(patching.sourceId, x, y, readAnchors())
      if (targetId) commitCable(patching.sourceId, targetId)
      else setAnnounce('Patch cancelled.')
      setPatching(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [patching, readAnchors, commitCable])

  // ---- Keyboard patch start --------------------------------------------
  const eligibleTargets = useMemo(() => {
    if (!patching) return []
    const src = JACK_BY_ID[patching.sourceId]
    if (!src) return []
    return ALL_JACKS.filter(j => j.kind !== src.kind && j.id !== patching.sourceId)
  }, [patching])

  const onJackKeyDown = useCallback((jackId) => (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const jack = JACK_BY_ID[jackId]
    if (!jack) return
    e.preventDefault()
    const anchors = readAnchors()

    // Detach existing cable if any: the other end becomes the patch source.
    const existing = cables.find(c => c.sourceId === jackId || c.targetId === jackId)
    if (existing) {
      const otherId = existing.sourceId === jackId ? existing.targetId : existing.sourceId
      const otherJack = JACK_BY_ID[otherId]
      const elig = ALL_JACKS.filter(j => j.kind !== otherJack.kind && j.id !== otherId)
      chainsRef.current.delete(existing.id)
      setCables(cs => cs.filter(c => c.id !== existing.id))
      const firstId = elig[0]?.id ?? jackId
      const cur = anchors[firstId] ?? anchors[jackId] ?? { x: 0, y: 0 }
      setPatching({ sourceId: otherId, cursor: cur, mode: 'kbd', kbdIndex: 0 })
      setAnnounce(`Cable detached. Tab/Arrows to choose a new target. Enter to commit. Escape to cancel.`)
      return
    }

    const elig = ALL_JACKS.filter(j => j.kind !== jack.kind && j.id !== jackId)
    const firstId = elig[0]?.id ?? jackId
    const cur = anchors[firstId] ?? anchors[jackId] ?? { x: 0, y: 0 }
    setPatching({ sourceId: jackId, cursor: cur, mode: 'kbd', kbdIndex: 0 })
    setAnnounce(`Patching from ${jack.label}. Arrow keys or Tab to choose a target. Enter to commit. Escape to cancel.`)
  }, [cables, readAnchors])

  // ---- Keyboard patch arrow / commit / cancel --------------------------
  useEffect(() => {
    if (!patching || patching.mode !== 'kbd') return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setPatching(null); setAnnounce('Patch cancelled.'); e.preventDefault(); return
      }
      if (e.key === 'Enter') {
        const t = eligibleTargets[patching.kbdIndex]
        if (t) commitCable(patching.sourceId, t.id)
        setPatching(null); e.preventDefault(); return
      }
      if (eligibleTargets.length === 0) return
      const dir = (e.key === 'Tab' && !e.shiftKey) || e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1
                : (e.key === 'Tab' && e.shiftKey) || e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1
                : 0
      if (!dir) return
      e.preventDefault()
      const len = eligibleTargets.length
      const next = ((patching.kbdIndex + dir) % len + len) % len
      const id = eligibleTargets[next].id
      const anchors = readAnchors()
      setPatching(p => p && ({ ...p, kbdIndex: next, cursor: anchors[id] ?? p.cursor }))
      setAnnounce(`Eligible: ${eligibleTargets[next].label}.`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [patching, eligibleTargets, readAnchors, commitCable])

  // ---- Selected cable: Delete -------------------------------------------
  useEffect(() => {
    if (!selectedCable) return
    const onKey = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const c = cables.find(c => c.id === selectedCable)
        const fromLabel = c ? JACK_BY_ID[c.sourceId]?.label : 'cable'
        const toLabel   = c ? JACK_BY_ID[c.targetId]?.label : ''
        setCables(cs => cs.filter(c => c.id !== selectedCable))
        setSelectedCable(null)
        setAnnounce(`Cable from ${fromLabel} to ${toLabel} removed.`)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedCable, cables])

  // ---- Render -----------------------------------------------------------
  const cableColor = (cable) => JACK_BY_ID[cable.sourceId]?.color || color.primary
  const ghostColor = patching ? (JACK_BY_ID[patching.sourceId]?.color || color.primary) : color.primary

  return (
    <div>
      <div style={{ ...type.body, color: color.secondary, marginBottom: 16, maxWidth: 720 }}>
        Two demonstration panels and a wall terminal. Each plugin owns its
        own layout — jacks are placed where the plugin author wants them.
        Drag jack-to-jack to patch, click a connected jack to detach, click
        a cable midspan to select, Delete to remove.
      </div>


      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: 920,
          height: 220,
          padding: '24px 24px',
          background: '#fafafa',
          border: `1px solid ${color.border}`,
          userSelect: 'none',
        }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setSelectedCable(null)
        }}
      >
        <PanelView
          panel={PANELS[0]}
          jackElRefs={jackElRefs}
          onJackPointerDown={onJackPointerDown}
          onJackKeyDown={onJackKeyDown}
          patching={patching}
          eligibleTargets={eligibleTargets}
          tuning={tuning}
          left={24}
          top={24}
        />
        <PanelView
          panel={PANELS[1]}
          jackElRefs={jackElRefs}
          onJackPointerDown={onJackPointerDown}
          onJackKeyDown={onJackKeyDown}
          patching={patching}
          eligibleTargets={eligibleTargets}
          tuning={tuning}
          left={24 + 240 + 160}
          top={24}
        />

        {WALL_TERMINALS.map(terminal => (
          <DemoTerminal
            key={terminal.id}
            terminal={terminal}
            tuning={tuning}
            register={(el) => { jackElRefs.current[terminal.id] = el }}
            onPointerDown={onJackPointerDown(terminal.id)}
            onKeyDown={onJackKeyDown(terminal.id)}
            patching={patching}
            isEligible={!!patching && eligibleTargets.some(t => t.id === terminal.id)}
            isCursorTarget={!!patching && patching.mode === 'kbd' && eligibleTargets[patching.kbdIndex]?.id === terminal.id}
          />
        ))}

        <svg
          width="100%"
          height="100%"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          aria-hidden="true"
        >
          {cables.map(cable => {
            const d = frame.cablePaths[cable.id]
            const a = frame.anchors[cable.sourceId]
            const b = frame.anchors[cable.targetId]
            const isSelected = selectedCable === cable.id
            const isPulsing = pulsingCableId === cable.id
            const stroke = cableColor(cable)
            return (
              <g key={cable.id}>
                <path
                  d={d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={isSelected ? tuning.cableStrokeSelected : tuning.cableStroke}
                  strokeOpacity={isPulsing ? 1 : (isSelected ? 1 : tuning.cableOpacity)}
                  strokeLinecap="round"
                  style={{
                    pointerEvents: 'stroke',
                    cursor: 'pointer',
                    filter: isPulsing ? 'brightness(1.4)' : 'none',
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    setSelectedCable(cable.id)
                    setAnnounce(`Cable selected. Press Delete to remove.`)
                  }}
                />
                {a && <circle cx={a.x} cy={a.y} r={tuning.endpointRadius} fill={stroke} />}
                {b && <circle cx={b.x} cy={b.y} r={tuning.endpointRadius} fill={stroke} />}
              </g>
            )
          })}

          {frame.ghostPath && (
            <path
              d={frame.ghostPath}
              fill="none"
              stroke={ghostColor}
              strokeWidth={tuning.ghostStroke}
              strokeOpacity={0.55}
              strokeDasharray={
                tuning.ghostDashOn === 0 || tuning.ghostDashOff === 0
                  ? undefined
                  : `${tuning.ghostDashOn} ${tuning.ghostDashOff}`
              }
              strokeLinecap="round"
            />
          )}
        </svg>

        <div
          role="status"
          aria-live="polite"
          style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
        >
          {announce}
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        <div style={{ ...type.mono, color: color.secondary }}>
          status: {patching
            ? `patching from ${JACK_BY_ID[patching.sourceId]?.label} (${patching.mode})`
            : selectedCable
              ? 'cable selected — Delete to remove'
              : `${cables.length} cable${cables.length === 1 ? '' : 's'} connected`}
        </div>
        <div style={{ ...type.mono, color: color.muted }}>
          mouse: drag jack → jack · keyboard: Enter on jack to start, Tab/Arrow to step targets, Enter commit, Esc cancel · click cable midspan to select · Delete removes
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Panel + jack rendering
// ---------------------------------------------------------------------------

function PanelView({ panel, jackElRefs, onJackPointerDown, onJackKeyDown, patching, eligibleTargets, tuning, left, top }) {
  return (
    <div
      style={{
        position: 'absolute',
        left, top,
        width: panel.width, height: panel.height,
        background: color.white,
        border: `1px solid ${color.border}`,
      }}
    >
      <div style={{
        ...type.label,
        padding: '10px 12px',
        borderBottom: `1px solid ${color.border}`,
        background: '#f5f5f5',
      }}>
        {panel.title}
      </div>
      <DemoPanelContent panelId={panel.id} />
      {panel.jacks.map(jack => (
        <Jack
          key={jack.id}
          jack={jack}
          tuning={tuning}
          register={(el) => { jackElRefs.current[jack.id] = el }}
          onPointerDown={onJackPointerDown(jack.id)}
          onKeyDown={onJackKeyDown(jack.id)}
          patching={patching}
          isEligible={!!patching && eligibleTargets.some(t => t.id === jack.id)}
          isCursorTarget={!!patching && patching.mode === 'kbd' && eligibleTargets[patching.kbdIndex]?.id === jack.id}
        />
      ))}
    </div>
  )
}

function DemoPanelContent({ panelId }) {
  if (panelId === 'tx') {
    return (
      <div style={{ padding: '12px 12px 0 12px' }}>
        <div style={{ ...type.mono, color: color.secondary, marginBottom: 6 }}>ws://localhost:8888/slack/all</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ width: 6, height: 6, background: color.s1.fill }} />
          <span style={{ ...type.mono, color: color.primary }}>connected · 23 msgs</span>
        </div>
      </div>
    )
  }
  if (panelId === 'di') {
    return (
      <div style={{ padding: '12px 12px 0 12px' }}>
        <div style={{ ...type.mono, color: color.muted, fontSize: 11, marginBottom: 4 }}>last theme</div>
        <div style={{ ...type.mono, color: color.primary, marginBottom: 6 }}>migration broke staging</div>
        <div style={{ ...type.mono, color: color.muted, fontSize: 11 }}>significance: high · 09:30:18</div>
        <div style={{ ...type.mono, color: color.muted, fontSize: 11, marginTop: 8 }}>buffered: 3 · debounce 10s</div>
      </div>
    )
  }
  return null
}

function Jack({ jack, tuning, register, onPointerDown, onKeyDown, patching, isEligible, isCursorTarget }) {
  const isSource = patching?.sourceId === jack.id
  const dim = patching && !isEligible && !isSource ? 0.3 : 1
  const v = tuning.jackVisual
  const h = tuning.jackHole
  const p = tuning.jackHitPadding
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      aria-label={`${jack.label}, ${jack.kind}, ${isEligible ? 'eligible target' : isSource ? 'patch source' : 'press Enter to start patch'}`}
      style={{
        position: 'absolute',
        left: jack.x - (v / 2 + p),
        top: jack.y - (v / 2 + p),
        width: v + p * 2,
        height: v + p * 2,
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'crosshair',
        opacity: dim,
      }}
    >
      <span
        ref={register}
        aria-hidden="true"
        style={{
          display: 'block',
          width: v,
          height: v,
          margin: p,
          borderRadius: '50%',
          background: jack.color,
          boxShadow: isCursorTarget
            ? `0 0 0 3px ${color.focus}`
            : isSource
              ? `0 0 0 2px ${color.primary}`
              : `0 0 0 1px ${color.border}`,
          position: 'relative',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: (v - h) / 2,
            width: h, height: h,
            borderRadius: '50%',
            background: color.white,
          }}
        />
      </span>
      <span style={{
        position: 'absolute',
        top: -2,
        [jack.kind === 'output' ? 'right' : 'left']: v + p * 2 + 4,
        ...type.mono,
        color: color.muted,
        fontSize: 11,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }}>{jack.label}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Wall terminal — geometry mirrors components/room/CableTerminal.jsx
// ---------------------------------------------------------------------------

// Path identical to CableTerminal.jsx:cablePath()
function termCablePath(wall, bend, visible) {
  switch (wall) {
    case 'left':   return `M 0,0 L ${-bend},${-bend} L ${-bend - visible},${-bend}`
    case 'right':  return `M 0,0 L ${bend},${-bend} L ${bend + visible},${-bend}`
    case 'top':    return `M 0,0 L ${bend},${-bend} L ${bend},${-bend - visible}`
    case 'bottom': return `M 0,0 L ${-bend},${bend} L ${-bend},${bend + visible}`
    default: return ''
  }
}

function DemoTerminal({ terminal, tuning, register, onPointerDown, onKeyDown, patching, isEligible, isCursorTarget }) {
  const isSource = patching?.sourceId === terminal.id
  const dim = patching && !isEligible && !isSource ? 0.3 : 1
  const size = tuning.termSize
  const hole = tuning.termHole
  const cable = tuning.termCable
  const bend = tuning.termBend
  const visible = tuning.termVisible
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      aria-label={`${terminal.label}, terminal, ${isEligible ? 'eligible target' : isSource ? 'patch source' : 'press Enter to start patch'}`}
      style={{
        position: 'absolute',
        left: terminal.x - size / 2,
        top: terminal.y - size / 2,
        width: size,
        height: size,
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'crosshair',
        opacity: dim,
      }}
    >
      {/* Decorative cable stub through the wall */}
      <svg
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0, top: 0,
          width: size, height: size,
          overflow: 'visible',
          pointerEvents: 'none',
        }}
      >
        <path
          d={termCablePath(terminal.wall, bend, visible)}
          fill="none"
          stroke={terminal.color}
          strokeWidth={cable}
          strokeLinecap="butt"
          strokeLinejoin="round"
          transform={`translate(${size / 2}, ${size / 2})`}
        />
      </svg>

      {/* Dot — this is the patch jack */}
      <div
        ref={register}
        aria-hidden="true"
        style={{
          position: 'relative',
          width: size,
          height: size,
          borderRadius: '50%',
          background: terminal.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isCursorTarget
            ? `0 0 0 3px ${color.focus}`
            : isSource
              ? `0 0 0 2px ${color.primary}`
              : 'none',
        }}
      >
        <div
          style={{
            width: hole,
            height: hole,
            borderRadius: '50%',
            background: isSource || isCursorTarget ? terminal.color : color.white,
            transition: 'background 0.15s',
          }}
        />
      </div>

      <span
        style={{
          position: 'absolute',
          right: size + 8,
          top: (size - 14) / 2,
          ...type.mono,
          color: color.muted,
          fontSize: 11,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >{terminal.label}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findEligibleTarget(sourceId, x, y, anchors) {
  const src = JACK_BY_ID[sourceId]
  if (!src) return null
  let best = null, bestD = 28
  for (const j of ALL_JACKS) {
    if (j.kind === src.kind || j.id === sourceId) continue
    const a = anchors[j.id]
    if (!a) continue
    const d = Math.hypot(a.x - x, a.y - y)
    if (d < bestD) { best = j.id; bestD = d }
  }
  return best
}
