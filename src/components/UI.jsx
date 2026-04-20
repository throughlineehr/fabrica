import { useEffect } from 'react'
import { ui, color } from '../styles'
import { Z_INDEX } from '../constants'
import { useTranslation } from '../i18n/index.jsx'

export function ContextMenu({ x, y, onAddChild, onAddOperation, onClose, accentColor = color.metaUnit }) {
  const { t: tr } = useTranslation()

  useEffect(() => {
    const handler = () => onClose()
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [onClose])

  const items = [
    onAddChild && { label: tr('menu.addManagement'), action: onAddChild },
    onAddOperation && { label: tr('menu.addOperation'), action: onAddOperation },
  ].filter(Boolean)

  return (
    <div style={{
      position: 'fixed', left: x, top: y, zIndex: Z_INDEX.menu,
      ...ui.contextMenu.container,
      borderLeftColor: accentColor,
    }}>
      <div style={ui.contextMenu.header}>{tr('menu.actions')}</div>
      {items.map((item, i) => (
        <button
          key={i}
          onClick={item.action}
          style={ui.contextMenu.item}
          onMouseEnter={(e) => e.target.style.background = color.hoverBg}
          onMouseLeave={(e) => e.target.style.background = 'none'}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
