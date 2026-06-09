// Panel — renders one processor's panel from its declarative manifest.
//
// Spec: PROCESSOR-PANEL-SPEC.md.
//
// Three zones (title, body, foot). The body is a CSS grid laid out as
// `widthHP × BODY_ROWS` cells (24px each). Plugin-author fixtures sit
// at integer (x, y) cell positions, sized in cell units.
//
// Bindings (config.X / state.X / port:'X' / action:'X') are resolved
// against the live processor instance — config edits flow back via
// `onConfigChange`, port jacks expose data attributes the cable layer
// finds via querySelector.

import { useA11yType } from '../../hooks/useA11yType'
import { color } from '../../styles'
import {
  HP, BODY_ROWS, PANEL_HEIGHT, PANEL_TITLE_STRIP, PANEL_FOOT_STRIP, PANEL_BROADCAST_STRIP,
  fixtureSize, validatePanel,
} from './panelSchema'
import {
  Knob, Jack, Toggle, Slider, Button, LED, Display, Label, Divider, Dropdown, TextInput,
} from './fixtures'

const BG_TOKEN = {
  light: color.white,
  mid:   color.surface,
  dark:  color.primary,
}
const BODY_TEXT = {
  light: color.primary,
  mid:   color.primary,
  dark:  color.white,
}

function getAccent(key) {
  if (!key) return color.s3
  return color[key]?.fill ? color[key] : color.s3
}

// --- Fixture dispatch -----------------------------------------------------

function FixtureNode({ f, instance, state, onConfigChange, onAction, processorInstanceId, panelAccent, jackDisabled }) {
  const colorKey = f.color || panelAccent

  // Resolve binding to a value (read-only)
  let value
  let readOnly = false
  if (typeof f.bind === 'string') {
    const m = f.bind.match(/^(config|state)\.(.+)$/)
    if (m) {
      if (m[1] === 'config') value = instance?.config?.[m[2]]
      else { value = state?.[m[2]]; readOnly = true }
    }
  }

  const writeConfig = (key) => (next) => {
    onConfigChange?.({ [key]: next })
  }
  const configKey = f.bind?.startsWith('config.') ? f.bind.slice('config.'.length) : null
  const onChange = configKey ? writeConfig(configKey) : undefined

  switch (f.type) {
    case 'knob':
      return <Knob id={f.id} label={f.label} value={value ?? f.default ?? 0}
        range={f.range} step={f.step} unit={f.unit}
        color={colorKey} readOnly={readOnly} onChange={onChange} />
    case 'jack':
      return <Jack id={f.id} label={f.label} kind={f.kind} port={f.port}
        color={colorKey} processorInstanceId={processorInstanceId}
        disabled={jackDisabled && f.kind === 'output'} />
    case 'toggle':
      return <Toggle id={f.id} label={f.label} value={value ?? f.default ?? false}
        options={f.options} readOnly={readOnly} onChange={onChange} />
    case 'slider':
      return <Slider id={f.id} label={f.label} value={value ?? f.default ?? 0}
        range={f.range} step={f.step} orient={f.orient}
        readOnly={readOnly} onChange={onChange} />
    case 'button':
      return <Button id={f.id} label={f.label} onAction={() => onAction?.(f.action)} />
    case 'led':
      return <LED id={f.id} label={f.label} on={Boolean(value)} color={colorKey} />
    case 'display':
      return <Display id={f.id} label={f.label} value={value} format={f.format} />
    case 'label':
      return <Label text={f.text} size={f.size} color={colorKey} />
    case 'divider':
      return <Divider orient={f.orient} />
    case 'dropdown':
      return <Dropdown id={f.id} label={f.label} value={value ?? f.default}
        options={f.options} readOnly={readOnly} onChange={onChange} />
    case 'textInput':
      return <TextInput id={f.id} label={f.label} value={value ?? f.default ?? ''}
        type={f.inputType} placeholder={f.placeholder}
        readOnly={readOnly} onChange={onChange} />
    default:
      return null
  }
}

// --- Panel ----------------------------------------------------------------

export function Panel({
  manifest,
  processorDef,
  instance,
  state,
  onConfigChange,
  onBroadcastChange,
  onAction,
  onOpen,
  systemColor = 's3',
}) {
  const t = useA11yType()
  const accent = getAccent(manifest.accent)
  const systemAccent = getAccent(systemColor)

  // Validate at render — invalid panels render an error chip.
  const validation = validatePanel(manifest, processorDef)
  if (!validation.ok) {
    return (
      <InvalidPanel manifest={manifest} processorDef={processorDef} issues={validation.issues} />
    )
  }

  const widthHP = manifest.widthHP
  const widthPx = widthHP * HP
  const bg = BG_TOKEN[manifest.bg] || color.surface
  const fg = BODY_TEXT[manifest.bg] || color.primary

  const broadcast = Boolean(instance?.broadcast)
  const setBroadcast = (next) => onBroadcastChange?.(next)

  return (
    <div
      role="group"
      aria-label={`${processorDef.name} panel`}
      style={{
        flex: '0 0 auto',
        width: widthPx,
        height: PANEL_HEIGHT,
        background: bg,
        color: fg,
        display: 'flex', flexDirection: 'column',
        border: `1px solid ${color.border}`,
      }}
    >
      {/* Title strip — double-click opens the processor's detail page.
          Limited to the title (not the whole panel) so it doesn't fight
          knob drags / jack-patch interactions in the body. */}
      <div
        onDoubleClick={onOpen ? (e) => { e.stopPropagation(); onOpen() } : undefined}
        title={onOpen ? 'Double-click to open processor' : undefined}
        style={{
          height: PANEL_TITLE_STRIP,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
          background: color.surfaceMuted,
          color: color.primary,
          borderBottom: `1px solid ${color.border}`,
          cursor: onOpen ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        <span aria-hidden="true" style={{
          position: 'absolute', left: 6, top: '50%',
          width: 8, height: 8, marginTop: -4, borderRadius: '50%',
          background: systemAccent.fill, border: `1px solid ${systemAccent.stroke}`,
        }} />
        <span style={{ ...t.mono, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
          {processorDef.name}
        </span>
        <span aria-hidden="true" style={{
          position: 'absolute', right: 6, top: '50%',
          width: 8, height: 8, marginTop: -4,
          background: accent.fill, border: `1px solid ${accent.stroke}`,
        }} />
      </div>

      {/* Broadcast strip — sits above the body so it reads as a header for
          the output region. Empty for processors without outputs (kept for
          consistent panel heights across the rack). */}
      <div style={{
        height: PANEL_BROADCAST_STRIP,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: color.surfaceMuted,
        borderBottom: `1px solid ${color.border}`,
        padding: '0 8px',
      }}>
        {processorDef.hasOutputs ? (
          <button
            type="button"
            role="switch"
            aria-checked={broadcast}
            aria-label="Broadcast outputs to all room terminals"
            onClick={() => setBroadcast(!broadcast)}
            style={{
              ...t.mono, fontSize: 10,
              padding: '2px 10px',
              background: broadcast ? color.primary : color.white,
              color: broadcast ? color.white : color.primary,
              border: `1.5px solid ${color.primary}`,
              cursor: 'pointer',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <span aria-hidden="true" style={{
              width: 8, height: 8, borderRadius: '50%',
              background: broadcast ? color.white : 'transparent',
              border: `1.5px solid ${broadcast ? color.white : color.primary}`,
            }} />
            broadcast
          </button>
        ) : (
          <span style={{ ...t.mono, fontSize: 9, color: color.muted, opacity: 0.5 }}>—</span>
        )}
      </div>

      {/* Body grid */}
      <div style={{
        flex: 1, position: 'relative',
        display: 'grid',
        gridTemplateColumns: `repeat(${widthHP}, ${HP}px)`,
        gridTemplateRows: `repeat(${BODY_ROWS}, ${HP}px)`,
        padding: 0,
      }}>
        {(manifest.fixtures || []).map((f, i) => {
          const { w, h } = fixtureSize(f)
          const key = f.id || `${f.type}-${i}`
          return (
            <div key={key} style={{
              gridColumn: `${f.x + 1} / span ${w}`,
              gridRow: `${f.y + 1} / span ${h}`,
              minWidth: 0, minHeight: 0,
            }}>
              <FixtureNode
                f={f}
                instance={instance}
                state={state}
                onConfigChange={onConfigChange}
                onAction={onAction}
                processorInstanceId={instance?.id}
                panelAccent={manifest.accent}
                jackDisabled={broadcast}
              />
            </div>
          )
        })}
      </div>

      {/* Foot strip */}
      <div style={{
        height: PANEL_FOOT_STRIP,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: color.surfaceMuted,
        color: color.muted,
        borderTop: `1px solid ${color.border}`,
        position: 'relative',
      }}>
        <span style={{ ...t.mono, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {processorDef.author?.name || 'Fabrica core'}
          {processorDef.version ? ` · ${processorDef.version}` : ''}
        </span>
        <span aria-hidden="true" style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          height: 2, background: accent.fill,
        }} />
      </div>
    </div>
  )
}

// --- Invalid panel placeholder --------------------------------------------

function InvalidPanel({ manifest, processorDef, issues }) {
  const t = useA11yType()
  const widthPx = (Number.isInteger(manifest?.widthHP) ? manifest.widthHP : 6) * HP
  return (
    <div
      role="alert"
      aria-label={`${processorDef.name || 'Panel'} failed to validate`}
      style={{
        flex: '0 0 auto',
        width: widthPx,
        height: PANEL_HEIGHT,
        background: color.white,
        border: `2px solid ${color.s2.fill}`,
        display: 'flex', flexDirection: 'column',
        padding: 8,
      }}
    >
      <div style={{ ...t.mono, fontSize: 10, color: color.s2.stroke, fontWeight: 700, marginBottom: 6 }}>
        INVALID PANEL
      </div>
      <div style={{ ...t.mono, fontSize: 10, color: color.primary, marginBottom: 6 }}>
        {processorDef.name}
      </div>
      <ul style={{ ...t.mono, fontSize: 9, color: color.muted, margin: 0, paddingLeft: 14, overflow: 'auto' }}>
        {issues.slice(0, 6).map((iss, i) => (
          <li key={i}>{iss.message}</li>
        ))}
        {issues.length > 6 && <li>+{issues.length - 6} more…</li>}
      </ul>
    </div>
  )
}
