import { useCallback, useState, useEffect, useRef } from 'react'
import { ChevronRight, ChevronDown, Circle, SquarePlus, CirclePlus, MoreHorizontal } from 'lucide-react'
import { color, sizes } from '../styles'
import { useA11yType } from '../hooks/useA11yType'
import { useTranslation } from '../i18n/index.jsx'

const ICON_SIZE = 12
const INDENT = 16

function shortId(id) { return id ? id.slice(0, 5) : '' }

const SYSTEM_COLORS = {
  s5: color.s5, s4: color.s4, s3: color.s3, s2: color.s2, s1: color.s1,
}

function findNodeInTree(root, id) {
  if (root.id === id) return root
  for (const child of root.children) {
    const found = findNodeInTree(child, id)
    if (found) return found
  }
  return null
}

function findParentInTree(root, targetId) {
  for (const child of root.children) {
    if (child.id === targetId) return root
    const found = findParentInTree(child, targetId)
    if (found) return found
  }
  return null
}

function TreeNode({ node, depth, expanded, onToggle, selectedId, renamingId, onSelect, onActivate, onAdd, onRename, onStartRename, t, tr, paneId }) {
  const isSelected = selectedId === node.id
  const hasChildren = node.children.length > 0
  const isExpanded = expanded[node.id]
  const isOperation = node.type === 'operation'
  const isSystem = node.type === 'system'
  const isActionsGroup = node.type === 'actions-group'
  const isAction = node.type === 'action'
  const isRenameAction = isAction && node.actionType === 'rename'
  const isDataNode = !isSystem && !isActionsGroup && !isAction

  const editing = renamingId === node.id && isDataNode
  const [editName, setEditName] = useState('')
  const editRef = useRef()

  useEffect(() => {
    if (editing) {
      setEditName(node.name || '')
      requestAnimationFrame(() => {
        editRef.current?.focus()
        editRef.current?.select()
      })
    }
  }, [editing])

  let label
  if (isActionsGroup) {
    label = tr('menu.actions')
  } else if (isRenameAction) {
    label = tr('menu.rename')
  } else if (isAction) {
    label = node.actionType === 'management' ? tr('menu.addManagement') : tr('menu.addOperation')
  } else if (isSystem) {
    label = tr(`systems.${node.systemKey}`)
  } else if (node.name) {
    label = node.name
  } else if (isOperation) {
    label = `${tr('nav.op')} ${shortId(node.id)}`
  } else {
    label = `${tr('nav.unit')} ${shortId(node.id)}`
  }

  const btnRef = useRef()

  useEffect(() => {
    if (isSelected && btnRef.current && !editing) {
      btnRef.current.focus({ preventScroll: false })
      btnRef.current.scrollIntoView({ block: 'nearest' })
    }
  }, [isSelected])

  const commitRename = () => {
    if (onRename) onRename(node.id, editName)
  }

  const handleClick = () => {
    if (isRenameAction) {
      onStartRename?.(node.parentNodeId)
    } else if (isAction) {
      onAdd(node.parentNodeId, node.actionType)
    } else {
      onSelect(node.id)
    }
  }

  const handleDoubleClick = () => {
    if (isDataNode) {
      onActivate(node.id)
    }
  }

  // Determine icon
  let iconElement
  if (isActionsGroup) {
    iconElement = <MoreHorizontal size={8} strokeWidth={2} />
  } else if (isAction) {
    iconElement = node.actionType === 'management'
      ? <SquarePlus size={8} strokeWidth={2} />
      : <CirclePlus size={8} strokeWidth={2} />
  } else if (isSystem) {
    iconElement = (
      <span aria-hidden="true" style={{
        width: 8, height: 8,
        background: SYSTEM_COLORS[node.systemKey]?.fill || color.muted,
        borderRadius: node.systemKey === 's1' ? '50%' : node.systemKey === 's2' ? 0 : 1,
        border: `1px solid ${SYSTEM_COLORS[node.systemKey]?.stroke || color.muted}`,
        transform: node.systemKey === 's2' ? 'rotate(45deg) scale(0.8)' : undefined,
      }} />
    )
  } else if (isOperation) {
    iconElement = <Circle size={8} fill={color.s1.fill} stroke={color.s1.stroke} strokeWidth={2} aria-hidden="true" />
  } else {
    iconElement = <span aria-hidden="true" style={{ width: 8, height: 8, background: color.s3.fill, border: `1px solid ${color.s3.stroke}`, borderRadius: 1 }} />
  }

  const isMuted = isActionsGroup || isAction

  return (
    <li role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined} aria-selected={isSelected}>
      <button
        ref={btnRef}
        data-node-id={node.id}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        tabIndex={isSelected ? 0 : -1}
        aria-label={label}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          width: '100%',
          paddingLeft: depth * INDENT + 4,
          paddingTop: 4, paddingBottom: 4, paddingRight: 8,
          minHeight: 28,
          background: isSelected ? color.hoverBg : 'none',
          border: 'none',
          borderLeft: isSelected ? `2px solid ${color.focus}` : '2px solid transparent',
          cursor: 'pointer', textAlign: 'left',
          ...(isMuted ? t.monoMuted : (isSelected ? t.monoActive : t.mono)),
        }}
      >
        {hasChildren ? (
          <span
            onClick={(e) => { e.stopPropagation(); onToggle(node.id) }}
            role="button"
            aria-label={isExpanded ? tr('nav.collapse') || 'Collapse' : tr('nav.expand') || 'Expand'}
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
        {iconElement}
        {editing && isDataNode ? (
          <input
            ref={editRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setEditing(false)
              e.stopPropagation()
            }}
            onBlur={commitRename}
            aria-label={tr('menu.rename')}
            style={{
              ...t.mono, color: color.primary,
              border: `1px solid ${color.focus}`,
              borderRadius: 2, padding: '1px 4px',
              background: 'none', width: '100%',
            }}
          />
        ) : label}
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
              onAdd={onAdd}
              onRename={onRename}
              onStartRename={onStartRename}
              renamingId={renamingId}
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

export function ExplorerTree({ tree, selectedId: selectedIdProp, paneId, focusedId, onSelect, onActivate, onAddNode, onRenameNode, onBack, onAnnounce }) {
  const selectedId = selectedIdProp ?? tree.id
  const t = useA11yType()
  const { t: tr } = useTranslation()
  const treeRef = useRef()
  const mounted = useRef(false)
  const [renamingId, setRenamingId] = useState(null)

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      requestAnimationFrame(() => {
        const btn = treeRef.current?.querySelector(`button[data-node-id="${selectedId}"]`)
        btn?.focus()
      })
    }
  }, [])

  const [expanded, setExpanded] = useState(() => ({ [tree.id]: true }))

  useEffect(() => {
    setExpanded(prev => {
      const next = { ...prev }
      const walk = (node) => {
        if (!(node.id in next)) next[node.id] = false
        node.children.forEach(walk)
      }
      walk(tree)
      if (selectedId) {
        const expandPath = (node) => {
          if (node.id === selectedId) return true
          for (const child of node.children) {
            if (expandPath(child)) { next[node.id] = true; return true }
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

  const handleStartRename = useCallback((nodeId) => {
    setRenamingId(nodeId)
  }, [])

  const handleCommitRename = useCallback((nodeId, name) => {
    if (onRenameNode) onRenameNode(nodeId, name)
    setRenamingId(null)
    // Refocus the node
    requestAnimationFrame(() => {
      const btn = treeRef.current?.querySelector(`button[data-node-id="${nodeId}"]`)
      btn?.focus()
    })
  }, [onRenameNode])

  const handleAdd = useCallback((nodeId, type) => {
    if (onAddNode) {
      onAddNode(nodeId, type)
      setExpanded(prev => ({ ...prev, [nodeId]: true }))
      onAnnounce?.(`${type === 'management' ? 'Management unit' : 'Operation'} added`)
    }
  }, [onAddNode, onAnnounce])

  // Keyboard: use DOM order of all buttons in the tree
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Shift') return

    const buttons = Array.from(treeRef.current?.querySelectorAll('button[data-node-id]') || [])
    const currentIdx = buttons.indexOf(document.activeElement)

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (currentIdx < buttons.length - 1) {
        const next = buttons[currentIdx + 1]
        next.focus()
        // Only update 3D selection for real nodes, not actions
        const id = next.dataset.nodeId
        if (id && !id.includes(':actions') && !id.includes(':add-')) onSelect(id)
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (currentIdx > 0) {
        const prev = buttons[currentIdx - 1]
        prev.focus()
        const id = prev.dataset.nodeId
        if (id && !id.includes(':actions') && !id.includes(':add-')) onSelect(id)
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      const id = document.activeElement?.dataset?.nodeId
      if (id) {
        const node = findNodeInTree(tree, id)
        if (node?.children.length > 0 && !expanded[id]) {
          handleToggle(id)
        } else if (currentIdx < buttons.length - 1) {
          const next = buttons[currentIdx + 1]
          next.focus()
          if (next.dataset.nodeId && !next.dataset.nodeId.includes(':actions') && !next.dataset.nodeId.includes(':add-')) onSelect(next.dataset.nodeId)
        }
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const id = document.activeElement?.dataset?.nodeId
      if (id) {
        const node = findNodeInTree(tree, id)
        if (node?.children.length > 0 && expanded[id]) {
          handleToggle(id)
        } else {
          const parent = findParentInTree(tree, id)
          if (parent) {
            const parentBtn = treeRef.current.querySelector(`button[data-node-id="${parent.id}"]`)
            if (parentBtn) {
              parentBtn.focus()
              if (!parent.id.includes(':')) onSelect(parent.id)
            }
          }
        }
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      document.activeElement?.click()
    } else if (e.key === 'Escape') {
      if (paneId != null || focusedId != null) {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        onBack?.()
      }
    } else if (e.key === 'F2') {
      e.preventDefault()
      const id = document.activeElement?.dataset?.nodeId
      if (id && !id.includes(':')) handleStartRename(id)
    } else if (e.key === 'Home') {
      e.preventDefault()
      if (buttons[0]) { buttons[0].focus(); if (buttons[0].dataset.nodeId) onSelect(buttons[0].dataset.nodeId) }
    } else if (e.key === 'End') {
      e.preventDefault()
      const last = buttons[buttons.length - 1]
      if (last) { last.focus(); if (last.dataset.nodeId && !last.dataset.nodeId.includes(':')) onSelect(last.dataset.nodeId) }
    }
  }, [tree, expanded, onSelect, onBack, paneId, focusedId, handleToggle, handleStartRename])

  useEffect(() => {
    const handler = (e) => {
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
        onAdd={handleAdd}
        onRename={handleCommitRename}
        onStartRename={handleStartRename}
        renamingId={renamingId}
        paneId={paneId}
        t={t}
        tr={tr}
      />
    </ul>
  )
}
