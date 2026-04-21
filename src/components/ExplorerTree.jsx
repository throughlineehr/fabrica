import { useCallback, useState, useEffect, useRef } from 'react'
import { ChevronRight, ChevronDown, Circle } from 'lucide-react'
import { color } from '../styles'
import { flattenTree } from '../tree/index'
import { useA11yType } from '../hooks/useA11yType'
import { useTranslation } from '../i18n/index.jsx'

const ICON_SIZE = 12
const INDENT = 16

function shortId(id) { return id ? id.slice(0, 5) : '' }

const SYSTEM_COLORS = {
  s5: color.s5, s4: color.s4, s3: color.s3, s2: color.s2, s1: color.s1,
}

function TreeNode({ node, depth, expanded, onToggle, selectedId, paneId, onSelect, onActivate, onContextMenu, t, tr }) {
  const isSelected = selectedId === node.id
  const hasChildren = node.children.length > 0
  const isExpanded = expanded[node.id]
  const isOperation = node.type === 'operation'
  const isSystem = node.type === 'system'

  let label, sysColor
  if (isSystem) {
    label = tr(`systems.${node.systemKey}`)
    sysColor = SYSTEM_COLORS[node.systemKey]?.fill || color.muted
  } else if (isOperation) {
    label = `${tr('nav.op')} ${shortId(node.id)}`
    sysColor = color.s1.fill
  } else {
    label = `${tr('nav.unit')} ${shortId(node.id)}`
    sysColor = color.s3.fill
  }
  const btnRef = useRef()

  // Auto-focus when selected
  useEffect(() => {
    if (isSelected && btnRef.current) {
      btnRef.current.focus({ preventScroll: false })
      btnRef.current.scrollIntoView({ block: 'nearest' })
    }
  }, [isSelected])

  return (
    <li role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined} aria-selected={isSelected}>
      <button
        ref={btnRef}
        data-node-id={node.id}
        onClick={() => onSelect(node.id)}
        onDoubleClick={() => onActivate(node.id)}
        onContextMenu={(e) => {
          e.preventDefault()
          if (onContextMenu && !isSystem && node.type !== 'operation') {
            onContextMenu(node.id, e.clientX, e.clientY)
          }
        }}
        tabIndex={isSelected ? 0 : -1}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          width: '100%',
          paddingLeft: depth * INDENT + 4,
          paddingTop: 4, paddingBottom: 4, paddingRight: 8,
          minHeight: 28,
          background: isSelected ? color.hoverBg : 'none',
          border: 'none',
          borderLeft: isSelected ? `2px solid ${color.focus}` : '2px solid transparent',
          cursor: 'pointer',
          textAlign: 'left',
          ...t.mono,
          color: isSelected ? color.primary : color.secondary,
        }}
      >
        {hasChildren ? (
          <span
            onClick={(e) => { e.stopPropagation(); onToggle(node.id) }}
            role="button"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
            tabIndex={-1}
            style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
          >
            {isExpanded
              ? <ChevronDown size={ICON_SIZE} strokeWidth={1.5} />
              : <ChevronRight size={ICON_SIZE} strokeWidth={1.5} />
            }
          </span>
        ) : (
          <span style={{ width: ICON_SIZE }} aria-hidden="true" />
        )}
        {isSystem ? (
          <span aria-hidden="true" style={{
            width: 8, height: 8,
            background: sysColor,
            borderRadius: node.systemKey === 's1' ? '50%' : node.systemKey === 's2' ? 0 : 1,
            border: `1px solid ${SYSTEM_COLORS[node.systemKey]?.stroke || color.muted}`,
            transform: node.systemKey === 's2' ? 'rotate(45deg) scale(0.8)' : undefined,
          }} />
        ) : isOperation ? (
          <Circle size={8} fill={sysColor} stroke={color.s1.stroke} strokeWidth={2} aria-hidden="true" />
        ) : (
          <span aria-hidden="true" style={{ width: 8, height: 8, background: sysColor, border: `1px solid ${color.s3.stroke}`, borderRadius: 1 }} />
        )}
        {label}
      </button>
      {hasChildren && isExpanded && (
        <ul role="group" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {node.children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              selectedId={selectedId}
              onSelect={onSelect}
              onActivate={onActivate}
              onContextMenu={onContextMenu}
              paneId={paneId}
              t={t}
              tr={tr}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export function ExplorerTree({ tree, selectedId: selectedIdProp, paneId, focusedId, onSelect, onActivate, onContextMenu, onBack }) {
  // Default to root if nothing selected
  const selectedId = selectedIdProp ?? tree.id
  const t = useA11yType()
  const { t: tr } = useTranslation()
  const treeRef = useRef()
  const mounted = useRef(false)

  // Auto-focus selected item on mount
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      // Small delay to let the tree render
      requestAnimationFrame(() => {
        const btn = treeRef.current?.querySelector(`button[data-node-id="${selectedId}"]`)
        btn?.focus()
      })
    }
  }, [])

  const [expanded, setExpanded] = useState(() => {
    const map = {}
    const walk = (node) => { map[node.id] = true; node.children.forEach(walk) }
    walk(tree)
    return map
  })

  // Expand new nodes and ensure selected node's ancestors are expanded
  useEffect(() => {
    setExpanded(prev => {
      const next = { ...prev }
      const walk = (node) => {
        if (!(node.id in next)) next[node.id] = true
        node.children.forEach(walk)
      }
      walk(tree)
      // Ensure path to selected node is expanded
      if (selectedId) {
        const expandPath = (node) => {
          if (node.id === selectedId) return true
          for (const child of node.children) {
            if (expandPath(child)) {
              next[node.id] = true
              return true
            }
          }
          return false
        }
        expandPath(tree)
      }
      return next
    })
  }, [tree, selectedId])

  const handleToggle = useCallback((id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  // Flatten tree respecting expanded state
  const getVisibleNodes = useCallback(() => {
    const result = []
    const walk = (node) => {
      result.push(node)
      if (node.children.length > 0 && expanded[node.id]) {
        node.children.forEach(walk)
      }
    }
    walk(tree)
    return result
  }, [tree, expanded])

  // Keyboard navigation following ARIA treeview pattern
  const handleKeyDown = useCallback((e) => {
    const flat = getVisibleNodes()

    const idx = flat.findIndex(n => n.id === selectedId)

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (idx < flat.length - 1) onSelect(flat[idx + 1].id)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (idx > 0) onSelect(flat[idx - 1].id)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      const node = flat[idx]
      if (node?.children.length > 0 && !expanded[node.id]) {
        handleToggle(node.id)
      } else if (node?.children.length > 0 && expanded[node.id]) {
        onSelect(node.children[0].id)
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const node = flat[idx]
      if (node?.children.length > 0 && expanded[node.id]) {
        handleToggle(node.id)
      } else {
        // Go to parent
        const findParent = (root, targetId) => {
          for (const child of root.children) {
            if (child.id === targetId) return root
            const found = findParent(child, targetId)
            if (found) return found
          }
          return null
        }
        const parent = findParent(tree, selectedId)
        if (parent) onSelect(parent.id)
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (selectedId) onActivate(selectedId)
    } else if ((e.key === 'm' || e.key === 'M' || e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) && onContextMenu) {
      e.preventDefault()
      e.stopPropagation()
      // Find the selected node — only management nodes get context menu
      const node = flat[idx]
      if (node && node.type !== 'operation' && node.type !== 'system') {
        const btn = document.querySelector(`button[data-node-id="${selectedId}"]`)
        const rect = btn?.getBoundingClientRect()
        onContextMenu(selectedId, rect ? rect.right : window.innerWidth / 2, rect ? rect.top : window.innerHeight / 2)
      }
    } else if (e.key === 'Escape') {
      if (paneId != null || focusedId != null) {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        onBack?.()
      }
      // If nothing to back out of, let it propagate to close the panel
      return
    } else if (e.key === 'Home') {
      e.preventDefault()
      onSelect(tree.id)
    } else if (e.key === 'End') {
      e.preventDefault()
      if (flat.length > 0) onSelect(flat[flat.length - 1].id)
    }
  }, [tree, selectedId, expanded, onSelect, onActivate, onBack, onContextMenu, paneId, focusedId, handleToggle, getVisibleNodes])

  // Use window listener so we catch keys regardless of focus bubbling
  useEffect(() => {
    const handler = (e) => {
      // Only handle if focus is inside this tree
      if (!treeRef.current?.contains(document.activeElement)) return
      handleKeyDown(e)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [handleKeyDown])

  return (
    <ul
      ref={treeRef}
      role="tree"
      aria-label={tr('tabs.explorer')}
      style={{ listStyle: 'none', padding: 0, margin: 0 }}
    >
      <TreeNode
        node={tree}
        depth={0}
        expanded={expanded}
        onToggle={handleToggle}
        selectedId={selectedId}
        onSelect={onSelect}
        onActivate={onActivate}
        t={t}
        tr={tr}
      />
    </ul>
  )
}
