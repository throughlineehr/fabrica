import { useEffect } from 'react'
import { ui, color } from '../styles'
import { Z_INDEX } from '../constants'

export function ContextMenu({ x, y, onAddChild, onAddOperation, onClose, accentColor = color.metaUnit }) {
  useEffect(() => {
    const handler = () => onClose()
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [onClose])

  const items = [
    onAddChild && { label: 'Add management', action: onAddChild },
    onAddOperation && { label: 'Add operation', action: onAddOperation },
  ].filter(Boolean)

  return (
    <div style={{
      position: 'fixed', left: x, top: y, zIndex: Z_INDEX.menu,
      ...ui.contextMenu.container,
      borderLeftColor: accentColor,
    }}>
      <div style={ui.contextMenu.header}>Actions</div>
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

export function BackButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ position: 'fixed', top: 20, right: 20, zIndex: Z_INDEX.menu, ...ui.button }}
      onMouseEnter={(e) => { e.target.style.color = color.secondary; e.target.style.borderLeftColor = color.muted }}
      onMouseLeave={(e) => { e.target.style.color = color.primary; e.target.style.borderLeftColor = color.primary }}
    >
      Back
    </button>
  )
}
