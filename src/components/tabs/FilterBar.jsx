import { useEffect, useRef } from 'react'
import { Filter, X } from 'lucide-react'
import { color, sizes, panel } from '../../styles'
import { useAccessibility } from '../../accessibility'
import { getPatternDataUrl } from '../../hooks/usePatternTexture'

const FILTER_HEIGHT = 48

export { FILTER_HEIGHT }

const FILTERS = [
  { key: 's5', label: 'S5', c: color.s5.fill },
  { key: 's4', label: 'S4', c: color.s4.fill },
  { key: 's3', label: 'S3', c: color.s3.fill },
  { key: 's2', label: 'S2', c: color.s2.fill },
  { key: 's1', label: 'S1', c: color.s1.fill },
  { key: 'frame', label: 'Frame', c: color.metaUnit },
]

export function FilterBar({ open, onClose, t, tr, visibleSystems = {}, onToggleSystem }) {
  const { colorBlind } = useAccessibility()
  const barRef = useRef()

  // Focus first checkbox on open
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        barRef.current?.querySelector('input[type="checkbox"]')?.focus()
      })
    }
  }, [open])

  if (!open) return null

  const handleKeyDown = (e) => {
    const checkboxes = Array.from(barRef.current.querySelectorAll('input[type="checkbox"]'))
    const idx = checkboxes.indexOf(document.activeElement)

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      const next = idx < checkboxes.length - 1 ? idx + 1 : 0
      checkboxes[next]?.focus()
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = idx > 0 ? idx - 1 : checkboxes.length - 1
      checkboxes[prev]?.focus()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label={tr('tabs.filter')}
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)',
        height: FILTER_HEIGHT,
        zIndex: 950,
        background: panel.background,
        backdropFilter: panel.backdropFilter,
        border: `1px solid ${color.border}`,
        borderRadius: 6,
        display: 'flex', alignItems: 'center',
        padding: '0 16px',
        gap: 16,
      }}
    >
      <Filter size={sizes.iconSize} strokeWidth={sizes.iconStroke} color={color.primary} style={{ marginRight: 4 }} />
      {FILTERS.map((sys) => {
        const checked = visibleSystems[sys.key] !== false
        return (
          <label key={sys.key} style={{
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            ...(checked ? t.monoActive : t.monoMuted),
          }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggleSystem?.(sys.key)}
              aria-label={`${sys.label} ${checked ? 'visible' : 'hidden'}`}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
            />
            <span aria-hidden="true" style={{
              width: colorBlind ? 22 : 14,
              height: colorBlind ? 22 : 14,
              border: `2px solid ${checked ? sys.c : color.border}`,
              borderRadius: 2,
              background: checked
                ? (colorBlind ? `url(${getPatternDataUrl(sys.key, sys.c)})` : sys.c)
                : 'transparent',
              backgroundSize: colorBlind ? '8px 8px' : undefined,
              opacity: checked ? 0.8 : 0.3,
            }} />
            {sys.label}
          </label>
        )
      })}
      <button
        onClick={onClose}
        aria-label="Close filter"
        style={{
          color: color.muted,
          background: 'none', border: 'none', cursor: 'pointer',
          marginLeft: 8, display: 'flex', alignItems: 'center',
        }}
      ><X size={14} strokeWidth={sizes.iconStroke} /></button>
    </div>
  )
}
