import { Filter, X } from 'lucide-react'
import { color } from '../../styles'
import { sizes } from '../../styles'
import { useAccessibility } from '../../accessibility'
import { getPatternDataUrl } from '../../hooks/usePatternTexture'

const FILTER_HEIGHT = 48

export { FILTER_HEIGHT }

export function FilterBar({ open, onClose, t, tr }) {
  const { colorBlind } = useAccessibility()
  if (!open) return null
  return (
    <div style={{
      position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)',
      height: FILTER_HEIGHT,
      zIndex: 950,
      background: 'rgba(255,255,255,0.95)',
      backdropFilter: 'blur(8px)',
      border: `1px solid ${color.border}`,
      borderRadius: 6,
      display: 'flex', alignItems: 'center',
      padding: '0 16px',
      gap: 16,
    }}>
      <Filter size={sizes.iconSize} strokeWidth={sizes.iconStroke} color={color.primary} style={{ marginRight: 4 }} />
      {[
        { key: 's5', label: 'S5', c: color.s5.fill },
        { key: 's4', label: 'S4', c: color.s4.fill },
        { key: 's3', label: 'S3', c: color.s3.fill },
        { key: 's2', label: 'S2', c: color.s2.fill },
        { key: 's1', label: 'S1', c: color.s1.fill },
      ].map((sys) => (
        <label key={sys.label} style={{
          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          ...t.mono, color: color.primary,
        }}>
          <input
            type="checkbox"
            defaultChecked
            aria-label={`Filter ${sys.label}`}
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
          />
          <span aria-hidden="true" style={{
            width: colorBlind ? 22 : 14,
            height: colorBlind ? 22 : 14,
            border: `2px solid ${sys.c}`,
            borderRadius: 2,
            background: colorBlind
              ? `url(${getPatternDataUrl(sys.key, sys.c)})`
              : sys.c,
            backgroundSize: colorBlind ? '8px 8px' : undefined,
            opacity: 0.8,
          }} />
          {sys.label}
        </label>
      ))}
      <button
        onClick={onClose}
        style={{
          color: color.muted,
          background: 'none', border: 'none', cursor: 'pointer',
          marginLeft: 8, display: 'flex', alignItems: 'center',
        }}
      ><X size={14} strokeWidth={sizes.iconStroke} /></button>
    </div>
  )
}
