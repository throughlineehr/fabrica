import { useEffect, useRef } from 'react'
import { ui, color } from '../styles'
import { Z_INDEX } from '../constants'
import { useTranslation } from '../i18n/index.jsx'

export function ContextMenu({ x, y, onAddChild, onAddOperation, onClose, accentColor = color.metaUnit }) {
  const { t: tr } = useTranslation()
  const menuRef = useRef()

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose()
    }
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [onClose])

  // Focus first item on mount
  useEffect(() => {
    const firstBtn = menuRef.current?.querySelector('button[data-menu-item]')
    firstBtn?.focus()
  }, [])

  const items = [
    onAddChild && { label: tr('menu.addManagement'), action: onAddChild },
    onAddOperation && { label: tr('menu.addOperation'), action: onAddOperation },
  ].filter(Boolean)

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const btns = Array.from(menuRef.current.querySelectorAll('button[data-menu-item]'))
      const idx = btns.indexOf(document.activeElement)
      let next
      if (e.key === 'ArrowDown') {
        next = idx < btns.length - 1 ? idx + 1 : 0
      } else {
        next = idx > 0 ? idx - 1 : btns.length - 1
      }
      btns[next]?.focus()
    }
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={tr('menu.actions')}
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed', left: x, top: y, zIndex: Z_INDEX.menu,
        ...ui.contextMenu.container,
        borderLeftColor: accentColor,
      }}
    >
      <div style={ui.contextMenu.header}>{tr('menu.actions')}</div>
      {items.map((item, i) => (
        <button
          key={i}
          role="menuitem"
          data-menu-item
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
