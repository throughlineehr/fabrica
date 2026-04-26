// Rack — horizontal layout of processor panels at fixed height with a
// viewport-fixed cable layer floating on top.
//
// Spec: PROCESSOR-PANEL-SPEC.md, INTERNAL-WIRING-DESIGN.md.
//
// Cables connect anchor descriptors. Two anchor kinds today:
//   { kind: 'jack',     instanceId, portId }
//   { kind: 'terminal', terminalId, nodeId, systemKey }
//
// Both kinds expose data attributes on their DOM elements; the cable
// layer queries the document for them and reads getBoundingClientRect
// each rAF frame. Coordinates are in viewport space throughout — the
// SVG layer is position:fixed at viewport (0,0) so cables can extend
// beyond the rack tab's overflow:auto bounds and reach wall terminals
// at the room edges.

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { color } from '../../styles'
import { useA11yType } from '../../hooks/useA11yType'
import { Panel } from './Panel'
import { PANEL_HEIGHT } from './panelSchema'
import { makeChain, stepChain, pathFromPoints } from '../wiring/verlet'

const TUNING = {
  // Adaptive segment count: short cables get the floor, long ones get more
  // segments so the curve stays smooth instead of breaking into visible
  // straight pieces. minSegments must stay ≥ 4 for the verlet sim to make
  // sense; pixelsPerSegment is the target spacing.
  minSegments: 16,
  maxSegments: 56,
  pixelsPerSegment: 26,
  iterations: 20,
  gravity: 2.2,      // strong fall — was 1.6, still floaty on long cables
  damping: 0.90,     // velocity preserved frame-to-frame (less drag = heavier feel)
  slack: 1.10,
  restEpsilon: 0.5,
  restFramesNeeded: 4,
  cableStroke: 8,
  cableStrokeSelected: 10,
  ghostStroke: 8,
  endpointRadius: 9,
  endpointHole: 4,
  cableOpacity: 0.92,
}

// Pick a segment count proportional to cable length, clamped. We bucket
// (and only rebuild on a >4-segment delta) so jacks moving by a few pixels
// don't recreate the chain and lose physics state.
function computeSegments(a, b, t) {
  const dist = Math.hypot(b.x - a.x, b.y - a.y)
  return Math.max(t.minSegments, Math.min(t.maxSegments, Math.round(dist / t.pixelsPerSegment)))
}

// ----------------------------------------------------------------------------
// Anchor descriptor helpers
// ----------------------------------------------------------------------------

function selectorFor(d) {
  if (!d) return null
  if (d.kind === 'jack') {
    return `[data-jack-instance="${d.instanceId}"][data-jack-port="${d.portId}"]`
  }
  if (d.kind === 'terminal') {
    return `[data-terminal-id="${d.terminalId}"]`
  }
  return null
}

function readAnchorCenter(descriptor) {
  const sel = selectorFor(descriptor)
  if (!sel) return null
  // Query at document level — terminals live OUTSIDE the rack DOM.
  const el = document.querySelector(sel)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

// Find the anchor (jack OR terminal) under a viewport point. Returns a
// descriptor with kind + ids + a "polarity" hint ('input'|'output'|'both').
function anchorUnderPoint(x, y) {
  const els = document.querySelectorAll('[data-jack-id], [data-terminal-id]')
  let best = null
  let bestD = 28
  for (const el of els) {
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const d = Math.hypot(cx - x, cy - y)
    if (d >= bestD) continue
    bestD = d
    if (el.hasAttribute('data-terminal-id')) {
      best = {
        kind: 'terminal',
        terminalId: el.getAttribute('data-terminal-id'),
        nodeId: el.getAttribute('data-terminal-node-id'),
        systemKey: el.getAttribute('data-terminal-system-key'),
        polarity: 'both',
        color: el.getAttribute('data-terminal-color') || null,
      }
    } else {
      best = {
        kind: 'jack',
        instanceId: el.getAttribute('data-jack-instance'),
        portId: el.getAttribute('data-jack-port'),
        polarity: el.getAttribute('data-jack-kind'), // input|output
      }
    }
  }
  return best
}

// Two anchors are eligible to connect if their polarities are opposite,
// OR at least one is 'both' (terminals are bidirectional).
function polaritiesCompatible(a, b) {
  if (!a || !b) return false
  if (a.polarity === 'both' || b.polarity === 'both') return true
  return a.polarity !== b.polarity
}

function sameAnchor(a, b) {
  if (!a || !b) return false
  if (a.kind !== b.kind) return false
  if (a.kind === 'jack') return a.instanceId === b.instanceId && a.portId === b.portId
  if (a.kind === 'terminal') return a.terminalId === b.terminalId
  return false
}

// ----------------------------------------------------------------------------

export function Rack({
  processors,
  processorState = {},
  cables = [],
  onConfigChange,
  onBroadcastChange,
  onAddCable,
  onRemoveCable,
  onOpenLibrary,
  systemColor = 's3',
}) {
  const t = useA11yType()
  const rackRef = useRef(null)
  const chainsRef = useRef(new Map())
  const ghostChainRef = useRef(null)
  const [frame, setFrame] = useState({ paths: {}, ghostPath: null })
  // patching: { source: <descriptor>, cursor: {x,y}, mode } | null
  const [patching, setPatching] = useState(null)
  const [selectedCable, setSelectedCable] = useState(null)
  const [announce, setAnnounce] = useState('')

  // ---- rAF physics loop ----
  useEffect(() => {
    let raf
    const loop = () => {
      // Cable paths
      const liveIds = new Set(cables.map(c => c.id))
      for (const id of Array.from(chainsRef.current.keys())) {
        if (!liveIds.has(id)) chainsRef.current.delete(id)
      }
      const paths = {}
      for (const cab of cables) {
        const a = readAnchorCenter(cab.source)
        const b = readAnchorCenter(cab.target)
        if (!a || !b) continue
        const targetSegs = computeSegments(a, b, TUNING)
        let chain = chainsRef.current.get(cab.id)
        // Rebuild only when segment count differs meaningfully — small
        // anchor moves shouldn't trash the simulation state.
        if (!chain || Math.abs(chain.points.length - targetSegs) > 4) {
          chain = makeChain(a, b, targetSegs)
          chainsRef.current.set(cab.id, chain)
        }
        stepChain(chain, a, b, TUNING)
        paths[cab.id] = { d: pathFromPoints(chain.points), a, b }
      }

      // Ghost
      let ghost = null
      if (patching) {
        const a = readAnchorCenter(patching.source)
        const b = patching.cursor
        if (a && b) {
          const targetSegs = computeSegments(a, b, TUNING)
          if (!ghostChainRef.current || Math.abs(ghostChainRef.current.points.length - targetSegs) > 4) {
            ghostChainRef.current = makeChain(a, b, targetSegs)
          }
          stepChain(ghostChainRef.current, a, b, TUNING)
          ghost = { d: pathFromPoints(ghostChainRef.current.points), a, b }
        }
      } else if (ghostChainRef.current) {
        ghostChainRef.current = null
      }

      setFrame({ paths, ghostPath: ghost?.d || null, ghostA: ghost?.a, ghostB: ghost?.b })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [cables, patching])

  // ---- commit a new cable ----
  const commitCable = useCallback((src, dst) => {
    if (!polaritiesCompatible(src, dst) || sameAnchor(src, dst)) {
      setAnnounce('Cannot connect — incompatible jacks.')
      return
    }
    // Normalize so the cable's `source` is the output side when one of the
    // two anchors is a jack with kind='output'. Terminals stay where they
    // were dropped (their polarity is 'both').
    let source = src, target = dst
    if (src.polarity === 'input' && dst.polarity === 'output') {
      source = dst; target = src
    }
    const exists = cables.some(c => sameAnchor(c.source, source) && sameAnchor(c.target, target))
    if (exists) { setAnnounce('Cable already exists.'); return }
    const cabColor = src.color || dst.color || color.s3.fill
    onAddCable?.({ source, target, color: cabColor })
    setAnnounce('Cable created.')
  }, [cables, onAddCable])

  // ---- start a patch (jack OR terminal) ----
  // Detach the existing cable if any; the OTHER end becomes the source.
  const startPatch = useCallback((descriptor, cursorClient) => {
    setSelectedCable(null)
    const existing = cables.find(c => sameAnchor(c.source, descriptor) || sameAnchor(c.target, descriptor))
    if (existing) {
      const otherIsSource = sameAnchor(existing.source, descriptor) ? false : true
      const survivingEnd = otherIsSource ? existing.source : existing.target
      onRemoveCable?.(existing.id)
      const here = readAnchorCenter(descriptor) || cursorClient
      setPatching({ source: survivingEnd, cursor: here, mode: 'mouse' })
      setAnnounce('Cable detached. Drag to a new patch point.')
      return
    }
    const here = readAnchorCenter(descriptor) || cursorClient
    setPatching({ source: descriptor, cursor: here, mode: 'mouse' })
    setAnnounce('Patching. Drag to a target patch point.')
  }, [cables, onRemoveCable])

  // ---- pointerdown event delegation: jacks (within rack) AND terminals
  //      (anywhere in the document while Rack is mounted) ----
  useEffect(() => {
    const onWindowPointerDown = (e) => {
      // Terminals: capture-phase, document-wide, but only while Rack is mounted.
      const term = e.target.closest?.('[data-terminal-id]')
      if (term) {
        e.preventDefault()
        e.stopPropagation()
        const desc = {
          kind: 'terminal',
          terminalId: term.getAttribute('data-terminal-id'),
          nodeId: term.getAttribute('data-terminal-node-id'),
          systemKey: term.getAttribute('data-terminal-system-key'),
          polarity: 'both',
          color: term.getAttribute('data-terminal-color') || null,
        }
        startPatch(desc, { x: e.clientX, y: e.clientY })
        return
      }
    }
    document.addEventListener('pointerdown', onWindowPointerDown, true)
    return () => document.removeEventListener('pointerdown', onWindowPointerDown, true)
  }, [startPatch])

  const onRackPointerDown = useCallback((e) => {
    const jack = e.target.closest('[data-jack-id]')
    if (!jack) return
    e.preventDefault()
    const desc = {
      kind: 'jack',
      instanceId: jack.getAttribute('data-jack-instance'),
      portId: jack.getAttribute('data-jack-port'),
      polarity: jack.getAttribute('data-jack-kind'),
    }
    startPatch(desc, { x: e.clientX, y: e.clientY })
  }, [startPatch])

  // ---- mouse move + up while patching (cursor is in viewport coords) ----
  useEffect(() => {
    if (!patching || patching.mode !== 'mouse') return
    const onMove = (e) => {
      setPatching(p => p && ({ ...p, cursor: { x: e.clientX, y: e.clientY } }))
    }
    const onUp = (e) => {
      const target = anchorUnderPoint(e.clientX, e.clientY)
      if (target) commitCable(patching.source, target)
      else setAnnounce('Patch cancelled.')
      setPatching(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [patching, commitCable])

  // ---- delete selected cable ----
  useEffect(() => {
    if (!selectedCable) return
    const onKey = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        onRemoveCable?.(selectedCable)
        setSelectedCable(null)
        setAnnounce('Cable removed.')
        e.preventDefault()
      } else if (e.key === 'Escape') {
        setSelectedCable(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedCable, onRemoveCable])

  // ---- escape during patch ----
  useEffect(() => {
    if (!patching) return
    const onKey = (e) => {
      if (e.key === 'Escape') { setPatching(null); setAnnounce('Patch cancelled.'); e.preventDefault() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [patching])

  const ghostColor = useMemo(() => {
    if (!patching) return color.primary
    return patching.source.color || color.primary
  }, [patching])

  const ADD_SLOT_HP = 4 // 4HP-wide "+ add processor" slot to the right of the last panel
  const ADD_SLOT_WIDTH = ADD_SLOT_HP * 24
  const totalWidth =
    processors.reduce((sum, { def }) => sum + (def.panel?.widthHP || 4) * 24, 0) +
    ADD_SLOT_WIDTH

  return (
    <div
      role="region"
      aria-label="processor rack"
      style={{ position: 'relative', overflow: 'auto', background: color.surface, border: `1px solid ${color.border}` }}
    >
      <div
        ref={rackRef}
        onPointerDown={onRackPointerDown}
        onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedCable(null) }}
        style={{
          position: 'relative',
          display: 'flex', flexDirection: 'row',
          width: Math.max(totalWidth, 100),
          height: PANEL_HEIGHT,
          userSelect: 'none',
        }}
      >
        {processors.map(({ instance, def }) => (
          <Panel
            key={instance.id}
            manifest={def.panel}
            processorDef={def}
            instance={instance}
            state={processorState[instance.id]}
            onConfigChange={(patch) => onConfigChange?.(instance.id, patch)}
            onBroadcastChange={(next) => onBroadcastChange?.(instance.id, next)}
            systemColor={systemColor}
          />
        ))}
        <button
          type="button"
          onClick={() => onOpenLibrary?.()}
          aria-label="Add processor"
          style={{
            flex: '0 0 auto',
            width: ADD_SLOT_WIDTH,
            height: PANEL_HEIGHT,
            background: color.surfaceMuted,
            border: `1px dashed ${color.border}`,
            cursor: 'pointer',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8,
            color: color.muted,
            ...t.mono, fontSize: 10,
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}
        >
          <Plus size={20} strokeWidth={1.5} aria-hidden="true" />
          <span>add</span>
        </button>
      </div>

      {/* Cable layer — viewport-fixed so it escapes all ancestor overflow */}
      <svg
        aria-hidden="true"
        style={{
          position: 'fixed', left: 0, top: 0,
          width: '100vw', height: '100vh',
          pointerEvents: 'none', overflow: 'visible',
          zIndex: 100,
        }}
      >
        {cables.map(cab => {
          const path = frame.paths[cab.id]
          if (!path) return null
          const isSelected = selectedCable === cab.id
          const stroke = cab.color || color.primary
          return (
            <g key={cab.id}>
              <path
                d={path.d}
                fill="none"
                stroke={stroke}
                strokeWidth={isSelected ? TUNING.cableStrokeSelected : TUNING.cableStroke}
                strokeOpacity={isSelected ? 1 : TUNING.cableOpacity}
                strokeLinecap="round"
                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                onMouseDown={(e) => { e.stopPropagation(); setSelectedCable(cab.id); setAnnounce('Cable selected. Press Delete to remove.') }}
              />
              <circle cx={path.a.x} cy={path.a.y} r={TUNING.endpointRadius} fill={stroke} />
              <circle cx={path.a.x} cy={path.a.y} r={TUNING.endpointHole} fill={color.white} />
              <circle cx={path.b.x} cy={path.b.y} r={TUNING.endpointRadius} fill={stroke} />
              <circle cx={path.b.x} cy={path.b.y} r={TUNING.endpointHole} fill={color.white} />
            </g>
          )
        })}
        {frame.ghostPath && frame.ghostA && (
          <>
            <path
              d={frame.ghostPath}
              fill="none"
              stroke={ghostColor}
              strokeWidth={TUNING.ghostStroke}
              strokeOpacity={0.55}
              strokeLinecap="round"
            />
            <circle cx={frame.ghostA.x} cy={frame.ghostA.y} r={TUNING.endpointRadius} fill={ghostColor} fillOpacity={0.55} />
            <circle cx={frame.ghostA.x} cy={frame.ghostA.y} r={TUNING.endpointHole} fill={color.white} />
            {frame.ghostB && (
              <>
                <circle cx={frame.ghostB.x} cy={frame.ghostB.y} r={TUNING.endpointRadius} fill={ghostColor} fillOpacity={0.55} />
                <circle cx={frame.ghostB.x} cy={frame.ghostB.y} r={TUNING.endpointHole} fill={color.white} />
              </>
            )}
          </>
        )}
      </svg>

      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {announce}
      </div>

      {processors.length === 0 && (
        <div style={{ ...t.mono, color: color.muted, padding: 24, textAlign: 'center' }}>
          No processors in this room.
        </div>
      )}
    </div>
  )
}
