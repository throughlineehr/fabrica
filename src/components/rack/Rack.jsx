// Rack — horizontal layout of processor panels at fixed height with a
// cable layer floating on top.
//
// Spec: PROCESSOR-PANEL-SPEC.md, INTERNAL-WIRING-DESIGN.md.
//
// Each processor instance gets its own Panel rendered left-to-right.
// The rack scrolls horizontally if the combined width exceeds the
// viewport. Cables are SVG paths on a position:absolute layer that
// overlays the panel row, drawn with the verlet physics in
// `wiring/verlet.js`.

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { color } from '../../styles'
import { useA11yType } from '../../hooks/useA11yType'
import { Panel } from './Panel'
import { PANEL_HEIGHT } from './panelSchema'
import { makeChain, stepChain, pathFromPoints } from '../wiring/verlet'

const TUNING = {
  segments: 16,
  iterations: 18,
  gravity: 0.32,
  damping: 0.78,
  slack: 1.10,
  restEpsilon: 0.06,
  restFramesNeeded: 4,
  cableStroke: 8,
  cableStrokeSelected: 10,
  ghostStroke: 8,
  endpointRadius: 9,
  endpointHole: 4,
  cableOpacity: 0.92,
}

function jackKey(instanceId, portId) {
  return `${instanceId}::${portId}`
}

function jackQuery(instanceId, portId) {
  return `[data-jack-instance="${instanceId}"][data-jack-port="${portId}"]`
}

function readJackCenter(rackEl, instanceId, portId) {
  if (!rackEl) return null
  const el = rackEl.querySelector(jackQuery(instanceId, portId))
  if (!el) return null
  const rb = rackEl.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  return {
    x: r.left - rb.left + r.width / 2,
    y: r.top - rb.top + r.height / 2,
  }
}

function jackUnderPoint(rackEl, x, y) {
  if (!rackEl) return null
  // Find any jack within hit radius of (x, y)
  const jacks = rackEl.querySelectorAll('[data-jack-id]')
  const rb = rackEl.getBoundingClientRect()
  let best = null
  let bestD = 24
  for (const el of jacks) {
    const r = el.getBoundingClientRect()
    const cx = r.left - rb.left + r.width / 2
    const cy = r.top - rb.top + r.height / 2
    const d = Math.hypot(cx - x, cy - y)
    if (d < bestD) {
      bestD = d
      best = {
        instanceId: el.getAttribute('data-jack-instance'),
        portId: el.getAttribute('data-jack-port'),
        kind: el.getAttribute('data-jack-kind'),
      }
    }
  }
  return best
}

// ----------------------------------------------------------------------------

export function Rack({
  processors,
  processorState = {},
  cables = [],
  onConfigChange,
  onAddCable,
  onRemoveCable,
  systemColor = 's3',
}) {
  const t = useA11yType()
  const rackRef = useRef(null)
  const chainsRef = useRef(new Map()) // cableId -> chain
  const ghostChainRef = useRef(null)
  const [frame, setFrame] = useState({ paths: {}, ghostPath: null, anchors: {} })
  const [patching, setPatching] = useState(null) // { sourceJack: {instanceId, portId, kind}, cursor: {x,y}, mode }
  const [selectedCable, setSelectedCable] = useState(null)
  const [announce, setAnnounce] = useState('')

  // Build a map cable -> { from, to } anchor jack identifiers
  const cableSpec = useMemo(() => cables.map(c => ({
    id: c.id,
    src: { instanceId: c.sourceInstanceId, portId: c.sourcePortId },
    dst: { instanceId: c.targetInstanceId, portId: c.targetPortId },
    color: c.color,
  })), [cables])

  // ---- rAF physics loop ----
  useEffect(() => {
    let raf
    const loop = () => {
      const rackEl = rackRef.current
      if (!rackEl) { raf = requestAnimationFrame(loop); return }

      // Anchors
      const anchors = {}
      const liveIds = new Set(cableSpec.map(c => c.id))
      // Drop chains for removed cables
      for (const id of Array.from(chainsRef.current.keys())) {
        if (!liveIds.has(id)) chainsRef.current.delete(id)
      }
      const cablePaths = {}
      for (const cab of cableSpec) {
        const a = readJackCenter(rackEl, cab.src.instanceId, cab.src.portId)
        const b = readJackCenter(rackEl, cab.dst.instanceId, cab.dst.portId)
        if (!a || !b) continue
        anchors[jackKey(cab.src.instanceId, cab.src.portId)] = a
        anchors[jackKey(cab.dst.instanceId, cab.dst.portId)] = b
        let chain = chainsRef.current.get(cab.id)
        if (!chain || chain.points.length !== TUNING.segments) {
          chain = makeChain(a, b, TUNING.segments)
          chainsRef.current.set(cab.id, chain)
        }
        stepChain(chain, a, b, TUNING)
        cablePaths[cab.id] = pathFromPoints(chain.points)
      }

      // Ghost
      let ghostPath = null
      if (patching) {
        const a = readJackCenter(rackEl, patching.sourceJack.instanceId, patching.sourceJack.portId)
        const b = patching.cursor
        if (a && b) {
          if (!ghostChainRef.current || ghostChainRef.current.points.length !== TUNING.segments) {
            ghostChainRef.current = makeChain(a, b, TUNING.segments)
          }
          stepChain(ghostChainRef.current, a, b, TUNING)
          ghostPath = pathFromPoints(ghostChainRef.current.points)
        }
      } else if (ghostChainRef.current) {
        ghostChainRef.current = null
      }

      setFrame({ paths: cablePaths, ghostPath, anchors })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [cableSpec, patching])

  // ---- commit (declared before patch handlers because they reference it) ----
  const commitCable = useCallback((src, dst) => {
    // Normalize: source is always the output side
    const out = src.kind === 'output' ? src : dst
    const inn = src.kind === 'output' ? dst : src
    const exists = cables.some(c =>
      c.sourceInstanceId === out.instanceId && c.sourcePortId === out.portId &&
      c.targetInstanceId === inn.instanceId && c.targetPortId === inn.portId
    )
    if (exists) { setAnnounce('Cable already exists.'); return }
    onAddCable?.({
      sourceInstanceId: out.instanceId,
      sourcePortId: out.portId,
      targetInstanceId: inn.instanceId,
      targetPortId: inn.portId,
    })
    setAnnounce(`Cable from ${out.portId} to ${inn.portId} created.`)
  }, [cables, onAddCable])

  // ---- patch start (mouse) on jack ----
  // Use event delegation at the rack level — when a jack receives pointerdown,
  // start a patch. Cables already wired to that jack are detached first.
  const onRackPointerDown = useCallback((e) => {
    const target = e.target.closest('[data-jack-id]')
    if (!target) return
    e.preventDefault()
    setSelectedCable(null)
    const instanceId = target.getAttribute('data-jack-instance')
    const portId = target.getAttribute('data-jack-port')
    const kind = target.getAttribute('data-jack-kind')

    // If this jack is on an existing cable, detach it; the OTHER end becomes
    // the patch source, cursor at this jack.
    const existing = cables.find(c =>
      (c.sourceInstanceId === instanceId && c.sourcePortId === portId) ||
      (c.targetInstanceId === instanceId && c.targetPortId === portId)
    )

    if (existing) {
      const otherIs = existing.sourceInstanceId === instanceId && existing.sourcePortId === portId
      const otherInstanceId = otherIs ? existing.targetInstanceId : existing.sourceInstanceId
      const otherPortId = otherIs ? existing.targetPortId : existing.sourcePortId
      const otherKind = otherIs ? 'input' : 'output'
      onRemoveCable?.(existing.id)
      const here = readJackCenter(rackRef.current, instanceId, portId) || { x: 0, y: 0 }
      setPatching({
        sourceJack: { instanceId: otherInstanceId, portId: otherPortId, kind: otherKind },
        cursor: here,
        mode: 'mouse',
      })
      setAnnounce('Cable detached. Drag to a new jack.')
      return
    }

    const here = readJackCenter(rackRef.current, instanceId, portId) || { x: 0, y: 0 }
    setPatching({
      sourceJack: { instanceId, portId, kind },
      cursor: here,
      mode: 'mouse',
    })
    setAnnounce(`Patching from ${portId}. Drag to a target jack.`)
  }, [cables, onRemoveCable])

  // ---- mouse move + up while patching ----
  useEffect(() => {
    if (!patching || patching.mode !== 'mouse') return
    const onMove = (e) => {
      const rb = rackRef.current?.getBoundingClientRect()
      if (!rb) return
      setPatching(p => p && ({ ...p, cursor: { x: e.clientX - rb.left, y: e.clientY - rb.top } }))
    }
    const onUp = (e) => {
      const rb = rackRef.current?.getBoundingClientRect()
      if (!rb) { setPatching(null); return }
      const x = e.clientX - rb.left
      const y = e.clientY - rb.top
      const target = jackUnderPoint(rackRef.current, x, y)
      if (target && target.kind !== patching.sourceJack.kind &&
          !(target.instanceId === patching.sourceJack.instanceId && target.portId === patching.sourceJack.portId)) {
        commitCable(patching.sourceJack, target)
      } else {
        setAnnounce('Patch cancelled.')
      }
      setPatching(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patching])

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

  // ---- ghost color from source port's resolved jack color ----
  const ghostColor = useMemo(() => {
    if (!patching) return color.primary
    const c = cables[0]?.color
    return c || color.primary
  }, [patching, cables])

  // ---- render ----
  const totalWidth = processors.reduce((sum, { def }) => sum + (def.panel?.widthHP || 4) * 24, 0)

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
            systemColor={systemColor}
          />
        ))}

        <svg
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          {cableSpec.map(cab => {
            const d = frame.paths[cab.id]
            const a = frame.anchors[jackKey(cab.src.instanceId, cab.src.portId)]
            const b = frame.anchors[jackKey(cab.dst.instanceId, cab.dst.portId)]
            const isSelected = selectedCable === cab.id
            const stroke = cab.color || color.primary
            return (
              <g key={cab.id}>
                <path
                  d={d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={isSelected ? TUNING.cableStrokeSelected : TUNING.cableStroke}
                  strokeOpacity={isSelected ? 1 : TUNING.cableOpacity}
                  strokeLinecap="round"
                  style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  onMouseDown={(e) => { e.stopPropagation(); setSelectedCable(cab.id); setAnnounce('Cable selected. Press Delete to remove.') }}
                />
                {a && (<>
                  <circle cx={a.x} cy={a.y} r={TUNING.endpointRadius} fill={stroke} />
                  <circle cx={a.x} cy={a.y} r={TUNING.endpointHole} fill={color.white} />
                </>)}
                {b && (<>
                  <circle cx={b.x} cy={b.y} r={TUNING.endpointRadius} fill={stroke} />
                  <circle cx={b.x} cy={b.y} r={TUNING.endpointHole} fill={color.white} />
                </>)}
              </g>
            )
          })}
          {frame.ghostPath && (
            <>
              <path
                d={frame.ghostPath}
                fill="none"
                stroke={ghostColor}
                strokeWidth={TUNING.ghostStroke}
                strokeOpacity={0.55}
                strokeLinecap="round"
              />
              {patching?.cursor && (<>
                <circle cx={patching.cursor.x} cy={patching.cursor.y} r={TUNING.endpointRadius} fill={ghostColor} fillOpacity={0.55} />
                <circle cx={patching.cursor.x} cy={patching.cursor.y} r={TUNING.endpointHole} fill={color.white} />
              </>)}
            </>
          )}
        </svg>
      </div>

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
