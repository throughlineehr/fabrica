import { useCallback, useState, useEffect, useRef } from 'react'
import { ChevronRight, ChevronDown, Circle, SquarePlus, CirclePlus, MoreHorizontal, Trash2, Scissors, Copy } from 'lucide-react'
import { color } from '../styles'
import { EXPLORER, OPACITY } from '../constants'
import { useA11yType } from '../hooks/useA11yType'
import { useTranslation } from '../i18n/index.jsx'
import { findNode, findParent } from '../tree/queries'
import { useTreeKeyboard, isDataNodeId } from '../hooks/useTreeKeyboard'
import { Keycap } from './Keycap'

const { indent: INDENT, iconSize: ICON_SIZE, rowMinHeight: ROW_MIN_HEIGHT, dropLineHeight: DROP_LINE_HEIGHT, pasteHighlightAlpha: PASTE_ALPHA } = EXPLORER

function shortId(id) { return id ? id.slice(0, 5) : '' }

const SYSTEM_COLORS = {
  s5: color.s5, s4: color.s4, s3: color.s3, s2: color.s2, s1: color.s1,
}


function TreeNode({ node, depth, expanded, onToggle, selectedId, renamingId, confirmDeleteId, cutNodeId, clipboardActive, pasteSlot, dragOverId, dragSlot, onSelect, onActivate, onAdd, onRename, onStartRename, onCancelRename, onDelete, onConfirmDelete, onCancelDelete, onSplice, onDuplicate, onDragBegin, onDragHover, onDrop, t, tr, paneId }) {
  const isSelected = selectedId === node.id
  const hasChildren = node.children.length > 0
  const isExpanded = expanded[node.id]
  const isOperation = node.type === 'operation'
  const isSystem = node.type === 'system'
  const isActionsGroup = node.type === 'actions-group'
  const isAction = node.type === 'action'
  const isRenameAction = isAction && node.actionType === 'rename'
  const isDeleteAction = isAction && node.actionType === 'delete'
  const isSpliceAction = isAction && node.actionType === 'splice'
  const isDuplicateAction = isAction && node.actionType === 'duplicate'
  const isDataNode = !isSystem && !isActionsGroup && !isAction
  const isCut = cutNodeId === node.id

  const editing = renamingId === node.id && isDataNode
  const [editName, setEditName] = useState('')
  const [prevEditing, setPrevEditing] = useState(editing)
  const editRef = useRef()

  // Reset edit field when editing starts (sync state to prop transition)
  if (editing !== prevEditing) {
    setPrevEditing(editing)
    if (editing) setEditName(node.name || '')
  }

  useEffect(() => {
    if (editing) {
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
  } else if (isDeleteAction) {
    label = tr('menu.delete')
  } else if (isSpliceAction) {
    label = tr('menu.splice')
  } else if (isDuplicateAction) {
    label = tr('menu.duplicate')
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
  }, [isSelected, editing])

  const commitRename = () => {
    if (onRename) onRename(node.id, editName)
  }

  const handleClick = () => {
    if (isRenameAction) {
      onStartRename?.(node.parentNodeId)
    } else if (isDeleteAction) {
      onDelete?.(node.parentNodeId)
    } else if (isSpliceAction) {
      onSplice?.(node.parentNodeId)
    } else if (isDuplicateAction) {
      onDuplicate?.(node.parentNodeId)
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

  const showDeleteConfirm = confirmDeleteId === node.id && isDataNode

  // Determine icon
  let iconElement
  if (isActionsGroup) {
    iconElement = <MoreHorizontal size={8} strokeWidth={2} />
  } else if (isDeleteAction) {
    iconElement = <Trash2 size={8} strokeWidth={2} />
  } else if (isSpliceAction) {
    iconElement = <Scissors size={8} strokeWidth={2} />
  } else if (isDuplicateAction) {
    iconElement = <Copy size={8} strokeWidth={2} />
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
  const isPasteTarget = isSelected && isDataNode && clipboardActive && !isCut
  const isDragTarget = dragOverId === node.id && isDataNode

  // Paste or drag indicator — drag takes priority when active
  const activeSlot = isDragTarget ? dragSlot : isPasteTarget ? pasteSlot : null
  const pasteLabel = activeSlot === 'in' ? `(${tr('menu.pasteInto')})` : activeSlot === 'after' ? `(${tr('menu.pasteBelow')})` : ''

  return (
    <li role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined} aria-selected={isSelected}>
      <div style={{ position: 'relative' }}>
        {activeSlot === 'after' && (
          <div style={{ position: 'absolute', bottom: 0, left: depth * INDENT + 4, right: 8, height: DROP_LINE_HEIGHT, background: color.focus, zIndex: 1, borderRadius: 1 }} />
        )}
        <button
          ref={btnRef}
          data-node-id={node.id}
          draggable={isDataNode && depth > 0}
          onDragStart={(e) => {
            if (!isDataNode) { e.preventDefault(); return }
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', node.id)
            onDragBegin?.(node.id)
          }}
          onDragOver={(e) => {
            if (!isDataNode) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            const rect = e.currentTarget.getBoundingClientRect()
            const y = e.clientY - rect.top
            const slot = y > rect.height * 0.65 ? 'after' : 'in'
            onDragHover?.(node.id, slot)
          }}
          onDragLeave={() => onDragHover?.(null, null)}
          onDrop={(e) => {
            e.preventDefault()
            if (!isDataNode) return
            const rect = e.currentTarget.getBoundingClientRect()
            const y = e.clientY - rect.top
            const slot = y > rect.height * 0.65 ? 'after' : 'in'
            onDrop?.(node.id, slot)
          }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          tabIndex={isSelected ? 0 : -1}
          aria-label={isCut ? `${label} (${tr('menu.cut')})` : isPasteTarget ? `${label} ${pasteLabel}` : label}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            width: '100%',
            paddingLeft: depth * INDENT + 4,
            paddingTop: 4, paddingBottom: 4, paddingRight: 8,
            minHeight: ROW_MIN_HEIGHT,
            opacity: isCut ? OPACITY.cutNode : 1,
            background: activeSlot === 'in' ? `${color.focus}${PASTE_ALPHA}` : isSelected ? color.hoverBg : 'none',
            border: 'none',
            borderLeft: isSelected ? `2px solid ${color.focus}` : '2px solid transparent',
            cursor: 'pointer', textAlign: 'left',
            ...(isCut ? t.monoMuted : isMuted ? t.monoMuted : (isSelected ? t.monoActive : t.mono)),
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
                if (e.key === 'Escape') onCancelRename?.()
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
      </div>
      {showDeleteConfirm && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          paddingLeft: depth * INDENT + 4 + ICON_SIZE + 6,
          paddingTop: 4, paddingBottom: 8, paddingRight: 8,
        }}>
          <span style={t.monoMuted}>{tr('menu.deleteConfirm')}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <span onClick={() => onConfirmDelete?.()} style={{ cursor: 'pointer' }}>
              <Keycap color={color.s2.stroke}>{tr('menu.delete').toLowerCase()}</Keycap>
            </span>
            <span onClick={() => onCancelDelete?.()} style={{ cursor: 'pointer' }}>
              <Keycap>{tr('nav.esc')}</Keycap>
            </span>
          </div>
        </div>
      )}
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
              confirmDeleteId={confirmDeleteId}
              cutNodeId={cutNodeId}
              clipboardActive={clipboardActive}
              pasteSlot={pasteSlot}
              dragOverId={dragOverId}
              dragSlot={dragSlot}
              onSelect={onSelect}
              onActivate={onActivate}
              onAdd={onAdd}
              onRename={onRename}
              onStartRename={onStartRename}
              onCancelRename={onCancelRename}
              onDelete={onDelete}
              onConfirmDelete={onConfirmDelete}
              onCancelDelete={onCancelDelete}
              onSplice={onSplice}
              onDuplicate={onDuplicate}
              onDragBegin={onDragBegin}
              onDragHover={onDragHover}
              onDrop={onDrop}
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

export function ExplorerTree({ tree, selectedId: selectedIdProp, paneId, focusedId, onSelect, onActivate, onAddNode, onRenameNode, onDeleteNode, onMoveNode, onDuplicateNode, onSpliceNode, onBack, onAnnounce }) {
  const selectedId = selectedIdProp ?? tree.id
  const t = useA11yType()
  const { t: tr } = useTranslation()
  const treeRef = useRef()
  const [renamingId, setRenamingId] = useState(null)
  const [clipboard, setClipboard] = useState(null) // { nodeId, mode: 'cut' | 'copy' }
  const [confirmDelete, setConfirmDelete] = useState(null) // nodeId to confirm
  const [pasteSlot, setPasteSlot] = useState('in') // 'in' = on node (highlight), 'after' = between nodes (line below)
  const [dragSourceId, setDragSourceId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const [dragSlot, setDragSlot] = useState(null) // 'in' | 'after'

  // Focus the initially-selected node on mount (uses ref so we ignore later selectedId changes)
  const initialSelectedIdRef = useRef(selectedId)
  useEffect(() => {
    requestAnimationFrame(() => {
      const btn = treeRef.current?.querySelector(`button[data-node-id="${initialSelectedIdRef.current}"]`)
      btn?.focus()
    })
  }, [])

  const [expanded, setExpanded] = useState(() => ({ [tree.id]: true }))
  const [prevTree, setPrevTree] = useState(tree)
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId)

  // Sync expanded map when tree or selection changes (checked during render, not in effect)
  if (tree !== prevTree || selectedId !== prevSelectedId) {
    setPrevTree(tree)
    setPrevSelectedId(selectedId)
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
  }

  const handleToggle = useCallback((id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const handleStartRename = useCallback((nodeId) => {
    setRenamingId(nodeId)
  }, [])

  const handleCancelRename = useCallback(() => {
    const id = renamingId
    setRenamingId(null)
    if (id) {
      requestAnimationFrame(() => {
        const btn = treeRef.current?.querySelector(`button[data-node-id="${id}"]`)
        btn?.focus()
      })
    }
  }, [renamingId])

  const handleCommitRename = useCallback((nodeId, name) => {
    if (onRenameNode) onRenameNode(nodeId, name)
    setRenamingId(null)
    // Refocus the node
    requestAnimationFrame(() => {
      const btn = treeRef.current?.querySelector(`button[data-node-id="${nodeId}"]`)
      btn?.focus()
    })
  }, [onRenameNode])

  const nodeLabel = useCallback((id) => {
    const node = findNode(tree, id)
    if (!node) return shortId(id)
    if (node.name) return node.name
    return node.type === 'operation' ? `Op ${shortId(id)}` : `Unit ${shortId(id)}`
  }, [tree])

  const modKey = navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl+'

  const handleCut = useCallback((nodeId) => {
    setClipboard({ nodeId, mode: 'cut' })
    setPasteSlot('in')
    onAnnounce?.(`${tr('menu.cut')} ${nodeLabel(nodeId)}. ${tr('menu.cutHint')} ${modKey}V ${tr('menu.toPaste')}.`)
  }, [onAnnounce, nodeLabel, tr, modKey])

  const handleCopy = useCallback((nodeId) => {
    setClipboard({ nodeId, mode: 'copy' })
    setPasteSlot('in')
    onAnnounce?.(`${tr('menu.copied')} ${nodeLabel(nodeId)}. ${tr('menu.cutHint')} ${modKey}V ${tr('menu.toPaste')}.`)
  }, [onAnnounce, nodeLabel, tr, modKey])

  const resolvePasteTarget = useCallback((targetId) => {
    if (pasteSlot === 'in') {
      return { parentId: targetId, insertIndex: undefined }
    }
    // 'after': insert as sibling after this node
    const parent = findParent(tree, targetId)
    if (!parent) return { parentId: targetId, insertIndex: undefined } // root fallback
    const siblings = parent.children.filter(c => isDataNodeId(c.id))
    const idx = siblings.findIndex(c => c.id === targetId)
    if (idx < 0) return { parentId: targetId, insertIndex: undefined }
    return { parentId: parent.id, insertIndex: idx + 1 }
  }, [pasteSlot, tree])

  const handlePaste = useCallback((targetId) => {
    if (!clipboard) return
    const srcLabel = nodeLabel(clipboard.nodeId)
    const dstLabel = nodeLabel(targetId)
    const { parentId, insertIndex } = resolvePasteTarget(targetId)
    const posLabel = pasteSlot === 'in' ? tr('menu.into') : tr('menu.below')
    if (clipboard.mode === 'cut') {
      onMoveNode?.(clipboard.nodeId, parentId, insertIndex)
      setClipboard(null)
      setPasteSlot('in')
      onAnnounce?.(`${tr('menu.moved')} ${srcLabel} ${posLabel} ${dstLabel}`)
    } else {
      onDuplicateNode?.(clipboard.nodeId, parentId, insertIndex)
      onAnnounce?.(`${tr('menu.pastedCopy')} ${srcLabel} ${posLabel} ${dstLabel}`)
    }
  }, [clipboard, onMoveNode, onDuplicateNode, onAnnounce, nodeLabel, resolvePasteTarget, pasteSlot, tr])

  const handleDelete = useCallback((nodeId) => {
    // Don't allow delete on root
    if (nodeId === tree.id) return
    setConfirmDelete(nodeId)
  }, [tree.id])

  const confirmDeleteAction = useCallback(() => {
    if (confirmDelete) {
      const parent = findParent(tree, confirmDelete)
      // Clear clipboard if we're deleting the cut/copied node
      if (clipboard?.nodeId === confirmDelete) setClipboard(null)
      onDeleteNode?.(confirmDelete)
      setConfirmDelete(null)
      onAnnounce?.(`${tr('menu.deleted')} ${nodeLabel(confirmDelete)}`)
      if (parent) {
        onSelect(parent.id)
        requestAnimationFrame(() => {
          const btn = treeRef.current?.querySelector(`button[data-node-id="${parent.id}"]`)
          btn?.focus()
        })
      }
    }
  }, [confirmDelete, onDeleteNode, tree, onSelect, clipboard, onAnnounce, nodeLabel, tr])

  const cancelDelete = useCallback(() => {
    const id = confirmDelete
    setConfirmDelete(null)
    if (id) {
      requestAnimationFrame(() => {
        const btn = treeRef.current?.querySelector(`button[data-node-id="${id}"]`)
        btn?.focus()
      })
    }
  }, [confirmDelete])

  const handleSplice = useCallback((nodeId) => {
    if (nodeId === tree.id) return
    const parent = findParent(tree, nodeId)
    onSpliceNode?.(nodeId)
    onAnnounce?.(tr('menu.childrenPromoted'))
    if (parent) {
      onSelect(parent.id)
      requestAnimationFrame(() => {
        const btn = treeRef.current?.querySelector(`button[data-node-id="${parent.id}"]`)
        btn?.focus()
      })
    }
  }, [tree, onSpliceNode, onSelect, onAnnounce, tr])

  const handleDuplicate = useCallback((nodeId) => {
    if (nodeId === tree.id) return
    const node = findNode(tree, nodeId)
    if (node?.type === 'operation') return // operations are sole children, can't duplicate
    const parent = findParent(tree, nodeId)
    if (parent) {
      onDuplicateNode?.(nodeId, parent.id)
      onAnnounce?.(tr('menu.subtreeDuplicated'))
    }
  }, [tree, onDuplicateNode, onAnnounce, tr])

  // Drag and drop
  const handleDragBegin = useCallback((nodeId) => {
    if (nodeId === tree.id) return
    setDragSourceId(nodeId)
  }, [tree.id])

  const handleDragHover = useCallback((nodeId, slot) => {
    setDragOverId(nodeId)
    setDragSlot(slot)
  }, [])

  const handleDrop = useCallback((targetId, slot) => {
    if (!dragSourceId || dragSourceId === targetId) {
      setDragSourceId(null); setDragOverId(null); setDragSlot(null)
      return
    }
    if (slot === 'in') {
      onMoveNode?.(dragSourceId, targetId)
      onAnnounce?.(`${tr('menu.moved')} ${nodeLabel(dragSourceId)} ${tr('menu.into')} ${nodeLabel(targetId)}`)
    } else {
      // 'after': insert as sibling
      const parent = findParent(tree, targetId)
      if (parent) {
        const siblings = parent.children.filter(c => isDataNodeId(c.id))
        const idx = siblings.findIndex(c => c.id === targetId)
        onMoveNode?.(dragSourceId, parent.id, idx + 1)
        onAnnounce?.(`${tr('menu.moved')} ${nodeLabel(dragSourceId)} ${tr('menu.below')} ${nodeLabel(targetId)}`)
      }
    }
    setDragSourceId(null); setDragOverId(null); setDragSlot(null)
  }, [dragSourceId, tree, onMoveNode, onAnnounce, nodeLabel, tr])

  const handleAdd = useCallback((nodeId, type) => {
    if (onAddNode) {
      onAddNode(nodeId, type)
      setExpanded(prev => ({ ...prev, [nodeId]: true }))
      onAnnounce?.(type === 'management' ? tr('menu.managementAdded') : tr('menu.operationAdded'))
    }
  }, [onAddNode, onAnnounce, tr])

  // Keyboard: use DOM order of all buttons in the tree
  useTreeKeyboard({
    treeRef, tree, expanded, clipboard, pasteSlot, confirmDelete,
    paneId, focusedId,
    onSelect, onActivate, onBack,
    handleToggle, handleStartRename,
    handleCut, handleCopy, handlePaste, handleDelete,
    setPasteSlot, setClipboard,
    confirmDeleteAction, cancelDelete,
  })

  return (
    <ul
      ref={treeRef}
      role="tree"
      aria-label={tr('tabs.explorer')}
      style={{ listStyle: 'none', padding: 0, margin: 0 }}
      onDragEnd={() => { setDragSourceId(null); setDragOverId(null); setDragSlot(null) }}
    >
      <TreeNode
        node={tree}
        depth={0}
        expanded={expanded}
        onToggle={handleToggle}
        selectedId={selectedId}
        confirmDeleteId={confirmDelete}
        cutNodeId={clipboard?.mode === 'cut' ? clipboard.nodeId : null}
        clipboardActive={clipboard != null}
        pasteSlot={pasteSlot}
        dragOverId={dragOverId}
        dragSlot={dragSlot}
        onSelect={onSelect}
        onActivate={onActivate}
        onAdd={handleAdd}
        onRename={handleCommitRename}
        onStartRename={handleStartRename}
        onCancelRename={handleCancelRename}
        onDelete={handleDelete}
        onConfirmDelete={confirmDeleteAction}
        onCancelDelete={cancelDelete}
        onSplice={handleSplice}
        onDuplicate={handleDuplicate}
        onDragBegin={handleDragBegin}
        onDragHover={handleDragHover}
        onDrop={handleDrop}
        renamingId={renamingId}
        paneId={paneId}
        t={t}
        tr={tr}
      />
    </ul>
  )
}
