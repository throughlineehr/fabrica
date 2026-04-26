import { useState, useEffect, useRef } from 'react'
import { color } from '../../styles'
import { useA11yType } from '../../hooks/useA11yType'
import { useTranslation } from '../../i18n/index.jsx'
import { resolveColor } from '../../utils/resolveColor'

// Defaults — overridden by tuning props when present
const DEFAULTS = {
  terminalSize: 29,
  hollowSize: 15,
  cableThickness: 23,
  bend: 22,
  visible: 60,
}

function dirArrow(dir, wall) {
  if (dir === 'both') return '⇄'
  if (dir === 'in') return ({ top: '↓', bottom: '↑', left: '→', right: '←' })[wall] || ''
  if (dir === 'out') return ({ top: '↑', bottom: '↓', left: '←', right: '→' })[wall] || ''
  return ''
}

// Path from (0,0) at terminal center: 45° bend then straight to wall edge
function cablePath(wall, bend, visible) {
  switch (wall) {
    case 'left':   return `M 0,0 L ${-bend},${-bend} L ${-bend - visible},${-bend}`
    case 'right':  return `M 0,0 L ${bend},${-bend} L ${bend + visible},${-bend}`
    case 'top':    return `M 0,0 L ${bend},${-bend} L ${bend},${-bend - visible}`
    case 'bottom': return `M 0,0 L ${-bend},${bend} L ${-bend},${bend + visible}`
    default: return ''
  }
}

export function CableTerminal({ terminal, active, onClick, tuning, connections, onNavigate, pulseCount = 0 }) {
  const t = useA11yType()
  const { t: tr } = useTranslation()
  const c = resolveColor(terminal.colorKey)
  const arrow = dirArrow(terminal.dir, terminal.wall)
  const isHorizontal = terminal.wall === 'left' || terminal.wall === 'right'
  const wallSide = terminal.wall === 'left' || terminal.wall === 'top'

  // Pulse: brief brightness flash when pulseCount changes
  const [pulsing, setPulsing] = useState(false)
  const prevCount = useRef(pulseCount)
  useEffect(() => {
    if (pulseCount !== prevCount.current && pulseCount > 0) {
      setPulsing(true)
      const timer = setTimeout(() => setPulsing(false), 300)
      prevCount.current = pulseCount
      return () => clearTimeout(timer)
    }
  }, [pulseCount])

  const cableColor = pulsing ? c.stroke : c.fill

  // Build label from resolved connections
  let label
  if (connections && connections.length === 1) {
    label = `${connections[0].verb} ${connections[0].name}`
  } else if (connections && connections.length > 1) {
    if (terminal.wall === 'bottom') {
      label = `${connections[0].verb} ${tr('systemPage.subsystems')}`
    } else {
      label = `${connections.length} ${connections[0].verb.toLowerCase()}`
    }
  } else {
    label = tr(terminal.labelKey)
  }

  // Navigable: single connection, not a subsystems group (bottom wall + multiple)
  const isSubsystems = terminal.wall === 'bottom' && connections && connections.length > 1
  const navigable = onNavigate && connections && connections.length === 1 && !isSubsystems
  const navTarget = navigable ? connections[0] : null

  const TERMINAL_SIZE = tuning?.terminalSize ?? DEFAULTS.terminalSize
  const HOLLOW_SIZE = tuning?.hollowSize ?? DEFAULTS.hollowSize
  const CABLE_THICKNESS = tuning?.cableThickness ?? DEFAULTS.cableThickness
  const BEND = tuning?.bend ?? DEFAULTS.bend
  const VISIBLE = tuning?.visible ?? DEFAULTS.visible

  // A cable terminal has two distinct actions: (1) select the terminal (shows
  // detail panel), (2) navigate to the connected peer if there's exactly one.
  // Two actions → two buttons, grouped. Nesting a <button> inside a <button>
  // (the previous <a href="#" role="link"> inside <button>) is invalid HTML
  // and confuses assistive tech; this structure is clean.
  const labelContent = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
      {navigable ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNavigate(navTarget.id, navTarget.systemKey) }}
          style={{
            ...t.mono, color: c.stroke, background: 'none', border: 'none',
            padding: 0, cursor: 'pointer',
            textDecoration: 'underline', textDecorationColor: c.fill, textUnderlineOffset: 2,
          }}
          aria-label={`${tr('nav.navigate')} ${label}`}
        >{label}</button>
      ) : (
        <span style={{ ...t.mono, color: c.stroke }}>{label}</span>
      )}
      <span aria-hidden="true" style={{ ...t.mono, color: color.muted }}>{arrow}</span>
    </div>
  )

  return (
    <div
      role="group"
      aria-label={`${label} ${terminal.dir === 'both' ? 'in/out' : terminal.dir}`}
      style={{
        display: 'flex',
        flexDirection: isHorizontal ? 'row' : 'column',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {!wallSide && labelContent}

      {/* Terminal selection button — dot + SVG cable */}
      <button
        type="button"
        className="cable-terminal-button"
        onClick={() => onClick?.(terminal.id)}
        aria-label={`${tr('systemPage.selectTerminal')} ${label}${active ? ` (${tr('systemPage.selected')})` : ''}`}
        title={connections && connections.length > 1 ? connections.map(c => `${c.verb} ${c.name}`).join('\n') : undefined}
        style={{
          position: 'relative',
          width: TERMINAL_SIZE, height: TERMINAL_SIZE,
          flexShrink: 0,
          background: 'none', border: 'none',
          cursor: onClick ? 'pointer' : 'default',
          padding: 0,
          borderRadius: '50%',
        }}
      >
        {/* Cable SVG — positioned at dot center, overflows in all directions.
            Two stacked paths: a wider dark stroke acts as outline, the
            colored stroke fills it. Combined with the dot's outer ring,
            the terminal reads as one continuous shape with one outline,
            not two separate pieces. */}
        <svg style={{
          position: 'absolute',
          left: 0, top: 0,
          width: TERMINAL_SIZE, height: TERMINAL_SIZE,
          overflow: 'visible',
          pointerEvents: 'none',
          zIndex: 0,
        }} aria-hidden="true">
          <path
            d={cablePath(terminal.wall, BEND, VISIBLE)}
            fill="none"
            stroke={c.stroke}
            strokeWidth={CABLE_THICKNESS + 4}
            strokeLinecap="butt"
            strokeLinejoin="round"
            transform={`translate(${TERMINAL_SIZE / 2}, ${TERMINAL_SIZE / 2})`}
          />
          <path
            d={cablePath(terminal.wall, BEND, VISIBLE)}
            fill="none"
            stroke={cableColor}
            strokeWidth={CABLE_THICKNESS}
            strokeLinecap="butt"
            strokeLinejoin="round"
            transform={`translate(${TERMINAL_SIZE / 2}, ${TERMINAL_SIZE / 2})`}
          />
        </svg>

        {/* Dot — fill is the channel color; an outset 2px ring in c.stroke
            wraps the dot AND aligns with the cable's dark outline. The
            terminal reads as one shape with one continuous border. For
            audit yellow this carries WCAG 1.4.11 (≥3:1) for the whole
            component identifier. For high-contrast fills the border is
            still part of the design — same outline language. */}
        <div aria-hidden="true" style={{
          position: 'relative',
          width: TERMINAL_SIZE,
          height: TERMINAL_SIZE,
          borderRadius: '50%',
          background: cableColor,
          boxShadow: `0 0 0 2px ${c.stroke}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1,
        }}>
          <div style={{
            width: HOLLOW_SIZE,
            height: HOLLOW_SIZE,
            borderRadius: '50%',
            background: active ? cableColor : color.white,
            transition: 'background 0.15s',
          }} />
        </div>
      </button>

      {wallSide && labelContent}
    </div>
  )
}
