import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import {
  toWorld, FOCUS_DISTANCE, PANE_DISTANCE, SYSTEM_VIEW_DISTANCE, TREE_VIEW_ZOOM,
  CAMERA_INITIAL, CAMERA_LOOK_INITIAL, CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR,
  TRANSITION, Z_INDEX, getNodeCenterY, getSystemPanePosition,
} from './constants'
import { createModel, addNode, canAddManagement, canAddOperation, findNode, buildRenderTree, getTreeBounds, nodeHasS2 } from './tree/index'
import { CameraController } from './components/CameraController'
import { MetaTree } from './components/MetaTree'
import { ContextMenu } from './components/UI'
import { HUD } from './components/HUD'
import { SystemPage } from './components/SystemPage'
import { TabSystem } from './components/TabSystem'
import { useAccessibility } from './accessibility'

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
  const [cameraTarget, setCameraTarget] = useState(null)
  const controlsRef = useRef()

  // System page state
  const [systemView, setSystemView] = useState(null)
  const [transitioning, setTransitioning] = useState(false)
  const [canvasOpacity, setCanvasOpacity] = useState(1)
  const [systemPageOpacity, setSystemPageOpacity] = useState(0)

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

  // Derive render tree from model
  const tree = useMemo(() => buildRenderTree(model), [model])

  // Build explorer tree with system children
  const explorerTree = useMemo(() => {
    function enrich(node) {
      const isOp = node.type === 'operation'
      const systemChildren = isOp
        ? [{ id: `${node.id}:s1`, type: 'system', systemKey: 's1', parentNodeId: node.id, children: [] }]
        : [
            { id: `${node.id}:s5`, type: 'system', systemKey: 's5', parentNodeId: node.id, children: [] },
            { id: `${node.id}:s4`, type: 'system', systemKey: 's4', parentNodeId: node.id, children: [] },
            { id: `${node.id}:s3`, type: 'system', systemKey: 's3', parentNodeId: node.id, children: [] },
            ...(nodeHasS2(node) ? [{ id: `${node.id}:s2`, type: 'system', systemKey: 's2', parentNodeId: node.id, children: [] }] : []),
          ]
      return {
        ...node,
        children: [...systemChildren, ...node.children.map(enrich)],
      }
    }
    return enrich(tree)
  }, [tree])

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
    setModel((prev) => addNode(prev, menu.nodeId, nodeType))
    setMenu(null)
    setHoveredId(null)
  }, [menu])

  const handleAddChild = useCallback(() => addNodeOfType('management'), [addNodeOfType])
  const handleAddOperation = useCallback(() => addNodeOfType('operation'), [addNodeOfType])

  const handleCloseMenu = useCallback(() => {
    setMenu(null)
    setHoveredId(null)
  }, [])

  const handleDoubleClick = useCallback((nodeId) => {
    const node = findNode(tree, nodeId)
    if (!node) return
    const center = toWorld(node.x, getNodeCenterY(node), node.layer)

    if (focusedId === nodeId && paneId == null) {
      setCameraTarget({
        position: [center[0], center[1] + PANE_DISTANCE, center[2]],
        lookAt: center, up: [0, 0, -1],
      })
      setPaneId(nodeId)
    } else {
      setCameraTarget({
        position: [center[0] + FOCUS_DISTANCE, center[1] + FOCUS_DISTANCE, center[2] + FOCUS_DISTANCE],
        lookAt: center, up: [0, 1, 0],
      })
      setFocusedId(nodeId)
      setPaneId(null)
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
    setFocusedId(nodeId)
    setPaneId(nodeId)
    setKeySelectedId(null)
    setKeySelectedSystem(null)
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
    } else {
      setFocusedId(null)
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

  // Clear keyboard selection when mouse takes over
  const handleMouseMove = useCallback(() => {
    if (keySelectedId) setKeySelectedId(null)
  }, [keySelectedId])

  return (
    <div style={{ width: '100vw', height: '100vh' }} onContextMenu={(e) => e.preventDefault()} onMouseMove={handleMouseMove}>
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
          Interactive 3D viable system model.
          Press any arrow key to open the Explorer tree panel for keyboard navigation.
          In the Explorer: arrow keys navigate, Enter activates, M opens context menu.
          Double-click a unit to focus, right-click for actions, double-click empty to go back.
          S: Settings. E: Explorer. T: Tools. F: Filter. Escape: close panel.
        </p>
        <div role="status" aria-live="polite" className="sr-only">
          {activeNode
            ? `${activeNode.type === 'operation' ? 'Operation' : 'Unit'} ${activeNode.id?.slice(0, 5)}, layer ${activeNode.layer}, ${activeNode.children.length} children. ${focusedId != null ? 'Focused.' : ''} ${paneId != null ? 'Detail view. Use arrows to select system, Enter to open.' : ''}`
            : ''}
        </div>
        <Canvas camera={{ fov: CAMERA_FOV, near: CAMERA_NEAR, far: CAMERA_FAR, position: CAMERA_INITIAL }} onPointerMissed={(e) => {
          if (e.detail === 2 && (focusedId != null || paneId != null)) handleBack()
        }}>
          <CameraController target={cameraTarget} controlsRef={controlsRef} />
          <OrbitControls ref={controlsRef} target={CAMERA_LOOK_INITIAL} enabled={!transitioning && focusedId == null && paneId == null} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[2, 3, 4]} />
          <MetaTree node={tree} onContextMenu={handleContextMenu} onDoubleClick={handleDoubleClick} onSystemClick={handleSystemClick} onHover={menu ? () => {} : setHoveredId} highlightId={highlightId} keySelectedId={keySelectedId} keySelectedSystem={keySelectedSystem} paneId={paneId} connectionStyle="elbow" />
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
            // Node selected — enter focus mode
            const node = findNode(tree, id)
            if (!node) return
            const center = toWorld(node.x, getNodeCenterY(node), node.layer)
            // If we were in pane mode on a different node, exit it
            if (paneId != null && paneId !== id) setPaneId(null)
            if (focusedId !== id) {
              setCameraTarget({
                position: [center[0] + FOCUS_DISTANCE, center[1] + FOCUS_DISTANCE, center[2] + FOCUS_DISTANCE],
                lookAt: center, up: [0, 1, 0],
              })
              setFocusedId(id)
            }
            setKeySelectedId(id)
            setKeySelectedSystem(null)
            setHoveredId(id)
          }
        }}
        onNodeContextMenu={(nodeId, x, y) => {
          setHoveredId(nodeId)
          setMenu({ nodeId, x, y })
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

      {!transitioning && !systemView && (
        <>
          <HUD node={activeNode} mode={hudMode} onBack={handleBack} />
          {menu && (
            <ContextMenu
              x={menu.x} y={menu.y}
              onAddChild={canAddManagement(model, menu.nodeId) ? handleAddChild : null}
              onAddOperation={canAddOperation(model, menu.nodeId) ? handleAddOperation : null}
              onClose={handleCloseMenu}
            />
          )}
        </>
      )}
    </div>
  )
}

export default App
