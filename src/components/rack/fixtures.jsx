// Fixture primitive components for the Rack tab.
//
// Per PROCESSOR-PANEL-SPEC.md §6, every panel composes itself from these
// 11 catalog entries. Each fixture is flat / structural — shape carries
// the metaphor, never faux-metal.
//
// Sizing: each fixture is rendered inside a CSS grid cell sized by the
// panel renderer (via gridColumn/gridRow). Fixtures size themselves to
// `100%` of their grid cell and center their visual element.
//
// Accessibility:
//   - Every interactive fixture is keyboard-reachable.
//   - aria-labels come from the `label` prop or the fixture id.
//   - Color is paired with shape per WCAG 1.4.1 — never the only signal.

import { useId, useRef, useEffect, useState } from 'react'
import { color } from '../../styles'
import { useA11yType } from '../../hooks/useA11yType'

const HP = 24

// --- Helpers --------------------------------------------------------------

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)) }

function valueToFraction(value, range) {
  if (!Array.isArray(range) || range.length !== 2) return 0.5
  const [min, max] = range
  if (max === min) return 0.5
  return clamp((value - min) / (max - min), 0, 1)
}

// Color resolution: 's1'..'algedonic' → color object from styles.js
function resolveAccent(key) {
  if (!key) return color.s3
  if (color[key]?.fill) return color[key]
  return color.s3
}

// --- Knob -----------------------------------------------------------------

export function Knob({ id, label, value, range = [0, 1], step, unit, color: accentKey, readOnly, onChange }) {
  const t = useA11yType()
  const accent = resolveAccent(accentKey)
  const inputId = useId()
  const fraction = valueToFraction(value, range)
  // Knob pointer rotates -135° (min) to +135° (max), 270° sweep
  const angle = -135 + fraction * 270
  const display = unit ? `${value}${unit}` : `${value}`

  const handleKey = (e) => {
    if (readOnly || !onChange) return
    const stepSize = step || (range[1] - range[0]) / 100
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault(); onChange(clamp(value + stepSize, range[0], range[1]))
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault(); onChange(clamp(value - stepSize, range[0], range[1]))
    } else if (e.key === 'Home') {
      e.preventDefault(); onChange(range[0])
    } else if (e.key === 'End') {
      e.preventDefault(); onChange(range[1])
    }
  }

  // Drag-to-rotate. Vertical drag is the synth-native gesture (up = increase).
  // 200px traverses the whole range; hold Shift for ~5x precision.
  const dragRef = useRef(null)
  const onPointerDown = (e) => {
    if (readOnly || !onChange) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startY: e.clientY, startValue: value, span: range[1] - range[0] }
  }
  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const dy = d.startY - e.clientY // up = increase
    const sensitivity = e.shiftKey ? 1000 : 200
    const delta = (dy / sensitivity) * d.span
    let next = d.startValue + delta
    if (step) next = Math.round(next / step) * step
    next = clamp(next, range[0], range[1])
    if (next !== value) onChange(next)
  }
  const onPointerUp = (e) => {
    if (!dragRef.current) return
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    dragRef.current = null
  }
  const onDoubleClick = (e) => {
    // Double-click resets to the midpoint of the range — handy escape hatch.
    if (readOnly || !onChange) return
    e.preventDefault()
    onChange((range[0] + range[1]) / 2)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%', height: '100%' }}>
      <button
        type="button"
        id={inputId}
        role={readOnly ? 'img' : 'slider'}
        aria-valuenow={typeof value === 'number' ? value : undefined}
        aria-valuemin={range[0]}
        aria-valuemax={range[1]}
        aria-valuetext={display}
        aria-label={label || id}
        aria-readonly={readOnly ? 'true' : undefined}
        onKeyDown={handleKey}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        title={readOnly ? display : `${display} — drag to change, Shift for fine, double-click for centre`}
        style={{
          width: '60%', aspectRatio: '1 / 1',
          minWidth: 18, minHeight: 18,
          borderRadius: '50%',
          background: accent.fill,
          border: `2px solid ${accent.stroke}`,
          padding: 0,
          cursor: readOnly ? 'default' : 'ns-resize',
          position: 'relative',
          touchAction: 'none', // prevent scroll-while-dragging on touch
        }}
      >
        {/* Pointer line — single 2px line from center to edge */}
        <span aria-hidden="true" style={{
          position: 'absolute',
          left: '50%', top: '50%',
          width: 2, height: '40%',
          background: accent.stroke,
          transform: `translate(-50%, -100%) rotate(${angle}deg)`,
          transformOrigin: '50% 100%',
        }} />
      </button>
      {label && <span style={{ ...t.mono, fontSize: 9, color: color.muted, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>}
    </div>
  )
}

// --- Jack -----------------------------------------------------------------
// The cable layer finds jacks by data attribute. Position is read from the
// rendered element's getBoundingClientRect at frame time.

export function Jack({ id, label, kind, port, color: accentKey, processorInstanceId, disabled = false }) {
  const t = useA11yType()
  const accent = resolveAccent(accentKey)
  // Jack visual: 22px outer, 10px hollow center (donut)
  // Disabled state: muted fill/stroke, no pointer events (so the rack's
  // capture-phase pointerdown listener never sees a jack hit), cursor not-allowed.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%', height: '100%' }}>
      <button
        type="button"
        data-jack-id={id}
        data-jack-kind={kind}
        data-jack-port={port}
        data-jack-instance={processorInstanceId}
        data-jack-disabled={disabled ? 'true' : undefined}
        aria-label={`${label || id}, ${kind}${disabled ? ' (disabled, broadcast on)' : ''}`}
        aria-disabled={disabled || undefined}
        style={{
          width: 22, height: 22,
          minWidth: 22, minHeight: 22,
          borderRadius: '50%',
          background: disabled ? color.surfaceMuted : accent.fill,
          border: 'none',
          padding: 0,
          cursor: disabled ? 'not-allowed' : 'crosshair',
          pointerEvents: disabled ? 'none' : undefined,
          opacity: disabled ? 0.5 : 1,
          position: 'relative',
          boxShadow: `inset 0 0 0 2px ${disabled ? color.border : accent.stroke}`,
        }}
      >
        <span aria-hidden="true" style={{
          position: 'absolute',
          left: '50%', top: '50%',
          width: 10, height: 10,
          marginLeft: -5, marginTop: -5,
          borderRadius: '50%',
          background: color.white,
        }} />
      </button>
      {label && <span style={{ ...t.mono, fontSize: 9, color: color.muted, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>}
    </div>
  )
}

// --- Toggle ---------------------------------------------------------------

export function Toggle({ id, label, value, options, readOnly, onChange }) {
  const t = useA11yType()
  // Binary by default; if `options` is provided, treat as multi-state cycle
  const isBinary = !options || options.length === 2
  const handleClick = () => {
    if (readOnly || !onChange) return
    if (isBinary) onChange(!value)
    else {
      const idx = options.findIndex(o => (o.value !== undefined ? o.value : o) === value)
      const next = options[(idx + 1) % options.length]
      onChange(next.value !== undefined ? next.value : next)
    }
  }
  const displayLabel = (() => {
    if (isBinary) return value ? 'ON' : 'OFF'
    const opt = options.find(o => (o.value !== undefined ? o.value : o) === value)
    return opt ? (opt.label || String(opt.value !== undefined ? opt.value : opt)) : String(value)
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%', height: '100%' }}>
      <button
        type="button"
        role="switch"
        aria-checked={isBinary ? Boolean(value) : undefined}
        aria-label={label || id}
        aria-readonly={readOnly ? 'true' : undefined}
        onClick={handleClick}
        style={{
          minWidth: 28, minHeight: 18,
          padding: '2px 8px',
          background: value ? color.primary : color.white,
          color: value ? color.white : color.primary,
          border: `1.5px solid ${color.primary}`,
          ...t.mono, fontSize: 10,
          cursor: readOnly ? 'default' : 'pointer',
          textTransform: 'uppercase',
        }}
      >{displayLabel}</button>
      {label && <span style={{ ...t.mono, fontSize: 9, color: color.muted, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>}
    </div>
  )
}

// --- Slider ---------------------------------------------------------------

export function Slider({ id, label, value, range = [0, 1], step, orient = 'h', readOnly, onChange }) {
  const t = useA11yType()
  const fraction = valueToFraction(value, range)
  const handleKey = (e) => {
    if (readOnly || !onChange) return
    const stepSize = step || (range[1] - range[0]) / 100
    const inc = (e.key === 'ArrowRight' || e.key === 'ArrowUp') ? +stepSize
              : (e.key === 'ArrowLeft' || e.key === 'ArrowDown') ? -stepSize
              : 0
    if (inc === 0) return
    e.preventDefault()
    onChange(clamp(value + inc, range[0], range[1]))
  }
  const isV = orient === 'v'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%', height: '100%' }}>
      <button
        type="button"
        role="slider"
        aria-valuenow={typeof value === 'number' ? value : undefined}
        aria-valuemin={range[0]}
        aria-valuemax={range[1]}
        aria-label={label || id}
        aria-orientation={isV ? 'vertical' : 'horizontal'}
        aria-readonly={readOnly ? 'true' : undefined}
        onKeyDown={handleKey}
        style={{
          width: isV ? 16 : '90%',
          height: isV ? '90%' : 12,
          padding: 0,
          background: color.surfaceMuted,
          border: `1px solid ${color.border}`,
          position: 'relative',
          cursor: readOnly ? 'default' : 'pointer',
        }}
      >
        <span aria-hidden="true" style={{
          position: 'absolute',
          [isV ? 'bottom' : 'left']: `${fraction * 100}%`,
          [isV ? 'left' : 'top']: '50%',
          width: isV ? '100%' : 6,
          height: isV ? 6 : '100%',
          marginLeft: isV ? 0 : -3,
          marginTop: isV ? -3 : 0,
          background: color.primary,
        }} />
      </button>
      {label && <span style={{ ...t.mono, fontSize: 9, color: color.muted, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>}
    </div>
  )
}

// --- Button (momentary) ---------------------------------------------------

export function Button({ id, label, onAction }) {
  const t = useA11yType()
  const [hover, setHover] = useState(false)
  const [flash, setFlash] = useState(false)

  const handleClick = () => {
    onAction?.()
    // Brief inverted flash so the user can SEE the button worked even when
    // the action is invisible (a server emit, a state change elsewhere).
    setFlash(true)
    setTimeout(() => setFlash(false), 140)
  }

  const inverted = flash
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', padding: 2 }}>
      <button
        type="button"
        aria-label={label || id}
        onClick={handleClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onBlur={() => setHover(false)}
        style={{
          width: '100%', height: '100%',
          background: inverted ? color.primary : (hover ? color.hoverBg : color.white),
          border: `1.5px solid ${color.primary}`,
          color: inverted ? color.white : color.primary,
          ...t.mono, fontSize: 10,
          textTransform: 'uppercase',
          padding: '2px 6px',
          cursor: 'pointer',
          transition: 'background 80ms linear, color 80ms linear',
        }}
      >{label || id}</button>
    </div>
  )
}

// --- LED (read-only indicator) --------------------------------------------

export function LED({ id, label, on, color: accentKey }) {
  const t = useA11yType()
  const accent = resolveAccent(accentKey)
  const fillColor = on ? accent.fill : color.borderLight
  const strokeColor = on ? accent.stroke : color.border
  return (
    <div
      role="status"
      aria-label={`${label || id}: ${on ? 'on' : 'off'}`}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%', height: '100%' }}
    >
      <span aria-hidden="true" style={{
        width: 12, height: 12, minWidth: 12, minHeight: 12,
        borderRadius: '50%',
        background: fillColor,
        border: `1.5px solid ${strokeColor}`,
      }} />
      {label && <span style={{ ...t.mono, fontSize: 9, color: color.muted, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>}
    </div>
  )
}

// --- Display (read-only readout) ------------------------------------------

export function Display({ id, label, value, format }) {
  const t = useA11yType()
  const formatted = (() => {
    if (value == null) return '—'
    if (format === 'time') {
      const d = new Date(value)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }
    if (typeof format === 'string' && format.startsWith('truncate(')) {
      const max = parseInt(format.slice(9, -1), 10) || 20
      const s = String(value)
      return s.length > max ? s.slice(0, max - 1) + '…' : s
    }
    return String(value)
  })()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', gap: 2, width: '100%', height: '100%' }}>
      <output aria-label={label || id} style={{
        flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        background: color.primary, color: color.s1.fill,
        ...t.mono, fontSize: 11,
        padding: '0 6px',
        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        fontVariantNumeric: 'tabular-nums',
      }}>{formatted}</output>
      {label && <span style={{ ...t.mono, fontSize: 9, color: color.muted, textTransform: 'uppercase', whiteSpace: 'nowrap', textAlign: 'center' }}>{label}</span>}
    </div>
  )
}

// --- Label (static text) --------------------------------------------------

export function Label({ text, size = 'sm', color: accentKey }) {
  const t = useA11yType()
  const sizeMap = { xs: 8, sm: 10, md: 12 }
  const fontSize = sizeMap[size] || 10
  const accent = accentKey ? resolveAccent(accentKey).stroke : color.muted
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
      <span style={{
        ...t.mono, fontSize, color: accent,
        textTransform: 'uppercase', letterSpacing: '0.05em',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{text}</span>
    </div>
  )
}

// --- Divider --------------------------------------------------------------

export function Divider({ orient = 'h' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', padding: 4 }}>
      <span style={{
        background: color.border,
        width: orient === 'v' ? 1 : '100%',
        height: orient === 'v' ? '100%' : 1,
      }} />
    </div>
  )
}

// --- Dropdown -------------------------------------------------------------

export function Dropdown({ id, label, value, options = [], readOnly, onChange }) {
  const t = useA11yType()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', gap: 2, width: '100%', height: '100%' }}>
      <select
        aria-label={label || id}
        value={value ?? ''}
        disabled={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        style={{
          width: '100%',
          ...t.mono, fontSize: 11,
          padding: '2px 6px',
          background: color.white,
          color: color.primary,
          border: `1px solid ${color.border}`,
          cursor: readOnly ? 'default' : 'pointer',
        }}
      >
        {options.map(opt => {
          const v = opt.value !== undefined ? opt.value : opt
          const l = opt.label !== undefined ? opt.label : String(v)
          return <option key={v} value={v}>{l}</option>
        })}
      </select>
      {label && <span style={{ ...t.mono, fontSize: 9, color: color.muted, textTransform: 'uppercase', whiteSpace: 'nowrap', textAlign: 'center' }}>{label}</span>}
    </div>
  )
}

// --- TextInput ------------------------------------------------------------

export function TextInput({ id, label, value, type = 'text', placeholder, readOnly, onChange }) {
  const t = useA11yType()
  const [local, setLocal] = useState(value ?? '')
  const lastValueRef = useRef(value)
  // Sync external changes
  useEffect(() => {
    if (value !== lastValueRef.current) {
      setLocal(value ?? '')
      lastValueRef.current = value
    }
  }, [value])
  const commit = () => {
    if (local !== value) onChange?.(local)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', gap: 2, width: '100%', height: '100%' }}>
      <input
        type={type === 'secret' ? 'password' : type}
        aria-label={label || id}
        value={local}
        placeholder={placeholder}
        readOnly={readOnly}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
        style={{
          width: '100%', boxSizing: 'border-box',
          ...t.mono, fontSize: 11,
          padding: '2px 6px',
          background: color.white,
          color: color.primary,
          border: `1px solid ${color.border}`,
        }}
      />
      {label && <span style={{ ...t.mono, fontSize: 9, color: color.muted, textTransform: 'uppercase', whiteSpace: 'nowrap', textAlign: 'center' }}>{label}</span>}
    </div>
  )
}

// --- HP / cell helpers ----------------------------------------------------

export { HP }
