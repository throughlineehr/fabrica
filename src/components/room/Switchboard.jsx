import { useState, useMemo, useRef } from 'react'
import { Lightbulb, Plus, ChevronRight, Trash2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react'
import { color, ui } from '../../styles'
import { useA11yType } from '../../hooks/useA11yType'
import { useTranslation } from '../../i18n/index.jsx'
import { getProcessorDef, SIGNAL_TYPES } from '../../signals/library'
import { defaultFilters } from '../../signals/filter'
import { Checkbox } from '../Checkbox'
import { ProcessorLibraryModal } from './ProcessorLibraryModal'
import { nextFreeOutputPort, nextFreeInputPort } from '../rack/portAllocation'

// The switchboard shows one row per processor. Each row has a dot for every
// cable on the room's walls — same dots in both Incoming and Outgoing columns
// because every cable is bidirectional. Clicking a dot toggles whether this
// processor reads (incoming) or writes (outgoing) via that cable.

// Direction arrow icons by wall. Shown inside the dot ONLY when ambiguous
// (multiple dots in a row share the same colorKey). Picks the icon from the
// terminal's wall so a top-wall cable shows ↑, bottom shows ↓, etc.
const WALL_ARROWS = {
  top: ArrowUp,
  bottom: ArrowDown,
  left: ArrowLeft,
  right: ArrowRight,
}

// Wall → direction name for screen-reader aria-labels (when color ambiguity
// forces us to render a wall-direction arrow, we also name the direction in text).
const WALL_NAMES = { top: 'top', bottom: 'bottom', left: 'left', right: 'right' }

function TerminalDot({ terminal, active, onToggle, interactive = true, size = ui.checkbox.size, showArrow = false }) {
  const fill = color[terminal.colorKey]?.fill || color.border
  const ArrowIcon = showArrow ? WALL_ARROWS[terminal.wall] : null
  const arrowColor = active ? color.white : fill
  const common = {
    width: size, height: size, borderRadius: '50%',
    border: `${ui.checkbox.borderWidth}px solid ${fill}`,
    background: active ? fill : 'transparent',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    verticalAlign: 'middle',
    flexShrink: 0,
  }
  const arrow = ArrowIcon ? <ArrowIcon size={Math.max(10, size - 8)} strokeWidth={2.5} color={arrowColor} aria-hidden="true" /> : null
  // When the direction arrow is rendered (ambiguous color), the aria-label
  // also names the wall so screen-reader users get the disambiguation.
  const wallSuffix = showArrow && WALL_NAMES[terminal.wall]
    ? ` — ${WALL_NAMES[terminal.wall]} wall`
    : ''
  const srLabel = `${terminal.terminalId}${active ? ' (on)' : ' (off)'}${wallSuffix}`
  if (!interactive) {
    return <span aria-hidden="true" title={terminal.terminalId} style={common}>{arrow}</span>
  }
  return (
    <button
      type="button"
      aria-label={srLabel}
      aria-pressed={active}
      title={terminal.terminalId}
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      style={{ ...common, padding: 0, cursor: 'pointer' }}
    >{arrow}</button>
  )
}

// CableTerminalDotRow — dots are derived from the cables array, NOT from
// filter state. A dot is "on" iff at least one cable connects this processor
// to that terminal in the given direction. Click toggles real cable creation
// or removal, so the rack and the switchboard stay perma-synced.
function CableTerminalDotRow({
  terminals, processorId, processorDef, direction,
  cables, onAddCable, onRemoveCable,
}) {
  const t = useA11yType()
  const isOut = direction === 'out'

  // Which colorKeys appear more than once in this row? Those dots get arrows.
  const ambiguousColors = useMemo(() => {
    const counts = new Map()
    for (const term of terminals) {
      counts.set(term.colorKey, (counts.get(term.colorKey) || 0) + 1)
    }
    return new Set(Array.from(counts.entries()).filter(([, n]) => n > 1).map(([k]) => k))
  }, [terminals])

  // Group cables by terminalId for the (processorId, direction) pair.
  const cablesByTerminal = useMemo(() => {
    const map = new Map()
    for (const c of cables) {
      if (isOut) {
        if (c?.source?.kind === 'jack' && c.source.instanceId === processorId
            && c?.target?.kind === 'terminal') {
          if (!map.has(c.target.terminalId)) map.set(c.target.terminalId, [])
          map.get(c.target.terminalId).push(c)
        }
      } else {
        if (c?.target?.kind === 'jack' && c.target.instanceId === processorId
            && c?.source?.kind === 'terminal') {
          if (!map.has(c.source.terminalId)) map.set(c.source.terminalId, [])
          map.get(c.source.terminalId).push(c)
        }
      }
    }
    return map
  }, [cables, processorId, isOut])

  const disabled = isOut ? !processorDef.hasOutputs : !processorDef.hasInputs
  if (disabled || terminals.length === 0) {
    return <span style={t.monoMuted}>—</span>
  }

  const isActive = (tid) => (cablesByTerminal.get(tid)?.length || 0) > 0

  const toggle = (term) => {
    const tid = term.terminalId
    if (isActive(tid)) {
      // Remove all cables for this (proc, terminal, direction).
      for (const c of cablesByTerminal.get(tid)) {
        onRemoveCable?.(c.id)
      }
      return
    }
    // Add a new cable. Pick the first free port; if all ports are taken, refuse.
    const cableColor = color[term.colorKey]?.fill || color.primary
    if (isOut) {
      const out = nextFreeOutputPort(cables, processorId, processorDef)
      if (!out.portId || out.allTaken) return
      onAddCable?.({
        source: { kind: 'jack', instanceId: processorId, portId: out.portId },
        target: { kind: 'terminal', terminalId: tid },
        color: cableColor,
      })
    } else {
      const inn = nextFreeInputPort(cables, processorId, processorDef)
      if (!inn.portId || inn.allTaken) return
      onAddCable?.({
        source: { kind: 'terminal', terminalId: tid },
        target: { kind: 'jack', instanceId: processorId, portId: inn.portId },
        color: cableColor,
      })
    }
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: ui.checkbox.gap }}>
      {terminals.map(term => (
        <TerminalDot
          key={term.terminalId}
          terminal={term}
          active={isActive(term.terminalId)}
          onToggle={() => toggle(term)}
          showArrow={ambiguousColors.has(term.colorKey)}
        />
      ))}
    </div>
  )
}

function TypeChipRow({ selected, onChange, disabled }) {
  const t = useA11yType()
  if (disabled) return <span style={t.monoMuted}>—</span>
  const isActive = (type) => (selected === null ? true : selected.includes(type))
  const toggle = (type, next) => {
    const current = selected === null ? [...SIGNAL_TYPES] : selected
    const updated = next
      ? (current.includes(type) ? current : [...current, type])
      : current.filter(x => x !== type)
    onChange(updated.length === SIGNAL_TYPES.length ? null : updated)
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {SIGNAL_TYPES.map(st => (
        <Checkbox
          key={st}
          label={st[0].toUpperCase()}
          srLabel={st}
          checked={isActive(st)}
          onChange={(next) => toggle(st, next)}
        />
      ))}
    </div>
  )
}

function TagsInput({ tags, onChange, disabled }) {
  const t = useA11yType()
  const { t: tr } = useTranslation()
  const [text, setText] = useState((tags || []).join(', '))
  const commit = () => {
    const cleaned = text.split(',').map(s => s.trim()).filter(Boolean)
    onChange(cleaned.length ? cleaned : null)
  }
  if (disabled) return <span style={t.monoMuted}>—</span>
  return (
    <input
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
      }}
      onClick={(e) => e.stopPropagation()}
      placeholder="—"
      aria-label={tr('systemPage.filterTags')}
      style={{
        ...t.mono,
        padding: '2px 6px',
        border: `1px solid ${color.border}`,
        background: 'none',
        width: 140,
      }}
    />
  )
}

const cellStyle = {
  padding: '10px 12px',
  verticalAlign: 'middle',
  borderBottom: `1px solid ${color.border}`,
  borderRight: `1px solid ${color.border}`,
}

const lastCellStyle = { ...cellStyle, borderRight: 'none' }

const PAGE_SIZE = 10

// --- Mode switch (segmented control) -------------------------------------
// Two modes for the table's input/output columns. "terminal" = the
// existing incoming/outgoing dot columns. "internal" = swap those out
// for from/to selects of internal cable connections.

function ModeSwitch({ mode, onChange, t }) {
  const opts = [
    { value: 'terminal', label: 'TERMINAL' },
    { value: 'internal', label: 'INTERNAL' },
  ]
  return (
    <div role="group" aria-label="switchboard mode" style={{
      display: 'inline-flex',
      border: `1px solid ${color.border}`,
    }}>
      {opts.map((o, i) => {
        const active = mode === o.value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            style={{
              ...t.mono, fontSize: 11,
              padding: '6px 12px',
              background: active ? color.primary : color.white,
              color: active ? color.white : color.primary,
              border: 'none',
              borderRight: i === 0 ? `1px solid ${color.border}` : 'none',
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
          >{o.label}</button>
        )
      })}
    </div>
  )
}

// --- Internal cables: port endpoint helpers -------------------------------
// In INTERNAL mode each row is one cable. The from/to columns are flat selects
// of every output / input port across all processors in the room (e.g.,
// "Heartbeat 1", "Tracer 2", "Digest themes"). Ports already used by another
// cable are still listed but disabled, so users can see the full topology.

function buildPortOptions(enriched, kind) {
  const opts = []
  for (const { inst, def } of enriched) {
    const isOut = kind === 'output'
    if (isOut && !def.hasOutputs) continue
    if (!isOut && !def.hasInputs) continue
    const ports = (isOut ? def.ports?.outputs : def.ports?.inputs) || []
    for (const p of ports) {
      opts.push({
        value: `${inst.id}:${p.id}`,
        label: `${def.name} ${p.label || p.id}`,
        instanceId: inst.id,
        portId: p.id,
      })
    }
  }
  return opts
}

function endpointKey(endpoint) {
  if (!endpoint || endpoint.kind !== 'jack') return null
  return `${endpoint.instanceId}:${endpoint.portId}`
}

// --- Internal cables table ------------------------------------------------
// Each row = one internal cable (jack→jack within the room). The from/to
// columns are flat selects of every output / input port on every processor.
// Permasync with the rack: cables are owned by App.jsx and flow through both
// views.

function PortSelect({ value, options, usedSet, ariaLabel, onChange, t }) {
  return (
    <select
      aria-label={ariaLabel}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      style={{
        ...t.mono, fontSize: 12,
        background: color.white,
        border: `1px solid ${color.border}`,
        color: color.primary,
        padding: '4px 8px', cursor: 'pointer',
        minWidth: 160,
      }}
    >
      {!value && <option value="" disabled>—</option>}
      {options.map(o => (
        <option
          key={o.value}
          value={o.value}
          // The currently-selected option must remain enabled even if usedSet
          // also contains it (i.e., this row is what's using the port).
          disabled={usedSet.has(o.value) && o.value !== value}
        >
          {o.label}
        </option>
      ))}
    </select>
  )
}

// Draft row — empty selects waiting to become a cable. When BOTH ends are
// picked, the cable commits immediately (in the onChange handler) and the
// row's local state clears so it's empty again. The just-committed cable
// shows up in a cable row above; this draft row stays as the next slot.
function DraftCableRow({
  outputOptions, inputOptions, usedFrom, usedTo, onAddCable, t, ariaRowIndex,
}) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const tryCommit = (nextFrom, nextTo) => {
    if (!nextFrom || !nextTo) {
      setFrom(nextFrom)
      setTo(nextTo)
      return
    }
    const fromOpt = outputOptions.find(o => o.value === nextFrom)
    const toOpt = inputOptions.find(o => o.value === nextTo)
    if (!fromOpt || !toOpt) {
      setFrom(nextFrom)
      setTo(nextTo)
      return
    }
    onAddCable?.({
      source: { kind: 'jack', instanceId: fromOpt.instanceId, portId: fromOpt.portId },
      target: { kind: 'jack', instanceId: toOpt.instanceId, portId: toOpt.portId },
      color: color.primary,
    })
    setFrom('')
    setTo('')
  }

  return (
    <tr role="row" aria-rowindex={ariaRowIndex}>
      <td role="gridcell" aria-colindex={1} style={cellStyle}>
        <PortSelect
          value={from}
          options={outputOptions}
          usedSet={usedFrom}
          ariaLabel="From port (empty)"
          onChange={(v) => tryCommit(v, to)}
          t={t}
        />
      </td>
      <td role="gridcell" aria-colindex={2} style={cellStyle}>
        <PortSelect
          value={to}
          options={inputOptions}
          usedSet={usedTo}
          ariaLabel="To port (empty)"
          onChange={(v) => tryCommit(from, v)}
          t={t}
        />
      </td>
      <td role="gridcell" aria-colindex={3} style={lastCellStyle}>&nbsp;</td>
    </tr>
  )
}

function InternalCablesTable({
  enriched, cables, sysColor, thStyle,
  onAddCable, onRemoveCable, t,
}) {
  const outputOptions = useMemo(() => buildPortOptions(enriched, 'output'), [enriched])
  const inputOptions  = useMemo(() => buildPortOptions(enriched, 'input'),  [enriched])

  // Cables that live entirely inside this room (jack → jack).
  const internalCables = useMemo(() => cables.filter(c =>
    c?.source?.kind === 'jack' && c?.target?.kind === 'jack'
  ), [cables])

  const usedFrom = useMemo(
    () => new Set(internalCables.map(c => endpointKey(c.source)).filter(Boolean)),
    [internalCables]
  )
  const usedTo = useMemo(
    () => new Set(internalCables.map(c => endpointKey(c.target)).filter(Boolean)),
    [internalCables]
  )

  const handleChangeFrom = (cable, newValue) => {
    const opt = outputOptions.find(o => o.value === newValue)
    if (!opt) return
    onRemoveCable?.(cable.id)
    onAddCable?.({
      source: { kind: 'jack', instanceId: opt.instanceId, portId: opt.portId },
      target: cable.target,
      color: cable.color || color.primary,
    })
  }

  const handleChangeTo = (cable, newValue) => {
    const opt = inputOptions.find(o => o.value === newValue)
    if (!opt) return
    onRemoveCable?.(cable.id)
    onAddCable?.({
      source: cable.source,
      target: { kind: 'jack', instanceId: opt.instanceId, portId: opt.portId },
      color: cable.color || color.primary,
    })
  }

  // Always render at least PAGE_SIZE rows; cables fill the top, drafts fill
  // the rest. There's always at least one draft slot below the cables.
  const totalRows = Math.max(PAGE_SIZE, internalCables.length + 1)
  const draftCount = totalRows - internalCables.length

  return (
    <table
      role="grid"
      aria-label="Internal cables"
      aria-rowcount={totalRows + 1}
      aria-colcount={3}
      style={{
        width: '100%', borderCollapse: 'collapse',
        border: `1px solid ${color.border}`,
      }}
    >
      <thead>
        <tr role="row" aria-rowindex={1} style={{ background: sysColor ? `${sysColor}18` : 'transparent' }}>
          <th role="columnheader" aria-colindex={1} style={thStyle}>from</th>
          <th role="columnheader" aria-colindex={2} style={thStyle}>to</th>
          <th role="columnheader" aria-colindex={3} style={{ ...thStyle, borderRight: 'none', textAlign: 'right' }}>&nbsp;</th>
        </tr>
      </thead>
      <tbody>
        {internalCables.map((cable, idx) => {
          const fromValue = endpointKey(cable.source)
          const toValue   = endpointKey(cable.target)
          const fromLabel = outputOptions.find(o => o.value === fromValue)?.label || fromValue
          const toLabel   = inputOptions.find(o => o.value === toValue)?.label || toValue
          return (
            <tr key={cable.id} role="row" aria-rowindex={idx + 2}>
              <td role="gridcell" aria-colindex={1} style={cellStyle}>
                <PortSelect
                  value={fromValue}
                  options={outputOptions}
                  usedSet={usedFrom}
                  ariaLabel={`From port (currently ${fromLabel})`}
                  onChange={(v) => handleChangeFrom(cable, v)}
                  t={t}
                />
              </td>
              <td role="gridcell" aria-colindex={2} style={cellStyle}>
                <PortSelect
                  value={toValue}
                  options={inputOptions}
                  usedSet={usedTo}
                  ariaLabel={`To port (currently ${toLabel})`}
                  onChange={(v) => handleChangeTo(cable, v)}
                  t={t}
                />
              </td>
              <td role="gridcell" aria-colindex={3} style={{ ...lastCellStyle, textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={() => onRemoveCable?.(cable.id)}
                  aria-label={`Remove cable ${fromLabel} to ${toLabel}`}
                  style={{
                    background: 'none', border: 'none', padding: 4, cursor: 'pointer',
                    color: color.muted,
                  }}
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                </button>
              </td>
            </tr>
          )
        })}
        {Array.from({ length: draftCount }).map((_, i) => (
          <DraftCableRow
            key={`draft-${i}`}
            outputOptions={outputOptions}
            inputOptions={inputOptions}
            usedFrom={usedFrom}
            usedTo={usedTo}
            onAddCable={onAddCable}
            ariaRowIndex={internalCables.length + i + 2}
            t={t}
          />
        ))}
      </tbody>
    </table>
  )
}

export function Switchboard({
  systemKey, sysColor, terminals,
  processors,
  cables = [],
  onAddProcessor, onRemoveProcessor, onUpdateProcessor, onOpenProcessor,
  onAddCable, onRemoveCable,
}) {
  const t = useA11yType()
  const { t: tr } = useTranslation()
  const [libraryOpen, setLibraryOpen] = useState(false)
  // 'terminal' = show incoming/outgoing terminal-dot columns (default).
  // 'internal' = swap them for from/to columns of internal cable connections.
  const [mode, setMode] = useState('terminal')
  const isInternal = mode === 'internal'
  const rowRefs = useRef({}) // instanceId → <tr> element, for arrow-key focus movement

  const showAlgedonic = systemKey === 's5'

  // Every cable on the room's walls is bidirectional — same set for both
  // Incoming and Outgoing columns. Keep `wall` so the dot can render a
  // direction arrow when the row has color collisions.
  const roomTerminals = useMemo(() => (
    (terminals || []).map(term => ({
      terminalId: term.id, colorKey: term.colorKey, wall: term.wall,
    }))
  ), [terminals])

  const enriched = useMemo(() => (
    (processors || []).map(inst => {
      const def = getProcessorDef(inst.defId)
      return { inst, def, displayName: def?.name || inst.defId }
    }).filter(row => row.def)
  ), [processors])

  const handlePick = (def) => {
    onAddProcessor?.(def)
    setLibraryOpen(false)
  }

  const updateFilter = (inst, patch) => {
    const nextFilters = { ...(inst.filters || defaultFilters()), ...patch }
    onUpdateProcessor?.(inst.id, { filters: nextFilters })
  }

  const thStyle = {
    ...t.label,
    textAlign: 'left', padding: '10px 12px', fontWeight: 400,
    borderBottom: `1px solid ${color.border}`,
    borderRight: `1px solid ${color.border}`,
  }

  const emptyRows = Math.max(0, PAGE_SIZE - enriched.length)

  return (
    <div style={{ padding: '24px 32px', flex: 1, display: 'flex', flexDirection: 'column' }}>
      {showAlgedonic && (
        <a
          href="#" role="link" aria-label={tr('systemPage.algedonic')}
          onClick={(e) => e.preventDefault()}
          style={{
            position: 'fixed', left: 96, top: 140, bottom: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            textDecoration: 'none', zIndex: 1,
          }}
        >
          <span style={{ ...t.caption, color: color.muted, marginBottom: 6 }}>{tr('systemPage.algedonic')}</span>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            border: `11px solid ${color.border}`,
            background: color.white,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: -11,
          }}>
            <Lightbulb size={30} strokeWidth={1.5} color={color.primary} />
          </div>
          <div style={{ width: 23, flex: 1, background: color.border }} />
        </a>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <button
          aria-label={tr('systemPage.addProcessor')}
          onClick={() => setLibraryOpen(true)}
          style={{
            ...t.mono, color: color.primary, background: 'none',
            border: `1px solid ${color.border}`,
            padding: '6px 12px', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <Plus size={14} strokeWidth={1.5} />
          {tr('systemPage.processor')}
        </button>
        <ModeSwitch mode={mode} onChange={setMode} t={t} />
      </div>

      {enriched.length === 0 && (
        <div style={{
          border: `1px dashed ${color.border}`,
          padding: '40px 24px', marginBottom: 20, textAlign: 'center',
        }}>
          <p style={{ ...t.mono, color: color.muted, margin: 0 }}>{tr('systemPage.noProcessors')}</p>
        </div>
      )}

      {enriched.length > 0 && !isInternal && (
        <table
          role="grid"
          aria-label={tr('systemPage.switchboard')}
          aria-rowcount={enriched.length + 1}
          aria-colcount={6}
          style={{
            width: '100%', borderCollapse: 'collapse',
            border: `1px solid ${color.border}`,
          }}
        >
          <thead>
            <tr role="row" aria-rowindex={1} style={{ background: sysColor ? `${sysColor}18` : 'transparent' }}>
              <th role="columnheader" aria-colindex={1} style={thStyle}>{tr('systemPage.incoming')}</th>
              <th role="columnheader" aria-colindex={2} style={thStyle}>{tr('systemPage.processor')}</th>
              <th role="columnheader" aria-colindex={3} style={thStyle}>{tr('systemPage.outgoing')}</th>
              <th role="columnheader" aria-colindex={4} style={thStyle}>{tr('systemPage.filterTypes')}</th>
              <th role="columnheader" aria-colindex={5} style={thStyle}>{tr('systemPage.filterTags')}</th>
              <th role="columnheader" aria-colindex={6} style={{ ...thStyle, borderRight: 'none', textAlign: 'right' }}>&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {enriched.map(({ inst, def, displayName }, idx) => {
              const filters = inst.filters || defaultFilters()
              const handleRowKeyDown = (e) => {
                if (e.target !== e.currentTarget) return
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpenProcessor?.(inst.id)
                } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  const nextIdx = e.key === 'ArrowDown'
                    ? Math.min(enriched.length - 1, idx + 1)
                    : Math.max(0, idx - 1)
                  const nextId = enriched[nextIdx]?.inst.id
                  if (nextId && nextId !== inst.id) rowRefs.current[nextId]?.focus()
                } else if (e.key === 'Home') {
                  e.preventDefault()
                  rowRefs.current[enriched[0]?.inst.id]?.focus()
                } else if (e.key === 'End') {
                  e.preventDefault()
                  rowRefs.current[enriched[enriched.length - 1]?.inst.id]?.focus()
                } else if (e.key === 'Delete' || e.key === 'Backspace') {
                  e.preventDefault()
                  onRemoveProcessor?.(inst.id)
                  const nextIdx = idx < enriched.length - 1 ? idx + 1 : idx - 1
                  const nextId = enriched[nextIdx]?.inst.id
                  if (nextId) requestAnimationFrame(() => rowRefs.current[nextId]?.focus())
                }
              }
              return (
                <tr
                  key={inst.id}
                  role="row"
                  tabIndex={0}
                  aria-rowindex={idx + 2}
                  onFocus={(e) => {
                    if (e.target === e.currentTarget) {
                      e.currentTarget.scrollIntoView({ block: 'nearest' })
                    }
                  }}
                  aria-label={`${displayName} processor row. Enter to open, arrow keys to move, Delete to remove.`}
                  ref={(el) => { if (el) rowRefs.current[inst.id] = el; else delete rowRefs.current[inst.id] }}
                  onKeyDown={handleRowKeyDown}
                  style={{ cursor: 'pointer' }}
                >
                  <td role="gridcell" aria-colindex={1} style={cellStyle}>
                    <CableTerminalDotRow
                      terminals={roomTerminals}
                      processorId={inst.id}
                      processorDef={def}
                      direction="in"
                      cables={cables}
                      onAddCable={onAddCable}
                      onRemoveCable={onRemoveCable}
                    />
                  </td>
                  <td role="gridcell" aria-colindex={2} style={cellStyle}>
                    <button
                      onClick={(e) => { e.stopPropagation(); onOpenProcessor?.(inst.id) }}
                      aria-label={`${tr('systemPage.openProcessor')} ${displayName}`}
                      style={{
                        ...t.mono, color: color.primary,
                        background: 'none', border: 'none',
                        padding: 0, cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      {displayName}
                      <ChevronRight size={12} strokeWidth={1.5} color={color.muted} aria-hidden="true" />
                    </button>
                  </td>
                  <td role="gridcell" aria-colindex={3} style={cellStyle}>
                    <CableTerminalDotRow
                      terminals={roomTerminals}
                      processorId={inst.id}
                      processorDef={def}
                      direction="out"
                      cables={cables}
                      onAddCable={onAddCable}
                      onRemoveCable={onRemoveCable}
                    />
                  </td>
                  <td role="gridcell" aria-colindex={4} style={cellStyle}>
                    <TypeChipRow
                      selected={filters.types}
                      onChange={(next) => updateFilter(inst, { types: next })}
                      disabled={!def.hasInputs}
                    />
                  </td>
                  <td role="gridcell" aria-colindex={5} style={cellStyle}>
                    <TagsInput
                      tags={filters.tags}
                      onChange={(next) => updateFilter(inst, { tags: next })}
                      disabled={!def.hasInputs}
                    />
                  </td>
                  <td role="gridcell" aria-colindex={6} style={{ ...lastCellStyle, textAlign: 'right' }}>
                    {onRemoveProcessor && (
                      <button
                        aria-label={`${tr('systemPage.removeProcessor')} ${displayName}`}
                        onClick={(e) => { e.stopPropagation(); onRemoveProcessor(inst.id) }}
                        style={{
                          background: 'none', border: 'none', padding: 4, cursor: 'pointer',
                          color: color.muted,
                        }}
                      >
                        <Trash2 size={14} strokeWidth={1.5} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {Array.from({ length: emptyRows }).map((_, i) => (
              <tr key={`empty-${i}`} aria-hidden="true" role="presentation">
                <td style={cellStyle}>&nbsp;</td>
                <td style={cellStyle}>&nbsp;</td>
                <td style={cellStyle}>&nbsp;</td>
                <td style={cellStyle}>&nbsp;</td>
                <td style={cellStyle}>&nbsp;</td>
                <td style={lastCellStyle}>&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {enriched.length > 0 && isInternal && (
        <InternalCablesTable
          enriched={enriched}
          cables={cables}
          sysColor={sysColor}
          thStyle={thStyle}
          onAddCable={onAddCable}
          onRemoveCable={onRemoveCable}
          t={t}
        />
      )}

      {libraryOpen && (
        <ProcessorLibraryModal
          systemKey={systemKey}
          onPick={handlePick}
          onClose={() => setLibraryOpen(false)}
        />
      )}
    </div>
  )
}
