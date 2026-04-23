import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { color, type, panel } from '../../styles'
import { useA11yType } from '../../hooks/useA11yType'
import { useTranslation } from '../../i18n/index.jsx'
import { PROCESSOR_LIBRARY, canPlaceProcessor } from '../../signals/library'
import { Z_INDEX } from '../../constants'

function IOBadge({ present, label, emptyLabel }) {
  const t = useA11yType()
  return (
    <span style={{ ...(present ? t.mono : t.monoMuted) }}>
      {present ? label : emptyLabel}
    </span>
  )
}

export function ProcessorLibraryModal({ systemKey, onPick, onClose }) {
  const t = useA11yType()
  const { t: tr } = useTranslation()
  const firstBtnRef = useRef(null)

  useEffect(() => {
    firstBtnRef.current?.focus()
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onClose])

  const available = PROCESSOR_LIBRARY.filter(def => canPlaceProcessor(def, systemKey))

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tr('systemPage.processorLibrary')}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.35)',
        zIndex: Z_INDEX.menu,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...panel,
          background: color.white,
          width: 520,
          maxHeight: '80vh',
          border: `1px solid ${color.border}`,
          borderLeft: `3px solid ${color.metaUnit}`,
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: `1px solid ${color.border}`,
        }}>
          <h2 style={{ ...type.h2, margin: 0 }}>{tr('systemPage.processorLibrary')}</h2>
          <button
            aria-label={tr('nav.esc')}
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: color.secondary, padding: 4,
            }}
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div style={{ overflow: 'auto', padding: '8px 0' }}>
          {available.map((def, i) => (
            <button
              key={def.id}
              ref={i === 0 ? firstBtnRef : null}
              onClick={() => onPick(def)}
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                borderBottom: `1px solid ${color.borderLight}`,
                padding: '14px 20px',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = color.hoverBg }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
              onFocus={(e) => { e.currentTarget.style.background = color.hoverBg }}
              onBlur={(e) => { e.currentTarget.style.background = 'none' }}
            >
              <span style={{ ...t.h3, color: color.primary }}>{def.name}</span>
              <span style={{ ...t.body, color: color.secondary }}>{def.description}</span>
              <div style={{ display: 'flex', gap: 20, marginTop: 4 }}>
                <div>
                  <span style={{ ...t.label, marginRight: 6 }}>{tr('systemPage.inputs')}</span>
                  <IOBadge present={def.hasInputs} label={tr('systemPage.configurable')} emptyLabel={tr('systemPage.none')} />
                </div>
                <div>
                  <span style={{ ...t.label, marginRight: 6 }}>{tr('systemPage.outputs')}</span>
                  <IOBadge present={def.hasOutputs} label={tr('systemPage.configurable')} emptyLabel={tr('systemPage.none')} />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
