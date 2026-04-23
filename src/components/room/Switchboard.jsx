import { useState, useMemo, useRef } from 'react'
import { Lightbulb, Plus, ChevronRight, Trash2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react'
import { color } from '../../styles'
import { useA11yType } from '../../hooks/useA11yType'
import { useTranslation } from '../../i18n/index.jsx'
import { getProcessorDef, SIGNAL_TYPES } from '../../signals/library'
import { defaultFilters } from '../../signals/filter'
import { Checkbox } from '../Checkbox'
import { ProcessorLibraryModal } from './ProcessorLibraryModal'

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

function TerminalDot({ terminal, active, onToggle, interactive = true, size = 14, showArrow = false }) {
  const fill = color[terminal.colorKey]?.fill || color.border
  const ArrowIcon = showArrow ? WALL_ARROWS[terminal.wall] : null
  const arrowColor = active ? color.white : fill
  const common = {
    width: size, height: size, borderRadius: '50%',
    border: `2px solid ${fill}`,
    background: active ? fill : 'transparent',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    verticalAlign: 'middle',
    flexShrink: 0,
  }
  const arrow = ArrowIcon ? <ArrowIcon size={size - 6} strokeWidth={2.5} color={arrowColor} aria-hidden="true" /> : null
  if (!interactive) {
    return <span aria-hidden="true" title={terminal.terminalId} style={common}>{arrow}</span>
  }
  return (
    <button
      type="button"
      aria-label={`${terminal.terminalId}${active ? ' (on)' : ' (off)'}`}
      aria-pressed={active}
      title={terminal.terminalId}
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      style={{ ...common, padding: 0, cursor: 'pointer' }}
    >{arrow}</button>
  )
}

function TerminalDotRow({ terminals, selected, onChange, disabled }) {
  const t = useA11yType()
  // Which colorKeys appear more than once in this row? Those dots get arrows.
  const ambiguousColors = useMemo(() => {
    const counts = new Map()
    for (const term of terminals) {
      counts.set(term.colorKey, (counts.get(term.colorKey) || 0) + 1)
    }
    return new Set(Array.from(counts.entries()).filter(([, n]) => n > 1).map(([k]) => k))
  }, [terminals])

  if (disabled || terminals.length === 0) {
    return <span style={t.monoMuted}>—</span>
  }
  const isActive = (tid) => (selected === null ? true : selected.includes(tid))
  const toggle = (tid) => {
    const allIds = terminals.map(x => x.terminalId)
    const current = selected === null ? [...allIds] : selected
    const next = current.includes(tid) ? current.filter(x => x !== tid) : [...current, tid]
    onChange(next.length === terminals.length ? null : next)
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {terminals.map(term => (
        <TerminalDot
          key={term.terminalId}
          terminal={term}
          active={isActive(term.terminalId)}
          onToggle={() => toggle(term.terminalId)}
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

export function Switchboard({
  systemKey, sysColor, terminals,
  processors,
  onAddProcessor, onRemoveProcessor, onUpdateProcessor, onOpenProcessor,
}) {
  const t = useA11yType()
  const { t: tr } = useTranslation()
  const [libraryOpen, setLibraryOpen] = useState(false)
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
      </div>

      {enriched.length === 0 && (
        <div style={{
          border: `1px dashed ${color.border}`,
          padding: '40px 24px', marginBottom: 20, textAlign: 'center',
        }}>
          <p style={{ ...t.mono, color: color.muted, margin: 0 }}>{tr('systemPage.noProcessors')}</p>
        </div>
      )}

      {enriched.length > 0 && (
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
                // Only respond when focus is on the row itself, not an interactive cell child
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
                  // Shift focus to the next row (or previous if at end)
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
                  aria-label={`${displayName} processor row. Enter to open, arrow keys to move, Delete to remove.`}
                  ref={(el) => { if (el) rowRefs.current[inst.id] = el; else delete rowRefs.current[inst.id] }}
                  onKeyDown={handleRowKeyDown}
                  style={{ cursor: 'pointer' }}
                >
                  <td role="gridcell" aria-colindex={1} style={cellStyle}>
                    <TerminalDotRow
                      terminals={roomTerminals}
                      selected={filters.inputTerminals}
                      onChange={(next) => updateFilter(inst, { inputTerminals: next })}
                      disabled={!def.hasInputs}
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
                    <TerminalDotRow
                      terminals={roomTerminals}
                      selected={filters.outputTerminals}
                      onChange={(next) => updateFilter(inst, { outputTerminals: next })}
                      disabled={!def.hasOutputs}
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
            {/* Empty padding rows — visual-only so the table height is stable.
                aria-hidden so screen readers don't announce N blank rows. */}
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
