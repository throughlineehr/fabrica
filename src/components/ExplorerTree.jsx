import { useCallback, useState, useEffect, useRef } from 'react'
import { ChevronRight, ChevronDown, Circle, SquarePlus, CirclePlus } from 'lucide-react'
import { Keycap } from './Keycap'
import { color, sizes } from '../styles'
import { useA11yType } from '../hooks/useA11yType'
import { useTranslation } from '../i18n/index.jsx'

const ICON_SIZE = 12
const INDENT = 16

function shortId(id) { return id ? id.slice(0, 5) : '' }

const SYSTEM_COLORS = {
  s5: color.s5, s4: color.s4, s3: color.s3, s2: color.s2, s1: color.s1,
}

function TreeNode({ node, depth, expanded, onToggle, selectedId, onSelect, onActivate, onAdd, shiftHeld, commandIdx, canAddMgmt, canAddOp, t, tr, paneId }) {
  const isSelected = selectedId === node.id
  const hasChildren = node.children.length > 0
  const isExpanded = expanded[node.id]
  const isOperation = node.type === 'operation'
  const isSystem = node.type === 'system'
  const isManagement = !isOperation && !isSystem
  const canAdd = isManagement && (canAddMgmt || canAddOp)

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

  useEffect(() => {
    if (isSelected && btnRef.current) {
      btnRef.current.focus({ preventScroll: false })
      btnRef.current.scrollIntoView({ block: 'nearest' })
    }
  }, [isSelected])

  const showCommandMode = shiftHeld && isSelected && canAdd

  return (
    <li role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined} aria-selected={isSelected}>
      <div style={{
        display: 'flex', alignItems: 'center',
        background: isSelected ? color.hoverBg : 'none',
        borderLeft: isSelected ? `2px solid ${color.focus}` : '2px solid transparent',
      }}>
        <button
          ref={btnRef}
          data-node-id={node.id}
          onClick={() => onSelect(node.id)}
          onDoubleClick={() => onActivate(node.id)}
          tabIndex={isSelected ? 0 : -1}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            flex: 1,
            paddingLeft: depth * INDENT + 4,
            paddingTop: 4, paddingBottom: 4, paddingRight: 8,
            minHeight: 28,
            background: 'none', border: 'none',
            cursor: 'pointer', textAlign: 'left',
            ...(isSelected ? t.monoActive : t.mono),
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
          {isSelected && canAdd && !shiftHeld && (
            <span style={{ marginLeft: 6, flexShrink: 0 }}><Keycap>SHIFT</Keycap></span>
          )}
        </button>

      </div>

      {/* Command mode: replace children with action items */}
      {showCommandMode && (() => {
        const cmds = []
        if (canAddMgmt) cmds.push({ type: 'management', label: 'Management', hotkey: 'M', Icon: SquarePlus })
        if (canAddOp) cmds.push({ type: 'operation', label: 'Operation', hotkey: 'O', Icon: CirclePlus })
        return (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {cmds.map((cmd, i) => {
              const focused = commandIdx === i
              return (
                <li key={cmd.type}>
                  <button
                    onClick={() => onAdd(node.id, cmd.type)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      width: '100%',
                      paddingLeft: (depth + 1) * INDENT + 4,
                      paddingTop: 4, paddingBottom: 4, paddingRight: 8,
                      minHeight: 28,
                      background: focused ? color.hoverBg : 'none',
                      border: 'none',
                      borderLeft: focused ? `2px solid ${color.focus}` : '2px solid transparent',
                      cursor: 'pointer', textAlign: 'left',
                      ...t.monoMuted,
                    }}
                  >
                    {/* Spacer matching chevron width */}
                    <span style={{ width: ICON_SIZE }} />
                    {/* Icon in the square's position */}
                    <cmd.Icon size={8} strokeWidth={2} />
                    {cmd.label}
                    <Keycap>{cmd.hotkey}</Keycap>
                  </button>
                </li>
              )
            })}
          </ul>
        )
      })()}

      {/* Normal children (hidden in command mode) */}
      {!showCommandMode && hasChildren && isExpanded && (
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
              shiftHeld={shiftHeld}
              commandIdx={commandIdx}
              canAddMgmt={canAddMgmt}
              canAddOp={canAddOp}
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

export function ExplorerTree({ tree, selectedId: selectedIdProp, paneId, focusedId, onSelect, onActivate, canAddManagement, canAddOperation, onAddNode, onBack }) {
  const selectedId = selectedIdProp ?? tree.id
  const t = useA11yType()
  const { t: tr } = useTranslation()
  const treeRef = useRef()
  const mounted = useRef(false)
  const [shiftHeld, setShiftHeld] = useState(false)
  const [commandIdx, setCommandIdx] = useState(-1)

  // Reset command index when shift released or selection changes
  useEffect(() => { if (!shiftHeld) setCommandIdx(-1) }, [shiftHeld])
  useEffect(() => { setCommandIdx(-1) }, [selectedId])

  // Track Shift key state
  useEffect(() => {
    const down = (e) => { if (e.key === 'Shift') setShiftHeld(true) }
    const up = (e) => { if (e.key === 'Shift') setShiftHeld(false) }
    const blur = () => setShiftHeld(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

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

  const handleAdd = useCallback((nodeId, type) => {
    if (onAddNode) {
      onAddNode(nodeId, type)
      setExpanded(prev => ({ ...prev, [nodeId]: true }))
    }
  }, [onAddNode])

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

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Shift') return // Don't process shift itself

    const flat = getVisibleNodes()
    const idx = flat.findIndex(n => n.id === selectedId)

    // Build command list for the selected node
    const selectedNode = flat[idx]
    const cmds = []
    if (selectedNode && selectedNode.type !== 'operation' && selectedNode.type !== 'system') {
      if (canAddManagement?.(selectedNode.id)) cmds.push('management')
      if (canAddOperation?.(selectedNode.id)) cmds.push('operation')
    }
    const inCommandMode = e.shiftKey && cmds.length > 0

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (inCommandMode) {
        setCommandIdx(prev => Math.min(prev + 1, cmds.length - 1))
      } else {
        if (idx < flat.length - 1) onSelect(flat[idx + 1].id)
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (inCommandMode) {
        setCommandIdx(prev => Math.max(prev - 1, -1))
      } else {
        if (idx > 0) onSelect(flat[idx - 1].id)
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      const node = flat[idx]
      if (node?.children.length > 0 && !expanded[node.id]) handleToggle(node.id)
      else if (node?.children.length > 0 && expanded[node.id]) onSelect(node.children[0].id)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const node = flat[idx]
      if (node?.children.length > 0 && expanded[node.id]) {
        handleToggle(node.id)
      } else {
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
      if (inCommandMode && commandIdx >= 0 && commandIdx < cmds.length) {
        handleAdd(selectedNode.id, cmds[commandIdx])
        return
      }
      if (selectedId) onActivate(selectedId)
    } else if (e.key === 'M' && e.shiftKey) {
      // Shift+M = add management (shift is held, so shiftHeld is true, command mode visible)
      const node = flat[idx]
      if (node && node.type !== 'operation' && node.type !== 'system' && canAddManagement?.(node.id)) {
        e.preventDefault()
        handleAdd(node.id, 'management')
      }
    } else if (e.key === 'O' && e.shiftKey) {
      // Shift+O = add operation
      const node = flat[idx]
      if (node && node.type !== 'operation' && node.type !== 'system' && canAddOperation?.(node.id)) {
        e.preventDefault()
        handleAdd(node.id, 'operation')
      }
    } else if (e.key === 'Escape') {
      if (paneId != null || focusedId != null) {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        onBack?.()
      }
    } else if (e.key === 'Home') {
      e.preventDefault()
      onSelect(tree.id)
    } else if (e.key === 'End') {
      e.preventDefault()
      if (flat.length > 0) onSelect(flat[flat.length - 1].id)
    }
  }, [tree, selectedId, expanded, commandIdx, onSelect, onActivate, onBack, paneId, focusedId, handleToggle, handleAdd, getVisibleNodes, canAddManagement, canAddOperation])

  useEffect(() => {
    const handler = (e) => {
      if (!treeRef.current?.contains(document.activeElement)) return
      handleKeyDown(e)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [handleKeyDown])

  const selectedNodeCanAddMgmt = canAddManagement?.(selectedId) ?? false
  const selectedNodeCanAddOp = canAddOperation?.(selectedId) ?? false

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
        shiftHeld={shiftHeld}
        commandIdx={commandIdx}
        canAddMgmt={selectedNodeCanAddMgmt}
        canAddOp={selectedNodeCanAddOp}
        paneId={paneId}
        t={t}
        tr={tr}
      />
    </ul>
  )
}
