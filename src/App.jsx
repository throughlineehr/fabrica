import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import {
  toWorld, FOCUS_DISTANCE, PANE_DISTANCE, SYSTEM_VIEW_DISTANCE, TREE_VIEW_ZOOM,
  CAMERA_INITIAL, CAMERA_LOOK_INITIAL, CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR,
  TRANSITION, Z_INDEX, getNodeCenterY, getSystemPanePosition,
} from './constants'
import { createModel, addNode, renameNode, canAddManagement, canAddOperation, findNode, buildRenderTree, getTreeBounds, nodeHasS2 } from './tree/index'
import { CameraController } from './components/CameraController'
import { MetaTree } from './components/MetaTree'
import { ContextMenu } from './components/UI'
import { HUD } from './components/HUD'
import { SystemPage } from './components/SystemPage'
import { TabSystem } from './components/TabSystem'
import { color } from './styles'
import { useAccessibility } from './accessibility'
import { createAgentAPI } from './agent/commands'

function App() {
  const { epilepsy } = useAccessibility()
  const [model, setModel] = useState(() => createModel('management'))
  const [menu, setMenu] = useState(null)
  const [focusedId, setFocusedId] = useState(null)
  const [paneId, setPaneId] = useState(null)
  const [hoveredId, setHoveredId] = useState(null)
  const [keySelectedId, setKeySelectedId] = useState(null)
  const [keySelectedSystem, setKeySelectedSystem] = useState(null)
  const [explorerRequested, setExplorerRequested] = useState(false)
  const [visibleSystems, setVisibleSystems] = useState({ s5: true, s4: true, s3: true, s2: true, s1: true, frame: true })
  const [cameraTarget, setCameraTarget] = useState(null)
  const [announcement, setAnnouncement] = useState('')
  const controlsRef = useRef()

  // System page state
  const [systemView, setSystemView] = useState(null)
  const [transitioning, setTransitioning] = useState(false)
  const [canvasOpacity, setCanvasOpacity] = useState(1)
  const [systemPageOpacity, setSystemPageOpacity] = useState(0)

  // Derive render tree from model
  const tree = useMemo(() => buildRenderTree(model), [model])

  // Build explorer tree with system children
  const explorerTree = useMemo(() => {
    function enrich(node) {
      const isOp = node.type === 'operation'
      const allSystems = isOp
        ? [{ id: `${node.id}:s1`, type: 'system', systemKey: 's1', parentNodeId: node.id, children: [] }]
        : [
            { id: `${node.id}:s5`, type: 'system', systemKey: 's5', parentNodeId: node.id, children: [] },
            { id: `${node.id}:s4`, type: 'system', systemKey: 's4', parentNodeId: node.id, children: [] },
            { id: `${node.id}:s3`, type: 'system', systemKey: 's3', parentNodeId: node.id, children: [] },
            ...(nodeHasS2(node) ? [{ id: `${node.id}:s2`, type: 'system', systemKey: 's2', parentNodeId: node.id, children: [] }] : []),
          ]
      const systemChildren = allSystems.filter(s => visibleSystems[s.systemKey] !== false)

      // Build action children
      const actionItems = []
      // Rename available on all nodes
      actionItems.push({ id: `${node.id}:rename`, type: 'action', actionType: 'rename', parentNodeId: node.id, children: [] })
      if (!isOp) {
        if (canAddManagement(model, node.id)) actionItems.push({ id: `${node.id}:add-management`, type: 'action', actionType: 'management', parentNodeId: node.id, children: [] })
        if (canAddOperation(model, node.id)) actionItems.push({ id: `${node.id}:add-operation`, type: 'action', actionType: 'operation', parentNodeId: node.id, children: [] })
      }
      const actionChildren = [{
        id: `${node.id}:actions`,
        type: 'actions-group',
        parentNodeId: node.id,
        children: actionItems,
      }]

      return {
        ...node,
        children: [...actionChildren, ...systemChildren, ...node.children.map(enrich)],
      }
    }
    return enrich(tree)
  }, [tree, model, visibleSystems])

  // Unified selection for explorer sync
  const explorerSelectedId = useMemo(() => {
    if (paneId != null && keySelectedSystem) return `${paneId}:${keySelectedSystem}`
    if (systemView) return `${systemView.nodeId}:${systemView.systemKey}`
    return keySelectedId ?? focusedId ?? hoveredId ?? null
  }, [paneId, keySelectedSystem, systemView, keySelectedId, focusedId, hoveredId])

  const highlightId = focusedId ?? keySelectedId ?? hoveredId
  const activeId = keySelectedId ?? hoveredId ?? focusedId
  const activeNode = activeId != null ? findNode(tree, activeId) : null
  const hudMode = paneId != null ? 'pane' : focusedId != null ? 'focused' : hoveredId != null ? 'hovered' : 'default'

  const handleContextMenu = useCallback((nodeId, event) => {
    event.nativeEvent?.preventDefault?.()
    setHoveredId(nodeId)
    setMenu({
      nodeId,
      x: event.nativeEvent?.clientX ?? event.clientX,
      y: event.nativeEvent?.clientY ?? event.clientY,
    })
  }, [])

  const addNodeOfType = useCallback((nodeType) => {
    const parentId = menu.nodeId
    setModel((prev) => addNode(prev, parentId, nodeType))
    setMenu(null)
    setHoveredId(parentId)
    setKeySelectedId(parentId)
    setAnnouncement(`${nodeType === 'management' ? 'Management unit' : 'Operation'} added`)
    requestAnimationFrame(() => {
      const btn = document.querySelector(`[role="tree"] button[data-node-id="${parentId}"]`)
      btn?.focus()
    })
  }, [menu])

  const handleAddChild = useCallback(() => addNodeOfType('management'), [addNodeOfType])
  const handleAddOperation = useCallback(() => addNodeOfType('operation'), [addNodeOfType])

  const handleCloseMenu = useCallback(() => {
    const nodeId = menu?.nodeId
    setMenu(null)
    setHoveredId(null)
    // Refocus Explorer tree if it's open
    if (nodeId) {
      requestAnimationFrame(() => {
        const btn = document.querySelector(`[role="tree"] button[data-node-id="${nodeId}"]`)
        btn?.focus()
      })
    }
  }, [menu])

  const handleDoubleClick = useCallback((nodeId) => {
    const node = findNode(tree, nodeId)
    if (!node) return
    const center = toWorld(node.x, getNodeCenterY(node), node.layer)

    const label = node.type === 'operation' ? 'Operation' : 'Unit'
    const short = node.id.slice(0, 5)
    if (focusedId === nodeId && paneId == null) {
      setCameraTarget({
        position: [center[0], center[1] + PANE_DISTANCE, center[2]],
        lookAt: center, up: [0, 0, -1],
      })
      setPaneId(nodeId)
      setAnnouncement(`Detail view: ${label} ${short}. Enter on a system to open it.`)
    } else {
      setCameraTarget({
        position: [center[0] + FOCUS_DISTANCE, center[1] + FOCUS_DISTANCE, center[2] + FOCUS_DISTANCE],
        lookAt: center, up: [0, 1, 0],
      })
      setFocusedId(nodeId)
      setPaneId(null)
      setAnnouncement(`Focused: ${label} ${short}`)
    }
  }, [tree, focusedId, paneId])

  // Direct navigation from Explorer — skip intermediate states
  const navigateToPane = useCallback((nodeId) => {
    const node = findNode(tree, nodeId)
    if (!node) return
    const center = toWorld(node.x, getNodeCenterY(node), node.layer)
    setCameraTarget({
      position: [center[0], center[1] + PANE_DISTANCE, center[2]],
      lookAt: center, up: [0, 0, -1],
    })
    const label = node.type === 'operation' ? 'Operation' : 'Unit'
    setFocusedId(nodeId)
    setPaneId(nodeId)
    setKeySelectedId(null)
    setKeySelectedSystem(null)
    setAnnouncement(`Detail view: ${label} ${node.id.slice(0, 5)}`)
  }, [tree])

  const handleSystemClick = useCallback((nodeId, systemKey) => {
    if (transitioning) return
    const node = findNode(tree, nodeId)
    if (!node) return

    const pos = getSystemPanePosition(node, systemKey)
    setCameraTarget({
      position: [pos[0], pos[1] + SYSTEM_VIEW_DISTANCE, pos[2]],
      lookAt: pos, up: [0, 0, -1],
    })

    setSystemView({ nodeId, systemKey })
    setAnnouncement(`Opened ${systemKey.toUpperCase()} configuration`)

    if (epilepsy) {
      setCanvasOpacity(0)
      setSystemPageOpacity(1)
    } else {
      setTransitioning(true)
      setSystemPageOpacity(0)
      setTimeout(() => {
        setCanvasOpacity(0)
        setSystemPageOpacity(1)
      }, TRANSITION.zoomIn)
      setTimeout(() => {
        setTransitioning(false)
      }, TRANSITION.fadeComplete)
    }
  }, [tree, transitioning, epilepsy])

  // Direct jump from Explorer to a system page
  const navigateToSystem = useCallback((nodeId, systemKey) => {
    const node = findNode(tree, nodeId)
    if (!node) return
    const center = toWorld(node.x, getNodeCenterY(node), node.layer)
    setCameraTarget({
      position: [center[0], center[1] + PANE_DISTANCE, center[2]],
      lookAt: center, up: [0, 0, -1],
    })
    setFocusedId(nodeId)
    setPaneId(nodeId)
    setKeySelectedId(null)
    setKeySelectedSystem(null)
    // Enter system after pane state is set
    setTimeout(() => handleSystemClick(nodeId, systemKey), 50)
  }, [tree, handleSystemClick])

  const handleSystemBack = useCallback(() => {
    const { nodeId, systemKey } = systemView
    const node = findNode(tree, nodeId)
    if (!node) return

    const pos = getSystemPanePosition(node, systemKey)
    setCameraTarget({
      position: [pos[0], pos[1] + SYSTEM_VIEW_DISTANCE, pos[2]],
      lookAt: pos, up: [0, 0, -1], instant: true,
    })

    if (epilepsy) {
      setCanvasOpacity(1)
      setSystemPageOpacity(0)
      setSystemView(null)
      const center = toWorld(node.x, getNodeCenterY(node), node.layer)
      setCameraTarget({
        position: [center[0], center[1] + PANE_DISTANCE, center[2]],
        lookAt: center, up: [0, 0, -1], instant: true,
      })
    } else {
      setTransitioning(true)
      setCanvasOpacity(1)

      requestAnimationFrame(() => {
        setSystemPageOpacity(0)

        setTimeout(() => {
          setSystemView(null)
          const center = toWorld(node.x, getNodeCenterY(node), node.layer)
          setCameraTarget({
            position: [center[0], center[1] + PANE_DISTANCE, center[2]],
            lookAt: center, up: [0, 0, -1],
          })
          setTimeout(() => setTransitioning(false), TRANSITION.fadeBack)
        }, TRANSITION.fadeBack)
      })
    }
  }, [systemView, tree, epilepsy])

  const handleBack = useCallback(() => {
    if (paneId != null) {
      const node = findNode(tree, paneId)
      if (node) {
        const center = toWorld(node.x, getNodeCenterY(node), node.layer)
        setCameraTarget({
          position: [center[0] + FOCUS_DISTANCE, center[1] + FOCUS_DISTANCE, center[2] + FOCUS_DISTANCE],
          lookAt: center, up: [0, 1, 0],
        })
      }
      setPaneId(null)
      setAnnouncement('Returned to focus view')
    } else {
      setFocusedId(null)
      setAnnouncement('Returned to overview')
      const bounds = getTreeBounds(tree)
      const cx = (bounds.minX + bounds.maxX) / 2
      const cy = (bounds.minY + bounds.maxY) / 2
      const cz = (bounds.minZ + bounds.maxZ) / 2
      const maxSpan = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, bounds.maxZ - bounds.minZ, 4)
      const dist = maxSpan * TREE_VIEW_ZOOM
      setCameraTarget({
        position: [cx + dist, cy + dist, cz + dist],
        lookAt: [cx, cy, cz], up: [0, 1, 0],
      })
    }
  }, [tree, paneId])

  // Global keyboard: arrow keys open Explorer, Escape backs out when no panel is open
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.target.closest('[role="tree"], [role="menu"]')) return
      if (transitioning || systemView) return

      if (e.key === 'Escape' && (focusedId != null || paneId != null)) {
        e.preventDefault()
        handleBack()
        return
      }

      const isArrow = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
      if (isArrow) {
        e.preventDefault()
        setExplorerRequested(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [transitioning, systemView, focusedId, paneId, handleBack])

  // Agent API — uses refs to access live state
  const modelRef = useRef(model)
  modelRef.current = model
  const navStateRef = useRef({})
  navStateRef.current = { focusedId, paneId, systemView }

  const agentAPI = useMemo(() => createAgentAPI({
    getModel: () => modelRef.current,
    setModel,
    getNavState: () => navStateRef.current,
    navigate: {
      overview: handleBack, // repeated until overview
      focus: (nodeId) => { handleDoubleClick(nodeId) },
      detail: (nodeId) => { navigateToPane(nodeId) },
      openSystem: (nodeId, systemKey) => { navigateToSystem(nodeId, systemKey) },
      back: handleBack,
    },
    panels: {
      open: (key) => setExplorerRequested(key === 'E'),
      close: () => {},
    },
    filters: {
      set: (key, visible) => setVisibleSystems(prev => ({ ...prev, [key]: visible })),
    },
    announce: setAnnouncement,
  }), [handleBack, handleDoubleClick, navigateToPane, navigateToSystem])

  // Clear keyboard selection when mouse takes over
  const handleMouseMove = useCallback(() => {
    if (keySelectedId) setKeySelectedId(null)
  }, [keySelectedId])

  return (
    <div style={{ width: '100vw', height: '100vh' }} onContextMenu={(e) => e.preventDefault()} onMouseMove={handleMouseMove}>
      <a href="#main-content" className="sr-only" style={{ position: 'absolute', zIndex: 9999 }} onFocus={(e) => { e.target.style.position = 'fixed'; e.target.style.top = '8px'; e.target.style.left = '8px'; e.target.style.width = 'auto'; e.target.style.height = 'auto'; e.target.style.clip = 'auto'; e.target.style.padding = '8px 16px'; e.target.style.background = color.white; e.target.style.border = `2px solid ${color.focus}`; e.target.style.borderRadius = '4px'; }} onBlur={(e) => { e.target.style.position = 'absolute'; e.target.style.width = '1px'; e.target.style.height = '1px'; e.target.style.clip = 'rect(0,0,0,0)'; }}>Skip to main content</a>
      <div
        role="application"
        aria-label="3D viable system model"
        aria-describedby="canvas-instructions"
        tabIndex={0}
        style={{
          position: 'absolute', inset: 0,
          opacity: canvasOpacity,
          transition: `opacity ${TRANSITION.cssDuration} ease`,
        }}
      >
        <p id="canvas-instructions" className="sr-only">
          Fabrica viable system model. Press E to open the Explorer tree for keyboard navigation.
        </p>
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {announcement}
        </div>
        <Canvas camera={{ fov: CAMERA_FOV, near: CAMERA_NEAR, far: CAMERA_FAR, position: CAMERA_INITIAL }} onPointerMissed={(e) => {
          if (e.detail === 2 && (focusedId != null || paneId != null)) handleBack()
        }}>
          <CameraController target={cameraTarget} controlsRef={controlsRef} />
          <OrbitControls ref={controlsRef} target={CAMERA_LOOK_INITIAL} enabled={!transitioning && focusedId == null && paneId == null} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[2, 3, 4]} />
          <MetaTree node={tree} onContextMenu={handleContextMenu} onDoubleClick={handleDoubleClick} onSystemClick={handleSystemClick} onHover={menu ? () => {} : setHoveredId} highlightId={highlightId} keySelectedId={keySelectedId} keySelectedSystem={keySelectedSystem} paneId={paneId} connectionStyle="elbow" visibleSystems={visibleSystems} />
        </Canvas>
      </div>

      {systemView && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: Z_INDEX.systemPage,
          opacity: systemPageOpacity,
          transition: `opacity ${TRANSITION.cssDuration} ease`,
          pointerEvents: systemPageOpacity > 0 ? 'auto' : 'none',
        }}>
          <SystemPage nodeId={systemView.nodeId} systemKey={systemView.systemKey} onBack={handleSystemBack} />
        </div>
      )}

      <TabSystem
        visible={!transitioning && !systemView}
        tree={explorerTree}
        selectedId={explorerSelectedId}
        paneId={paneId}
        focusedId={focusedId}
        onBack={handleBack}
        onAnnounce={setAnnouncement}
        visibleSystems={visibleSystems}
        onToggleSystem={(key) => setVisibleSystems(prev => ({ ...prev, [key]: !prev[key] }))}
        agentAPI={agentAPI}
        onExplorerClose={() => { setKeySelectedId(null); setHoveredId(null) }}
        requestOpenExplorer={explorerRequested}
        onNodeSelect={(id) => {
          if (id.includes(':')) {
            // System selected — enter pane/detail mode on parent, highlight system
            const [nodeId, sysKey] = id.split(':')
            const node = findNode(tree, nodeId)
            if (!node) return
            const center = toWorld(node.x, getNodeCenterY(node), node.layer)
            // Enter pane mode if not already there for this node
            if (paneId !== nodeId) {
              setCameraTarget({
                position: [center[0], center[1] + PANE_DISTANCE, center[2]],
                lookAt: center, up: [0, 0, -1],
              })
              setFocusedId(nodeId)
              setPaneId(nodeId)
            }
            setKeySelectedId(nodeId)
            setKeySelectedSystem(sysKey)
            setHoveredId(nodeId)
          } else {
            // Node selected — enter focus mode, exit pane if we were in it
            const node = findNode(tree, id)
            if (!node) return
            const center = toWorld(node.x, getNodeCenterY(node), node.layer)
            if (paneId != null) {
              setPaneId(null)
              setCameraTarget({
                position: [center[0] + FOCUS_DISTANCE, center[1] + FOCUS_DISTANCE, center[2] + FOCUS_DISTANCE],
                lookAt: center, up: [0, 1, 0],
              })
              setAnnouncement('Returned to focus view')
            } else if (focusedId !== id) {
              setCameraTarget({
                position: [center[0] + FOCUS_DISTANCE, center[1] + FOCUS_DISTANCE, center[2] + FOCUS_DISTANCE],
                lookAt: center, up: [0, 1, 0],
              })
            }
            setFocusedId(id)
            setKeySelectedId(id)
            setKeySelectedSystem(null)
            setHoveredId(id)
          }
        }}
        onRenameNode={(nodeId, name) => {
          setModel(prev => renameNode(prev, nodeId, name))
          setAnnouncement(name ? `Renamed to ${name}` : 'Name cleared')
        }}
        onAddNode={(nodeId, nodeType) => {
          setModel((prev) => {
            const next = addNode(prev, nodeId, nodeType)
            // Check if same action is still valid after adding
            const actionId = `${nodeId}:add-${nodeType}`
            const stillValid = nodeType === 'management'
              ? canAddManagement(next, nodeId)
              : canAddOperation(next, nodeId)

            // Stay in focus mode so tree is visible
            const node = findNode(tree, nodeId)
            if (node) {
              const center = toWorld(node.x, getNodeCenterY(node), node.layer)
              setCameraTarget({
                position: [center[0] + FOCUS_DISTANCE, center[1] + FOCUS_DISTANCE, center[2] + FOCUS_DISTANCE],
                lookAt: center, up: [0, 1, 0],
              })
              setFocusedId(nodeId)
              setPaneId(null)
            }
            setKeySelectedId(nodeId)
            setHoveredId(nodeId)
            setAnnouncement(`${nodeType === 'management' ? 'Management unit' : 'Operation'} added`)

            // Refocus: stay on action if still valid, otherwise go to parent
            requestAnimationFrame(() => {
              if (stillValid) {
                const actionBtn = document.querySelector(`[role="tree"] button[data-node-id="${actionId}"]`)
                if (actionBtn) { actionBtn.focus(); return }
              }
              const parentBtn = document.querySelector(`[role="tree"] button[data-node-id="${nodeId}"]`)
              parentBtn?.focus()
            })

            return next
          })
        }}
        onNodeActivate={(id) => {
          if (id.includes(':')) {
            // Enter on a system — open the system page
            const [nodeId, sysKey] = id.split(':')
            // Ensure we're in pane mode first, then enter system
            if (paneId === nodeId) {
              handleSystemClick(nodeId, sysKey)
            } else {
              navigateToSystem(nodeId, sysKey)
            }
          } else {
            // Enter on a node — if already focused, go to pane; if in pane, no-op
            if (paneId === id) return
            if (focusedId === id) {
              navigateToPane(id)
            } else {
              // Just focus it (selection already did this)
            }
          }
        }}
      />

      <div id="main-content">
        {!transitioning && !systemView && (
          <HUD node={activeNode} mode={hudMode} onBack={handleBack} onRename={(nodeId, name) => {
            setModel(prev => renameNode(prev, nodeId, name))
            setAnnouncement(name ? `Renamed to ${name}` : 'Name cleared')
          }} />
        )}
      </div>

      {/* Context menu rendered at top level for z-index reliability */}
      {menu && (
        <ContextMenu
          x={menu.x} y={menu.y}
          onAddChild={canAddManagement(model, menu.nodeId) ? handleAddChild : null}
          onAddOperation={canAddOperation(model, menu.nodeId) ? handleAddOperation : null}
          onClose={handleCloseMenu}
        />
      )}
    </div>
  )
}

export default App
