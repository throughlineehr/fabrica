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
import { X, Search } from 'lucide-react'
import { color, type, panel as panelStyle } from '../../styles'
import { useA11yType } from '../../hooks/useA11yType'
import { PROCESSOR_LIBRARY, PROCESSOR_CATEGORIES, canPlaceProcessor } from '../../signals/library'
import { Z_INDEX } from '../../constants'

const DRAWER_WIDTH = 400

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

export function LibraryDrawer({ open, systemKey, onAdd, onClose }) {
  const t = useA11yType()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [compatibleOnly, setCompatibleOnly] = useState(true)
  const [focusedId, setFocusedId] = useState(null)
  const drawerRef = useRef(null)
  const searchRef = useRef(null)

  // Filter the library by the active category, the compatibility toggle,
  // and the search string. Search matches name + description, case-insensitive.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return PROCESSOR_LIBRARY.filter(def => {
      if (compatibleOnly && !canPlaceProcessor(def, systemKey)) return false
      if (activeCategory !== 'all' && def.category !== activeCategory) return false
      if (q) {
        const hay = `${def.name} ${def.description}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [search, activeCategory, compatibleOnly, systemKey])

  // Categories that have at least one processor matching the current
  // compatibility filter — so we don't render empty chips.
  const visibleCategories = useMemo(() => {
    const present = new Set(
      PROCESSOR_LIBRARY
        .filter(def => !compatibleOnly || canPlaceProcessor(def, systemKey))
        .map(def => def.category)
    )
    return PROCESSOR_CATEGORIES.filter(c => present.has(c.id))
  }, [compatibleOnly, systemKey])

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
          <h2 style={{ ...type.h3, margin: 0 }}>Library</h2>
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
      </aside>
    </>
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
