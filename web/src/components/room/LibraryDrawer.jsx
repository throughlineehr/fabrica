// LibraryDrawer — right-edge overlay panel for picking a processor.
//
// Replaces the old modal. Slides in over the right portion of the room
// (occluding terminals temporarily; they reappear when closed). Fully
// collapses when not open — no edge tab, no docked footprint.
//
// Trigger lives in SystemPage under the Back button (so it doesn't fight
// the wall terminals for top-edge space).
//
// Keyboard contract:
//   - Tab cycles focus inside the drawer; Shift+Tab reverses
//   - Search input is the first stop; arrow keys move between cards
//   - Enter on a focused card → onAdd(def). The room's add-handler
//     decides what "add" means (Switchboard appends, Rack appends to
//     the rightmost slot)
//   - Escape closes the drawer
//
// Drag-to-rack (mouse) and Shift+Enter "drop cursor" mode (keyboard)
// are tracked in DEBT.md and will land in a follow-up.

import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Search, Save } from 'lucide-react'
import { color, type, panel as panelStyle } from '../../styles'
import { useA11yType } from '../../hooks/useA11yType'
import { getEffectiveLibrary, PROCESSOR_CATEGORIES, canPlaceProcessor, subscribeLibrary } from '../../signals/library'
import { Z_INDEX } from '../../constants'

const DRAWER_WIDTH = 400

// Categories the save-form lets users pick from. Derived from the chip
// row but excludes anything the user shouldn't pick by default
// (transducer / effector are ports-of-reality, governance is its own thing).
const SAVE_CATEGORY_OPTIONS = ['flow', 'analysis', 'connector']

function categoryLabel(catId) {
  return PROCESSOR_CATEGORIES.find(c => c.id === catId)?.label || catId
}

function portSummary(def) {
  const ins = def.ports?.inputs?.length || 0
  const outs = def.ports?.outputs || []
  // Named outputs (digest 'themes'/'alerts') rather than counts when
  // they're descriptive — gives the user more information at a glance.
  const namedOuts = outs.filter(p => isNaN(Number(p.label)) && p.label && p.label !== 'out')
  const outLabel = namedOuts.length > 0
    ? namedOuts.map(p => p.label).join(', ')
    : `${outs.length} out`
  return `${ins} in / ${outLabel}`
}

function ProcessorCard({ def, focused, onAdd, onFocus, t }) {
  return (
    <button
      type="button"
      onClick={() => onAdd(def)}
      onFocus={onFocus}
      tabIndex={focused ? 0 : -1}
      data-library-card-id={def.id}
      style={{
        width: '100%',
        textAlign: 'left',
        background: focused ? color.hoverBg : 'transparent',
        border: 'none',
        borderBottom: `1px solid ${color.borderLight}`,
        padding: '12px 16px',
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 4,
        outline: 'none',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = color.hoverBg }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = focused ? color.hoverBg : 'transparent'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ ...t.h3, color: color.primary, fontSize: 14 }}>{def.name}</span>
        {def.category && (
          <span style={{
            ...t.label,
            fontSize: 9,
            color: color.muted,
            border: `1px solid ${color.border}`,
            padding: '1px 6px',
            textTransform: 'uppercase', letterSpacing: '0.05em',
            whiteSpace: 'nowrap',
          }}>{categoryLabel(def.category)}</span>
        )}
      </div>
      <span style={{ ...t.body, fontSize: 12, color: color.secondary, lineHeight: 1.4 }}>
        {def.description}
      </span>
      <span style={{ ...t.mono, fontSize: 10, color: color.muted, marginTop: 2 }}>
        {portSummary(def)}
      </span>
    </button>
  )
}

export function LibraryDrawer({ open, systemKey, autoPorts, onAdd, onSaveAsCompound, onClose }) {
  const t = useA11yType()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [compatibleOnly, setCompatibleOnly] = useState(true)
  const [focusedId, setFocusedId] = useState(null)
  // Re-render hook for the user-saved compound list. Bumping this state on
  // each subscribeLibrary callback invalidates the useMemos below so they
  // pick up newly-registered (or removed) compounds.
  const [libraryVersion, setLibraryVersion] = useState(0)
  useEffect(() => subscribeLibrary(() => setLibraryVersion(v => v + 1)), [])
  // Mode: 'browse' = normal library view, 'save' = compound-save form.
  const [mode, setMode] = useState('browse')
  const [saveError, setSaveError] = useState(null)
  const drawerRef = useRef(null)
  const searchRef = useRef(null)

  // Filter the library by the active category, the compatibility toggle,
  // and the search string. Search matches name + description, case-insensitive.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return getEffectiveLibrary().filter(def => {
      if (compatibleOnly && !canPlaceProcessor(def, systemKey)) return false
      if (activeCategory !== 'all' && def.category !== activeCategory) return false
      if (q) {
        const hay = `${def.name} ${def.description}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  // libraryVersion is in the dep list to recompute when user compounds change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, activeCategory, compatibleOnly, systemKey, libraryVersion])

  // Categories that have at least one processor matching the current
  // compatibility filter — so we don't render empty chips.
  const visibleCategories = useMemo(() => {
    const present = new Set(
      getEffectiveLibrary()
        .filter(def => !compatibleOnly || canPlaceProcessor(def, systemKey))
        .map(def => def.category)
    )
    return PROCESSOR_CATEGORIES.filter(c => present.has(c.id))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compatibleOnly, systemKey, libraryVersion])

  // Effective focus = stored focus if it's still in the filtered list,
  // otherwise fall back to the first card. Derived during render so we
  // don't need a setState-in-effect to keep them in sync.
  const effectiveFocusedId =
    (focusedId && filtered.find(d => d.id === focusedId)?.id) ||
    filtered[0]?.id ||
    null

  // Focus the search input when the drawer opens; restore previous focus on close.
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement
    requestAnimationFrame(() => searchRef.current?.focus())
    return () => {
      if (opener && typeof opener.focus === 'function') opener.focus()
    }
  }, [open])

  // Keyboard handling: Escape closes; arrow keys move card focus when
  // focus is in the list region; Enter on a card adds it.
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopImmediatePropagation()
      onClose()
      return
    }
    // Arrow nav across cards — works whether focus is in search or in a card.
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (filtered.length === 0) return
      const idx = filtered.findIndex(d => d.id === effectiveFocusedId)
      const nextIdx = e.key === 'ArrowDown'
        ? Math.min(filtered.length - 1, idx + 1)
        : Math.max(0, idx - 1)
      e.preventDefault()
      const nextId = filtered[nextIdx].id
      setFocusedId(nextId)
      // Move actual DOM focus onto the card so Enter activates it.
      requestAnimationFrame(() => {
        const el = drawerRef.current?.querySelector(`[data-library-card-id="${nextId}"]`)
        el?.focus()
      })
    }
  }

  if (!open) return null

  return (
    <>
      {/* Click-outside catcher (transparent) */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          zIndex: Z_INDEX.menu,
          background: 'transparent',
        }}
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-label="Processor library"
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: 0, right: 0, bottom: 0,
          width: DRAWER_WIDTH,
          ...panelStyle,
          borderLeft: `1px solid ${color.border}`,
          boxShadow: '-2px 0 12px rgba(0,0,0,0.08)',
          zIndex: Z_INDEX.menu + 1,
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: `1px solid ${color.border}`,
        }}>
          <h2 style={{ ...type.h3, margin: 0 }}>{mode === 'save' ? 'Save patch' : 'Library'}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {mode === 'browse' && onSaveAsCompound && (
              <button
                type="button"
                aria-label="Save current room as a compound processor"
                onClick={() => { setSaveError(null); setMode('save') }}
                title="Save the current room's patch as a compound processor"
                style={{
                  background: 'none', border: `1px solid ${color.border}`,
                  cursor: 'pointer', color: color.primary,
                  padding: '4px 8px', display: 'inline-flex',
                  alignItems: 'center', gap: 4,
                  ...t.mono, fontSize: 10,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}
              >
                <Save size={12} strokeWidth={1.5} aria-hidden="true" />
                save patch
              </button>
            )}
            <button
              type="button"
              aria-label="Close library"
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: color.muted, padding: 4, display: 'flex',
              }}
            >
              <X size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Save form (replaces browse view while active) */}
        {mode === 'save' && (
          <SavePatchForm
            t={t}
            error={saveError}
            autoPorts={autoPorts || { inputs: [], outputs: [] }}
            onCancel={() => { setMode('browse'); setSaveError(null) }}
            onSubmit={async (form) => {
              setSaveError(null)
              try {
                const r = await Promise.resolve(onSaveAsCompound(form))
                if (r && r.ok === false) {
                  setSaveError(r.error || 'Save failed')
                  return
                }
                setMode('browse')
              } catch (err) {
                setSaveError(String(err?.message || err))
              }
            }}
          />
        )}

        {/* Browse view (search + chips + compat toggle + cards) — only
            rendered while not in save mode. */}
        {mode === 'browse' && <>

        {/* Search */}
        <div style={{
          padding: '10px 16px',
          borderBottom: `1px solid ${color.borderLight}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Search size={14} strokeWidth={1.5} color={color.muted} aria-hidden="true" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search processors…"
            aria-label="Search processors"
            style={{
              ...t.mono, fontSize: 12,
              flex: 1,
              border: 'none', background: 'transparent', outline: 'none',
              padding: 0,
              color: color.primary,
            }}
          />
        </div>

        {/* Category chips */}
        {visibleCategories.length > 1 && (
          <div role="tablist" aria-label="Category" style={{
            display: 'flex', flexWrap: 'wrap', gap: 4,
            padding: '8px 12px',
            borderBottom: `1px solid ${color.borderLight}`,
          }}>
            <CategoryChip
              label="All"
              active={activeCategory === 'all'}
              onClick={() => setActiveCategory('all')}
              t={t}
            />
            {visibleCategories.map(c => (
              <CategoryChip
                key={c.id}
                label={c.label}
                active={activeCategory === c.id}
                onClick={() => setActiveCategory(c.id)}
                t={t}
              />
            ))}
          </div>
        )}

        {/* Compatibility toggle */}
        <div style={{
          padding: '6px 16px',
          borderBottom: `1px solid ${color.borderLight}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          ...t.mono, fontSize: 11, color: color.muted,
        }}>
          <span>{compatibleOnly ? `Compatible with ${systemKey?.toUpperCase() || 'this system'}` : 'All systems'}</span>
          <button
            type="button"
            role="switch"
            aria-checked={compatibleOnly}
            onClick={() => setCompatibleOnly(v => !v)}
            style={{
              ...t.mono, fontSize: 10,
              padding: '2px 8px',
              background: compatibleOnly ? color.primary : color.white,
              color: compatibleOnly ? color.white : color.primary,
              border: `1px solid ${color.primary}`,
              cursor: 'pointer',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}
          >{compatibleOnly ? 'on' : 'off'}</button>
        </div>

        {/* Cards */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {filtered.length === 0 ? (
            <p style={{ ...t.mono, color: color.muted, padding: 24, textAlign: 'center', fontSize: 12 }}>
              No processors match.
            </p>
          ) : (
            filtered.map(def => (
              <ProcessorCard
                key={def.id}
                def={def}
                focused={effectiveFocusedId === def.id}
                onAdd={(d) => { onAdd(d); /* keep drawer open for repeat adds */ }}
                onFocus={() => setFocusedId(def.id)}
                t={t}
              />
            ))
          )}
        </div>

        </>}
      </aside>
    </>
  )
}

// Inline form for "save current room as a compound." Auto-port-derivation
// (computed by SystemPage and passed via `autoPorts`) seeds the boundary
// checkbox lists; users can uncheck ports they don't want exposed.
function SavePatchForm({ t, error, autoPorts, onCancel, onSubmit }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('analysis')
  const [busy, setBusy] = useState(false)
  // Initially all candidate ports are selected; user can uncheck.
  const [selectedInputs, setSelectedInputs] = useState(
    () => new Set((autoPorts.inputs || []).map(p => p.outerId))
  )
  const [selectedOutputs, setSelectedOutputs] = useState(
    () => new Set((autoPorts.outputs || []).map(p => p.outerId))
  )
  const nameRef = useRef(null)
  useEffect(() => { requestAnimationFrame(() => nameRef.current?.focus()) }, [])

  const togglePort = (set, setter, outerId) => {
    const next = new Set(set)
    if (next.has(outerId)) next.delete(outerId)
    else next.add(outerId)
    setter(next)
  }

  const submit = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    // Filter the auto-derived list down to the user-selected subset.
    const expose = {
      inputs:  (autoPorts.inputs  || []).filter(p => selectedInputs.has(p.outerId)),
      outputs: (autoPorts.outputs || []).filter(p => selectedOutputs.has(p.outerId)),
    }
    await onSubmit({
      name: name.trim(),
      description: description.trim(),
      category,
      expose,
    })
    setBusy(false)
  }

  const PortRow = ({ port, checked, onToggle }) => (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
      cursor: 'pointer',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(port.outerId)}
        style={{ margin: 0, cursor: 'pointer' }}
      />
      <span style={{ ...t.mono, fontSize: 11, color: color.primary, flex: 1 }}>
        {port.processorName} <span style={{ color: color.muted }}>·</span> {port.portLabel}
      </span>
      <span style={{ ...t.mono, fontSize: 9, color: color.muted, fontStyle: 'italic' }}>
        → {port.outerId}
      </span>
    </label>
  )

  return (
    <div style={{
      padding: '12px 16px',
      borderBottom: `1px solid ${color.borderLight}`,
      display: 'flex', flexDirection: 'column', gap: 10,
      overflow: 'auto',
    }}>
      <p style={{ ...t.mono, fontSize: 11, color: color.muted, margin: 0 }}>
        Snapshots the current room (every processor + cable) into a reusable compound.
        Outer ports default to every inner jack that isn't internally cabled — uncheck the ones you don't want exposed.
      </p>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ ...t.label, fontSize: 9, color: color.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</span>
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder="e.g. Pulse Pipeline"
          style={{
            ...t.mono, fontSize: 12, padding: '6px 8px',
            border: `1px solid ${color.border}`, background: color.white,
            color: color.primary, outline: 'none',
          }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ ...t.label, fontSize: 9, color: color.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</span>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional one-liner"
          style={{
            ...t.mono, fontSize: 12, padding: '6px 8px',
            border: `1px solid ${color.border}`, background: color.white,
            color: color.primary, outline: 'none',
          }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ ...t.label, fontSize: 9, color: color.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Category</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{
            ...t.mono, fontSize: 12, padding: '6px 8px',
            border: `1px solid ${color.border}`, background: color.white,
            color: color.primary,
          }}
        >
          {SAVE_CATEGORY_OPTIONS.map(id => {
            const meta = PROCESSOR_CATEGORIES.find(c => c.id === id)
            return <option key={id} value={id}>{meta?.label || id}</option>
          })}
        </select>
      </label>

      {/* Per-port pruning */}
      {(autoPorts.inputs.length > 0 || autoPorts.outputs.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {autoPorts.inputs.length > 0 && (
            <div>
              <div style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                marginBottom: 4,
              }}>
                <span style={{ ...t.label, fontSize: 9, color: color.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Inputs ({selectedInputs.size}/{autoPorts.inputs.length})
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedInputs(prev =>
                    prev.size === autoPorts.inputs.length ? new Set() : new Set(autoPorts.inputs.map(p => p.outerId))
                  )}
                  style={{
                    ...t.mono, fontSize: 9, padding: 0,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: color.primary, textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}
                >{selectedInputs.size === autoPorts.inputs.length ? 'none' : 'all'}</button>
              </div>
              <div style={{ borderTop: `1px solid ${color.borderLight}` }}>
                {autoPorts.inputs.map(p => (
                  <PortRow
                    key={p.outerId}
                    port={p}
                    checked={selectedInputs.has(p.outerId)}
                    onToggle={(id) => togglePort(selectedInputs, setSelectedInputs, id)}
                  />
                ))}
              </div>
            </div>
          )}

          {autoPorts.outputs.length > 0 && (
            <div>
              <div style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                marginBottom: 4,
              }}>
                <span style={{ ...t.label, fontSize: 9, color: color.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Outputs ({selectedOutputs.size}/{autoPorts.outputs.length})
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedOutputs(prev =>
                    prev.size === autoPorts.outputs.length ? new Set() : new Set(autoPorts.outputs.map(p => p.outerId))
                  )}
                  style={{
                    ...t.mono, fontSize: 9, padding: 0,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: color.primary, textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}
                >{selectedOutputs.size === autoPorts.outputs.length ? 'none' : 'all'}</button>
              </div>
              <div style={{ borderTop: `1px solid ${color.borderLight}` }}>
                {autoPorts.outputs.map(p => (
                  <PortRow
                    key={p.outerId}
                    port={p}
                    checked={selectedOutputs.has(p.outerId)}
                    onToggle={(id) => togglePort(selectedOutputs, setSelectedOutputs, id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" style={{ ...t.mono, fontSize: 11, color: color.s2.stroke, margin: 0 }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          style={{
            ...t.mono, fontSize: 11, padding: '6px 12px',
            background: 'none', border: `1px solid ${color.border}`,
            color: color.muted, cursor: busy ? 'wait' : 'pointer',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}
        >cancel</button>
        <button
          type="button"
          onClick={submit}
          disabled={!name.trim() || busy}
          style={{
            ...t.mono, fontSize: 11, padding: '6px 12px',
            background: name.trim() ? color.primary : color.borderLight,
            border: `1px solid ${color.primary}`,
            color: color.white,
            cursor: !name.trim() || busy ? 'not-allowed' : 'pointer',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}
        >{busy ? 'saving…' : 'save'}</button>
      </div>
    </div>
  )
}

function CategoryChip({ label, active, onClick, t }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        ...t.mono, fontSize: 10,
        padding: '4px 10px',
        background: active ? color.primary : 'transparent',
        color: active ? color.white : color.primary,
        border: `1px solid ${active ? color.primary : color.border}`,
        cursor: 'pointer',
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}
    >{label}</button>
  )
}
