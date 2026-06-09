import { useCallback, useEffect } from 'react'
import { findNode, findParent } from '../tree/queries'

// Node ID classification helpers
const SYSTEM_KEYS = ['s1', 's2', 's3', 's4', 's5']
export function isSystemNodeId(id) {
  if (!id || !id.includes(':')) return false
  return SYSTEM_KEYS.includes(id.split(':')[1])
}
export function isDataNodeId(id) { return id && !id.includes(':') }
export function isSelectableId(id) { return id && !id.includes(':actions') && !id.includes(':add-') && !id.includes(':delete') && !id.includes(':splice') && !id.includes(':duplicate') && !id.includes(':rename') }
export function selectableParentId(id) {
  if (!id || !id.includes(':')) return id
  return id.split(':')[0]
}

/**
 * Keyboard handler for the Explorer tree.
 * Manages navigation, clipboard (cut/copy/paste), delete confirmation, rename, and 3D selection sync.
 */
export function useTreeKeyboard({
  treeRef, tree, expanded, clipboard, pasteSlot, confirmDelete,
  paneId, focusedId,
  onSelect, onActivate, onBack,
  handleToggle, handleStartRename,
  handleCut, handleCopy, handlePaste, handleDelete,
  setPasteSlot, setClipboard,
  confirmDeleteAction, cancelDelete,
}) {
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Shift') return

    const mod = e.metaKey || e.ctrlKey
    const buttons = Array.from(treeRef.current?.querySelectorAll('button[data-node-id]') || [])
    const currentIdx = buttons.indexOf(document.activeElement)
    const currentId = document.activeElement?.dataset?.nodeId

    // Delete confirmation takes priority
    if (confirmDelete) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        e.stopImmediatePropagation()
        confirmDeleteAction()
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        cancelDelete()
        return
      }
      e.preventDefault()
      return
    }

    // Cut: Ctrl/Cmd+X
    if (mod && e.code === 'KeyX') {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (currentId && isDataNodeId(currentId) && currentId !== tree.id) {
        handleCut(currentId)
      }
      return
    }
    // Copy: Ctrl/Cmd+C
    if (mod && e.code === 'KeyC') {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (currentId && isDataNodeId(currentId)) {
        handleCopy(currentId)
      }
      return
    }
    // Paste: Ctrl/Cmd+V
    if (mod && e.code === 'KeyV') {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (currentId && isDataNodeId(currentId) && clipboard) {
        handlePaste(currentId)
      }
      return
    }

    // Delete / Backspace
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (currentId && isDataNodeId(currentId) && currentId !== tree.id) {
        handleDelete(currentId)
      }
      return
    }

    // Clipboard-active navigation: interleave 'in' (highlight) and 'after' (line)
    if (clipboard && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      const dataButtons = buttons.filter(b => isDataNodeId(b.dataset.nodeId))
      const dataIdx = dataButtons.findIndex(b => b.dataset.nodeId === currentId)
      if (dataIdx < 0) {
        if (dataButtons.length > 0) { dataButtons[0].focus(); onSelect(dataButtons[0].dataset.nodeId); setPasteSlot('in') }
        return
      }

      if (e.key === 'ArrowDown') {
        if (pasteSlot === 'in') {
          setPasteSlot('after')
        } else {
          if (dataIdx < dataButtons.length - 1) {
            const next = dataButtons[dataIdx + 1]
            next.focus()
            onSelect(next.dataset.nodeId)
            setPasteSlot('in')
          }
        }
      } else {
        if (pasteSlot === 'after') {
          setPasteSlot('in')
        } else {
          if (dataIdx > 0) {
            const prev = dataButtons[dataIdx - 1]
            prev.focus()
            onSelect(prev.dataset.nodeId)
            setPasteSlot('after')
          }
        }
      }
      return
    }

    // 3D selection for any node type
    const selectFor3D = (id) => {
      if (isSystemNodeId(id)) {
        onSelect(id)
      } else {
        const parentId = selectableParentId(id)
        if (parentId) onSelect(parentId)
      }
    }

    // Normal navigation
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (currentIdx < buttons.length - 1) {
        const next = buttons[currentIdx + 1]
        next.focus()
        selectFor3D(next.dataset.nodeId)
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (currentIdx > 0) {
        const prev = buttons[currentIdx - 1]
        prev.focus()
        selectFor3D(prev.dataset.nodeId)
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (currentId) {
        const node = findNode(tree, currentId)
        if (node?.children.length > 0 && !expanded[currentId]) {
          handleToggle(currentId)
        } else if (currentIdx < buttons.length - 1) {
          const next = buttons[currentIdx + 1]
          next.focus()
          selectFor3D(next.dataset.nodeId)
        }
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (currentId) {
        const node = findNode(tree, currentId)
        if (node?.children.length > 0 && expanded[currentId]) {
          handleToggle(currentId)
        } else {
          const parent = findParent(tree, currentId)
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
      if (isSystemNodeId(currentId) || isDataNodeId(currentId)) {
        onActivate(currentId)
      } else {
        document.activeElement?.click()
      }
    } else if (e.key === 'Escape') {
      if (clipboard) {
        e.preventDefault()
        e.stopImmediatePropagation()
        setClipboard(null)
        setPasteSlot('in')
      } else if (paneId != null || focusedId != null) {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        onBack?.()
      }
    } else if (e.key === 'F2') {
      e.preventDefault()
      if (currentId && isDataNodeId(currentId)) handleStartRename(currentId)
    } else if (e.key === 'Home') {
      e.preventDefault()
      if (buttons[0]) { buttons[0].focus(); if (buttons[0].dataset.nodeId) onSelect(buttons[0].dataset.nodeId) }
    } else if (e.key === 'End') {
      e.preventDefault()
      const last = buttons[buttons.length - 1]
      if (last) { last.focus(); if (last.dataset.nodeId && !last.dataset.nodeId.includes(':')) onSelect(last.dataset.nodeId) }
    }
  }, [treeRef, tree, expanded, onSelect, onActivate, onBack, paneId, focusedId, handleToggle, handleStartRename, handleCut, handleCopy, handlePaste, handleDelete, clipboard, pasteSlot, confirmDelete, confirmDeleteAction, cancelDelete, setPasteSlot, setClipboard])

  // Register capture-phase handler on window
  useEffect(() => {
    const handler = (e) => {
      if (!treeRef.current?.contains(document.activeElement)) return
      handleKeyDown(e)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [handleKeyDown, treeRef])
}
