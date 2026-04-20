import { useMemo, useState, useCallback, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import {
  toWorld, FOCUS_DISTANCE, PANE_DISTANCE, SYSTEM_VIEW_DISTANCE, TREE_VIEW_ZOOM,
  CAMERA_INITIAL, CAMERA_LOOK_INITIAL, CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR,
  TRANSITION, Z_INDEX, getNodeCenterY, getSystemPanePosition,
} from './constants'
import { createModel, addNode, canAddManagement, canAddOperation, findNode, buildRenderTree, getTreeBounds } from './tree'
import { CameraController } from './components/CameraController'
import { MetaTree } from './components/MetaTree'
import { ContextMenu, BackButton } from './components/UI'
import { HUD } from './components/HUD'
import { SystemPage } from './components/SystemPage'

function App() {
  const [model, setModel] = useState(() => createModel('management'))
  const [menu, setMenu] = useState(null)
  const [focusedId, setFocusedId] = useState(null)
  const [paneId, setPaneId] = useState(null)
  const [hoveredId, setHoveredId] = useState(null)
  const [cameraTarget, setCameraTarget] = useState(null)
  const controlsRef = useRef()

  // System page state
  const [systemView, setSystemView] = useState(null)
  const [transitioning, setTransitioning] = useState(false)
  const [canvasOpacity, setCanvasOpacity] = useState(1)
  const [systemPageOpacity, setSystemPageOpacity] = useState(0)

  // Derive render tree from model
  const tree = useMemo(() => buildRenderTree(model), [model])

  const highlightId = focusedId ?? hoveredId
  const activeId = hoveredId ?? focusedId
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

  const handleSystemClick = useCallback((nodeId, systemKey) => {
    if (transitioning) return
    const node = findNode(tree, nodeId)
    if (!node) return

    const pos = getSystemPanePosition(node, systemKey)
    setCameraTarget({
      position: [pos[0], pos[1] + SYSTEM_VIEW_DISTANCE, pos[2]],
      lookAt: pos, up: [0, 0, -1],
    })

    setTransitioning(true)
    setSystemView({ nodeId, systemKey })
    setSystemPageOpacity(0)

    setTimeout(() => {
      setCanvasOpacity(0)
      setSystemPageOpacity(1)
    }, TRANSITION.zoomIn)
    setTimeout(() => {
      setTransitioning(false)
    }, TRANSITION.fadeComplete)
  }, [tree, transitioning])

  const handleSystemBack = useCallback(() => {
    const { nodeId, systemKey } = systemView
    const node = findNode(tree, nodeId)
    if (!node) return

    const pos = getSystemPanePosition(node, systemKey)
    setCameraTarget({
      position: [pos[0], pos[1] + SYSTEM_VIEW_DISTANCE, pos[2]],
      lookAt: pos, up: [0, 0, -1], instant: true,
    })

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
  }, [systemView, tree])

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

  return (
    <div style={{ width: '100vw', height: '100vh' }} onContextMenu={(e) => e.preventDefault()}>
      <div style={{
        position: 'absolute', inset: 0,
        opacity: canvasOpacity,
        transition: `opacity ${TRANSITION.cssDuration} ease`,
      }}>
        <Canvas camera={{ fov: CAMERA_FOV, near: CAMERA_NEAR, far: CAMERA_FAR, position: CAMERA_INITIAL }}>
          <CameraController target={cameraTarget} controlsRef={controlsRef} />
          <OrbitControls ref={controlsRef} target={CAMERA_LOOK_INITIAL} enabled={!transitioning && focusedId == null && paneId == null} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[2, 3, 4]} />
          <MetaTree node={tree} onContextMenu={handleContextMenu} onDoubleClick={handleDoubleClick} onSystemClick={handleSystemClick} onHover={menu ? () => {} : setHoveredId} highlightId={highlightId} paneId={paneId} connectionStyle="elbow" />
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

      {!transitioning && !systemView && (
        <>
          <HUD node={activeNode} mode={hudMode} />
          {(focusedId != null || paneId != null) && <BackButton onClick={handleBack} />}
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
