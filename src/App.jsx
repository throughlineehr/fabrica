import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import {
  TREE_VIEW_ZOOM, CAMERA_INITIAL, CAMERA_LOOK_INITIAL, CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR,
  TRANSITION, Z_INDEX,
  focusTarget, paneTarget, systemTarget,
} from './constants'
import { createModel, canAddManagement, canAddOperation, canSplice, findNode, buildRenderTree, getTreeBounds, nodeHasS2 } from './tree/index'
import { CameraController } from './components/CameraController'
import { MetaTree } from './components/MetaTree'
import { ContextMenu } from './components/UI'
import { HUD } from './components/HUD'
import { SystemPage } from './components/SystemPage'
import { ProcessorPage } from './components/ProcessorPage'
import { TabSystem } from './components/TabSystem'
import { color } from './styles'
import { useAccessibility } from './accessibility'
import { useTranslation } from './i18n/index.jsx'
import { useAIConfig } from './agent/config.jsx'
import { callProvider } from './agent/providers'
import { createAgentAPI } from './agent/commands'
import { useBus } from './signals/BusContext.jsx'
import { getProcessorDef } from './signals/library'
import { computeRoomSubscriptions, enumerateRooms, roomKey as makeRoomKey } from './signals/topology'
import { wireTopology } from './signals/wiring'
import { defaultFilters } from './signals/filter' // used by runtime effect for instances without filters set
import { pruneCablesByRoom, pruneCablesByProcessor, pruneProcessorsByRoom } from './commands'
import { liveProcessorIdsByRoom } from './queries'

function App() {
  const { epilepsy, toggleEpilepsy, toggleDyslexia, toggleColorBlind, setFontVisibility } = useAccessibility()
  const { t: tr, setLang } = useTranslation()
  const { apiKey, provider, model: aiModel, endpoint: aiEndpoint, setApiKey, setProvider: setAIProvider, setModel: setAIModel, setEndpoint: setAIEndpoint } = useAIConfig()
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
  const [processorView, setProcessorView] = useState(null) // { nodeId, systemKey, instanceId }
  const [transitioning, setTransitioning] = useState(false)
  const [canvasOpacity, setCanvasOpacity] = useState(1)
  const [systemPageOpacity, setSystemPageOpacity] = useState(0)

  // Derive render tree from model
  const tree = useMemo(() => buildRenderTree(model), [model])
  const bus = useBus()

  // Processor instances keyed by "${nodeId}:${systemKey}".
  // Shape: { id, defId, config }
  const [processors, setProcessors] = useState({})

  // LLM hook for processors. Ref pattern so config changes don't restart
  // running processors — they read the latest config at call time.
  const aiConfigRef = useRef({ apiKey, provider, model: aiModel, endpoint: aiEndpoint })
  useEffect(() => {
    aiConfigRef.current = { apiKey, provider, model: aiModel, endpoint: aiEndpoint }
  }, [apiKey, provider, aiModel, aiEndpoint])
  const llm = useMemo(() => ({
    prompt: (messages) => callProvider({ ...aiConfigRef.current, messages }),
  }), [])

  // Compute channel topology from the tree (which rooms subscribe to which).
  const topology = useMemo(() => computeRoomSubscriptions(tree), [tree])

  // Wire the tree's subscriptions onto the bus. Tree changes → teardown + rewire.
  useEffect(() => {
    if (!bus) return
    return wireTopology(bus, topology)
  }, [bus, topology])

  // Cables — keyed by `${nodeId}:${systemKey}`. Lifted to App so the
  // Switchboard and Rack tabs stay perma-synced (one model, two views).
  // Each cable: { id, source: <descriptor>, target: <descriptor>, color }.
  const [cables, setCables] = useState({})

  // Prune processors AND cables whose room no longer exists in the tree
  // (node was deleted). Checked during render so the runtime effect below
  // sees the pruned state on the same pass. Cables are also pruned when
  // their endpoint processors disappear. Pure pruners live in src/commands/.
  const [prevTreeForPrune, setPrevTreeForPrune] = useState(tree)
  if (tree !== prevTreeForPrune) {
    setPrevTreeForPrune(tree)
    const liveRooms = new Set(enumerateRooms(tree).map(r => makeRoomKey(r.nodeId, r.systemKey)))
    setProcessors(prev => pruneProcessorsByRoom(prev, liveRooms).processors)
    setCables(prev => pruneCablesByRoom(prev, liveRooms).cables)
  }

  // Prune cables whose endpoint processors disappeared (processor removed
  // but room still exists).
  const [prevProcsForCablePrune, setPrevProcsForCablePrune] = useState(processors)
  if (processors !== prevProcsForCablePrune) {
    setPrevProcsForCablePrune(processors)
    setCables(prev => pruneCablesByProcessor(prev, liveProcessorIdsByRoom(processors)).cables)
  }

  // Start/stop running instances in sync with the processors state.
  // Rebuilds all on every change — simple and correct for small counts.
  useEffect(() => {
    if (!bus) return
    const running = []
    for (const [key, instances] of Object.entries(processors)) {
      const [nodeId, systemKey] = key.split(':')
      for (const inst of instances) {
        const def = getProcessorDef(inst.defId)
        if (!def) continue
        const handle = def.create(inst.config || def.defaultConfig || {}, {
          bus,
          instanceId: inst.id,
          roomNodeId: nodeId,
          roomSystemKey: systemKey,
          filters: inst.filters || defaultFilters(),
          llm,
        })
        handle.start()
        running.push(handle)
      }
    }
    return () => running.forEach(h => h.stop())
  }, [bus, processors, llm])

  // Processor CRUD flows through the agent API (agentAPI.addProcessor /
  // removeProcessor / updateProcessorFilters). See SystemPage render below.

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
      const isRoot = node.id === model.rootId
      const actionItems = []
      // Rename available on all nodes
      actionItems.push({ id: `${node.id}:rename`, type: 'action', actionType: 'rename', parentNodeId: node.id, children: [] })
      if (!isOp) {
        if (canAddManagement(model, node.id)) actionItems.push({ id: `${node.id}:add-management`, type: 'action', actionType: 'management', parentNodeId: node.id, children: [] })
        if (canAddOperation(model, node.id)) actionItems.push({ id: `${node.id}:add-operation`, type: 'action', actionType: 'operation', parentNodeId: node.id, children: [] })
      }
      // Duplicate available on non-root management nodes (operations are sole children, can't duplicate)
      if (!isRoot && !isOp) {
        actionItems.push({ id: `${node.id}:duplicate`, type: 'action', actionType: 'duplicate', parentNodeId: node.id, children: [] })
      }
      // Splice: only when promoting children won't create invalid structure
      if (canSplice(model, node.id)) {
        actionItems.push({ id: `${node.id}:splice`, type: 'action', actionType: 'splice', parentNodeId: node.id, children: [] })
      }
      // Delete available on non-root nodes
      if (!isRoot) {
        actionItems.push({ id: `${node.id}:delete`, type: 'action', actionType: 'delete', parentNodeId: node.id, children: [] })
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
    const label = node.type === 'operation' ? 'Operation' : 'Unit'
    const short = node.id.slice(0, 5)
    if (focusedId === nodeId && paneId == null) {
      setCameraTarget(paneTarget(node))
      setPaneId(nodeId)
      setAnnouncement(`Detail view: ${label} ${short}. Enter on a system to open it.`)
    } else {
      setCameraTarget(focusTarget(node))
      setFocusedId(nodeId)
      setPaneId(null)
      setAnnouncement(`Focused: ${label} ${short}`)
    }
  }, [tree, focusedId, paneId])

  // Direct navigation from Explorer — skip intermediate states
  const navigateToPane = useCallback((nodeId) => {
    const node = findNode(tree, nodeId)
    if (!node) return
    setCameraTarget(paneTarget(node))
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

    setCameraTarget(systemTarget(node, systemKey))

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
    setCameraTarget(paneTarget(node))
    setFocusedId(nodeId)
    setPaneId(nodeId)
    setKeySelectedId(null)
    setKeySelectedSystem(null)
    setTimeout(() => handleSystemClick(nodeId, systemKey), 50)
  }, [tree, handleSystemClick])

  const handleOpenProcessor = useCallback((nodeId, systemKey, instanceId) => {
    setProcessorView({ nodeId, systemKey, instanceId })
    setAnnouncement('Opened processor')
  }, [])

  const handleProcessorBack = useCallback(() => {
    setProcessorView(null)
    setAnnouncement('Returned to room')
  }, [])

  const handleSystemBack = useCallback(() => {
    const { nodeId, systemKey } = systemView
    const node = findNode(tree, nodeId)
    if (!node) return

    setCameraTarget({ ...systemTarget(node, systemKey), instant: true })

    if (epilepsy) {
      setCanvasOpacity(1)
      setSystemPageOpacity(0)
      setSystemView(null)
      setCameraTarget({ ...paneTarget(node), instant: true })
    } else {
      setTransitioning(true)
      setCanvasOpacity(1)

      requestAnimationFrame(() => {
        setSystemPageOpacity(0)

        setTimeout(() => {
          setSystemView(null)
          setCameraTarget(paneTarget(node))
          setTimeout(() => setTransitioning(false), TRANSITION.fadeBack)
        }, TRANSITION.fadeBack)
      })
    }
  }, [systemView, tree, epilepsy])

  const handleBack = useCallback(() => {
    if (paneId != null) {
      const node = findNode(tree, paneId)
      if (node) setCameraTarget(focusTarget(node))
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

  // Agent API — the single mutation surface for both AI agent and UI handlers.
  // Refs expose live state to commands without retriggering the memo.
  const modelRef = useRef(model)
  const processorsRef = useRef(processors)
  const navStateRef = useRef({ focusedId, paneId, systemView, processorView })
  const cablesRef = useRef(cables)
  useEffect(() => { modelRef.current = model }, [model])
  useEffect(() => { processorsRef.current = processors }, [processors])
  useEffect(() => { cablesRef.current = cables }, [cables])
  useEffect(() => { navStateRef.current = { focusedId, paneId, systemView, processorView } }, [focusedId, paneId, systemView, processorView])

  const agentAPI = useMemo(() => createAgentAPI({
    getModel: () => modelRef.current,
    setModel,
    getProcessors: () => processorsRef.current,
    setProcessors,
    getCables: () => cablesRef.current,
    setCables,
    getNavState: () => navStateRef.current,
    navigate: {
      overview: handleBack, // repeated until overview
      focus: (nodeId) => { handleDoubleClick(nodeId) },
      detail: (nodeId) => { navigateToPane(nodeId) },
      openSystem: (nodeId, systemKey) => { navigateToSystem(nodeId, systemKey) },
      openProcessor: (nodeId, systemKey, instanceId) => { handleOpenProcessor(nodeId, systemKey, instanceId) },
      back: handleBack,
    },
    panels: {
      open: (key) => setExplorerRequested(key === 'E'),
      close: () => {},
    },
    filters: {
      set: (key, visible) => setVisibleSystems(prev => ({ ...prev, [key]: visible })),
    },
    accessibility: {
      toggleEpilepsy, toggleDyslexia, toggleColorBlind, setFontVisibility,
    },
    language: { set: setLang },
    aiConfig: {
      setApiKey, setProvider: setAIProvider, setModel: setAIModel, setEndpoint: setAIEndpoint,
    },
    announce: setAnnouncement,
  }), [
    handleBack, handleDoubleClick, navigateToPane, navigateToSystem, handleOpenProcessor,
    toggleEpilepsy, toggleDyslexia, toggleColorBlind, setFontVisibility,
    setLang, setApiKey, setAIProvider, setAIModel, setAIEndpoint,
  ])

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

      {systemView && !processorView && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: Z_INDEX.systemPage,
          opacity: systemPageOpacity,
          transition: `opacity ${TRANSITION.cssDuration} ease`,
          pointerEvents: systemPageOpacity > 0 ? 'auto' : 'none',
        }}>
          <SystemPage
            nodeId={systemView.nodeId}
            nodeName={findNode(tree, systemView.nodeId)?.name}
            node={findNode(tree, systemView.nodeId)}
            tree={tree}
            systemKey={systemView.systemKey}
            processors={processors[`${systemView.nodeId}:${systemView.systemKey}`] || []}
            cables={cables[`${systemView.nodeId}:${systemView.systemKey}`] || []}
            onAddProcessor={(def) => agentAPI.addProcessor(systemView.nodeId, systemView.systemKey, def.id)}
            onRemoveProcessor={(instanceId) => agentAPI.removeProcessor(systemView.nodeId, systemView.systemKey, instanceId)}
            onUpdateProcessor={(instanceId, updates) => {
              // Switchboard sends { filters: {...} } patches when rows change.
              // Rack sends { config: {...} } via Panel.onConfigChange.
              // Panel's broadcast pill sends { broadcast: bool }.
              if (updates?.filters) agentAPI.updateProcessorFilters(systemView.nodeId, systemView.systemKey, instanceId, updates.filters)
              if (updates?.config) agentAPI.updateProcessorConfig(systemView.nodeId, systemView.systemKey, instanceId, updates.config)
              if ('broadcast' in (updates || {})) agentAPI.setProcessorBroadcast(systemView.nodeId, systemView.systemKey, instanceId, updates.broadcast)
            }}
            onOpenProcessor={(instanceId) => agentAPI.openProcessor(systemView.nodeId, systemView.systemKey, instanceId)}
            onAddCable={(cab) => agentAPI.addCable(systemView.nodeId, systemView.systemKey, cab.source, cab.target, cab.color)}
            onRemoveCable={(cableId) => agentAPI.removeCable(systemView.nodeId, systemView.systemKey, cableId)}
            onBack={handleSystemBack}
            onNavigate={(targetNodeId, targetSystemKey) => {
              handleSystemBack()
              setTimeout(() => navigateToSystem(targetNodeId, targetSystemKey), TRANSITION.fadeBack + 100)
            }} />
        </div>
      )}

      {processorView && (() => {
        const pKey = `${processorView.nodeId}:${processorView.systemKey}`
        const inst = (processors[pKey] || []).find(p => p.id === processorView.instanceId)
        if (!inst) {
          queueMicrotask(() => setProcessorView(null))
          return null
        }
        return (
          <div style={{ position: 'absolute', inset: 0, zIndex: Z_INDEX.systemPage + 1 }}>
            <ProcessorPage
              instance={inst}
              nodeId={processorView.nodeId}
              nodeName={findNode(tree, processorView.nodeId)?.name}
              systemKey={processorView.systemKey}
              roomInputs={topology[pKey] || []}
              onUpdateInstance={(updates) => {
                if (updates?.filters) agentAPI.updateProcessorFilters(processorView.nodeId, processorView.systemKey, processorView.instanceId, updates.filters)
                if (updates?.config) agentAPI.updateProcessorConfig(processorView.nodeId, processorView.systemKey, processorView.instanceId, updates.config)
              }}
              onBack={handleProcessorBack}
            />
          </div>
        )
      })()}

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
            const [nodeId, sysKey] = id.split(':')
            const node = findNode(tree, nodeId)
            if (!node) return
            if (paneId !== nodeId) {
              setCameraTarget(paneTarget(node))
              setFocusedId(nodeId)
              setPaneId(nodeId)
            }
            setKeySelectedId(nodeId)
            setKeySelectedSystem(sysKey)
            setHoveredId(nodeId)
          } else {
            const node = findNode(tree, id)
            if (!node) return
            if (paneId != null) {
              setPaneId(null)
              setCameraTarget(focusTarget(node))
              setAnnouncement('Returned to focus view')
            } else if (focusedId !== id) {
              setCameraTarget(focusTarget(node))
            }
            setFocusedId(id)
            setKeySelectedId(id)
            setKeySelectedSystem(null)
            setHoveredId(id)
          }
        }}
        onDeleteNode={(nodeId) => {
          agentAPI.removeNode(nodeId)
          // If we were focused/paned on the deleted node, back out
          if (focusedId === nodeId || paneId === nodeId) handleBack()
        }}
        onMoveNode={(nodeId, parentId, insertIndex) => {
          agentAPI.moveNode(nodeId, parentId, insertIndex)
        }}
        onDuplicateNode={(nodeId, parentId, insertIndex) => {
          agentAPI.duplicateSubtree(nodeId, parentId, insertIndex)
        }}
        onSpliceNode={(nodeId) => {
          agentAPI.spliceNode(nodeId)
        }}
        onRenameNode={(nodeId, name) => {
          agentAPI.renameNode(nodeId, name)
        }}
        onAddNode={(nodeId, nodeType) => {
          const result = nodeType === 'management'
            ? agentAPI.addManagement(nodeId)
            : agentAPI.addOperation(nodeId)
          if (!result.ok) return

          // Keep the UI-side transitions (camera, focus, selection, refocus)
          // that used to live inside the inline setModel. These are view
          // effects of the mutation; they don't belong inside the agent
          // command (the command mustn't touch camera/DOM).
          const stillValid = nodeType === 'management'
            ? canAddManagement(modelRef.current, nodeId)
            : canAddOperation(modelRef.current, nodeId)
          const node = findNode(tree, nodeId)
          if (node) {
            setCameraTarget(focusTarget(node))
            setFocusedId(nodeId)
            setPaneId(null)
          }
          setKeySelectedId(nodeId)
          setHoveredId(nodeId)

          const actionId = `${nodeId}:add-${nodeType}`
          requestAnimationFrame(() => {
            if (stillValid) {
              const actionBtn = document.querySelector(`[role="tree"] button[data-node-id="${actionId}"]`)
              if (actionBtn) { actionBtn.focus(); return }
            }
            const parentBtn = document.querySelector(`[role="tree"] button[data-node-id="${nodeId}"]`)
            parentBtn?.focus()
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
            agentAPI.renameNode(nodeId, name)
          }} />
        )}
      </div>

      {/* 3D right-click context menu. Every action invokes the agent API —
          same chokepoint as the explorer-tree menu and the HUD rename. */}
      {menu && (() => {
        const nid = menu.nodeId
        const isRoot = nid === model.rootId
        const isOp = model.entities[nid]?.type === 'operation'
        const closeAfter = (fn) => () => { fn(); setMenu(null); setHoveredId(null) }
        const menuItems = []
        if (canAddManagement(model, nid))
          menuItems.push({ label: tr('menu.addManagement'), action: closeAfter(() => {
            agentAPI.addManagement(nid)
            setKeySelectedId(nid)
            requestAnimationFrame(() => document.querySelector(`[role="tree"] button[data-node-id="${nid}"]`)?.focus())
          }) })
        if (canAddOperation(model, nid))
          menuItems.push({ label: tr('menu.addOperation'), action: closeAfter(() => {
            agentAPI.addOperation(nid)
            setKeySelectedId(nid)
            requestAnimationFrame(() => document.querySelector(`[role="tree"] button[data-node-id="${nid}"]`)?.focus())
          }) })
        if (menuItems.length > 0)
          menuItems.push({ separator: true })
        if (!isRoot && !isOp)
          menuItems.push({ label: tr('menu.duplicate'), action: closeAfter(() => {
            const parentId = model.parents[nid]
            if (parentId) agentAPI.duplicateSubtree(nid, parentId)
          }) })
        if (canSplice(model, nid))
          menuItems.push({ label: tr('menu.splice'), action: closeAfter(() => agentAPI.spliceNode(nid)) })
        if (!isRoot)
          menuItems.push({ separator: true })
        if (!isRoot)
          menuItems.push({ label: tr('menu.delete'), danger: true, action: closeAfter(() => {
            agentAPI.removeNode(nid)
            if (focusedId === nid || paneId === nid) handleBack()
          }) })
        return (
          <ContextMenu
            x={menu.x} y={menu.y}
            items={menuItems}
            onClose={handleCloseMenu}
          />
        )
      })()}
    </div>
  )
}

export default App
