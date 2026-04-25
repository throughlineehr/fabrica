import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { useRef } from 'react'
import { useTreeKeyboard, isDataNodeId, isSystemNodeId, isSelectableId, selectableParentId } from '../hooks/useTreeKeyboard'

// Lightweight harness: mounts a flat list of buttons with data-node-id
// and wires the hook. Lets us simulate keyboard events at the window
// level (where the hook listens) and observe callbacks fire.

function Harness({ nodes, callbacks, state }) {
  const treeRef = useRef(null)
  useTreeKeyboard({
    treeRef,
    tree: state.tree,
    expanded: state.expanded || {},
    clipboard: state.clipboard || null,
    pasteSlot: state.pasteSlot || null,
    confirmDelete: state.confirmDelete || null,
    paneId: state.paneId || null,
    focusedId: state.focusedId || null,
    onSelect: callbacks.onSelect || (() => {}),
    onActivate: callbacks.onActivate || (() => {}),
    onBack: callbacks.onBack || (() => {}),
    handleToggle: callbacks.handleToggle || (() => {}),
    handleStartRename: callbacks.handleStartRename || (() => {}),
    handleCut: callbacks.handleCut || (() => {}),
    handleCopy: callbacks.handleCopy || (() => {}),
    handlePaste: callbacks.handlePaste || (() => {}),
    handleDelete: callbacks.handleDelete || (() => {}),
    setPasteSlot: callbacks.setPasteSlot || (() => {}),
    setClipboard: callbacks.setClipboard || (() => {}),
    confirmDeleteAction: callbacks.confirmDeleteAction || (() => {}),
    cancelDelete: callbacks.cancelDelete || (() => {}),
  })
  return (
    <div ref={treeRef}>
      {nodes.map(n => (
        <button key={n.id} data-node-id={n.id}>{n.id}</button>
      ))}
    </div>
  )
}

function dispatchKey(opts) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...opts })
  window.dispatchEvent(event)
  return event
}

describe('id classification helpers', () => {
  it('isDataNodeId — uuids without colons are data nodes', () => {
    expect(isDataNodeId('abc-123')).toBe(true)
    expect(isDataNodeId('abc-123:s5')).toBe(false)
    expect(isDataNodeId('')).toBeFalsy()
  })

  it('isSystemNodeId — id ending in :s1..s5 is a system node', () => {
    expect(isSystemNodeId('abc:s1')).toBe(true)
    expect(isSystemNodeId('abc:s5')).toBe(true)
    expect(isSystemNodeId('abc:s9')).toBe(false)
    expect(isSystemNodeId('abc')).toBe(false)
  })

  it('isSelectableId — action/delete/etc. ids are not selectable', () => {
    expect(isSelectableId('abc-123')).toBe(true)
    expect(isSelectableId('abc-123:s5')).toBe(true)
    expect(isSelectableId('abc:add-management')).toBe(false)
    expect(isSelectableId('abc:rename')).toBe(false)
    expect(isSelectableId('abc:delete')).toBe(false)
  })

  it('selectableParentId strips system suffix', () => {
    expect(selectableParentId('abc-123:s5')).toBe('abc-123')
    expect(selectableParentId('abc-123')).toBe('abc-123')
  })
})

describe('useTreeKeyboard', () => {
  let nodes
  let callbacks
  let state

  beforeEach(() => {
    nodes = [
      { id: 'root' },
      { id: 'child-a' },
      { id: 'child-b' },
    ]
    callbacks = {
      onSelect: vi.fn(),
      onActivate: vi.fn(),
      onBack: vi.fn(),
      handleToggle: vi.fn(),
      handleStartRename: vi.fn(),
      handleCut: vi.fn(),
      handleCopy: vi.fn(),
      handlePaste: vi.fn(),
      handleDelete: vi.fn(),
      setPasteSlot: vi.fn(),
      setClipboard: vi.fn(),
      confirmDeleteAction: vi.fn(),
      cancelDelete: vi.fn(),
    }
    state = {
      tree: { id: 'root', children: [
        { id: 'child-a', children: [] },
        { id: 'child-b', children: [] },
      ] },
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('Delete confirmation: Enter triggers confirmDeleteAction', () => {
    state.confirmDelete = 'child-a'
    render(<Harness nodes={nodes} callbacks={callbacks} state={state} />)
    document.querySelector('[data-node-id="child-a"]').focus()
    dispatchKey({ key: 'Enter' })
    expect(callbacks.confirmDeleteAction).toHaveBeenCalled()
  })

  it('Delete confirmation: Escape cancels', () => {
    state.confirmDelete = 'child-a'
    render(<Harness nodes={nodes} callbacks={callbacks} state={state} />)
    document.querySelector('[data-node-id="child-a"]').focus()
    dispatchKey({ key: 'Escape' })
    expect(callbacks.cancelDelete).toHaveBeenCalled()
  })

  it('Cmd/Ctrl+X invokes handleCut on the focused data node', () => {
    render(<Harness nodes={nodes} callbacks={callbacks} state={state} />)
    document.querySelector('[data-node-id="child-a"]').focus()
    dispatchKey({ code: 'KeyX', metaKey: true })
    expect(callbacks.handleCut).toHaveBeenCalled()
  })

  it('Cmd/Ctrl+C invokes handleCopy on the focused data node', () => {
    render(<Harness nodes={nodes} callbacks={callbacks} state={state} />)
    document.querySelector('[data-node-id="child-a"]').focus()
    dispatchKey({ code: 'KeyC', metaKey: true })
    expect(callbacks.handleCopy).toHaveBeenCalled()
  })

  it('Cmd/Ctrl+V invokes handlePaste when clipboard is set', () => {
    state.clipboard = { id: 'child-b', op: 'copy' }
    state.pasteSlot = { mode: 'in', targetId: 'child-a' }
    render(<Harness nodes={nodes} callbacks={callbacks} state={state} />)
    document.querySelector('[data-node-id="child-a"]').focus()
    dispatchKey({ code: 'KeyV', metaKey: true })
    expect(callbacks.handlePaste).toHaveBeenCalled()
  })

  it('Escape invokes onBack when in pane/focus mode', () => {
    state.focusedId = 'child-a'
    render(<Harness nodes={nodes} callbacks={callbacks} state={state} />)
    document.querySelector('[data-node-id="root"]').focus()
    dispatchKey({ key: 'Escape' })
    expect(callbacks.onBack).toHaveBeenCalled()
  })

  it('Escape is a no-op without clipboard, pane, or focus state', () => {
    // Three-tier escape priority: clipboard > pane/focus > nothing.
    render(<Harness nodes={nodes} callbacks={callbacks} state={state} />)
    document.querySelector('[data-node-id="root"]').focus()
    dispatchKey({ key: 'Escape' })
    expect(callbacks.onBack).not.toHaveBeenCalled()
    expect(callbacks.setClipboard).not.toHaveBeenCalled()
  })

  it('Escape clears clipboard before invoking onBack', () => {
    state.clipboard = { id: 'child-a', op: 'cut' }
    render(<Harness nodes={nodes} callbacks={callbacks} state={state} />)
    document.querySelector('[data-node-id="child-a"]').focus()
    dispatchKey({ key: 'Escape' })
    expect(callbacks.setClipboard).toHaveBeenCalledWith(null)
    expect(callbacks.onBack).not.toHaveBeenCalled()
  })

  it('F2 invokes handleStartRename on the focused data node', () => {
    render(<Harness nodes={nodes} callbacks={callbacks} state={state} />)
    document.querySelector('[data-node-id="child-a"]').focus()
    dispatchKey({ key: 'F2' })
    expect(callbacks.handleStartRename).toHaveBeenCalledWith('child-a')
  })
})
