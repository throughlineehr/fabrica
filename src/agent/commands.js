// Agent Command Interface
//
// The agent operates the application through structured commands.
// Each command returns a result describing what happened.

import { addNode, removeNode, renameNode, moveNode, insertParent, spliceNode, detachNode, duplicateSubtree, createOrphan, validateModel, canAddManagement, canAddOperation, exportModelCompact } from '../tree/index'

export function createAgentAPI({ getModel, setModel, getNavState, navigate, panels, filters, announce }) {
  return {
    // --- Model Read ---
    read: () => {
      return { ok: true, yaml: exportModelCompact(getModel()) }
    },

    replaceModel: (newModel) => {
      setModel(newModel)
      announce?.('Model replaced')
      return { ok: true }
    },

    // --- Model Mutations ---
    addManagement: (parentId) => {
      const model = getModel()
      const next = addNode(model, parentId, 'management')
      if (next === model) return { ok: false, error: 'Cannot add management here' }
      const newId = next.children[parentId].find(id => !model.children[parentId]?.includes(id))
      setModel(next)
      announce?.('Management unit added')
      return { ok: true, nodeId: newId }
    },

    addOperation: (parentId) => {
      const model = getModel()
      const next = addNode(model, parentId, 'operation')
      if (next === model) return { ok: false, error: 'Cannot add operation here' }
      const newId = next.children[parentId].find(id => !model.children[parentId]?.includes(id))
      setModel(next)
      announce?.('Operation added')
      return { ok: true, nodeId: newId }
    },

    removeNode: (nodeId) => {
      const model = getModel()
      if (!model.entities[nodeId]) return { ok: false, error: 'Node not found' }
      if (nodeId === model.rootId) return { ok: false, error: 'Cannot remove root node' }
      setModel(removeNode(model, nodeId))
      announce?.('Node removed')
      return { ok: true }
    },

    renameNode: (nodeId, name) => {
      const model = getModel()
      if (!model.entities[nodeId]) return { ok: false, error: 'Node not found' }
      setModel(renameNode(model, nodeId, name))
      announce?.(`Renamed to ${name}`)
      return { ok: true }
    },

    moveNode: (nodeId, newParentId) => {
      const model = getModel()
      const next = moveNode(model, nodeId, newParentId)
      if (next === model) return { ok: false, error: 'Cannot move here' }
      setModel(next)
      announce?.('Node moved')
      return { ok: true }
    },

    insertParent: (nodeId) => {
      const model = getModel()
      const next = insertParent(model, nodeId)
      if (next === model) return { ok: false, error: 'Cannot insert parent' }
      const newParentId = next.parents[nodeId]
      setModel(next)
      announce?.('Parent inserted above')
      return { ok: true, nodeId: newParentId }
    },

    spliceNode: (nodeId) => {
      const model = getModel()
      const next = spliceNode(model, nodeId)
      if (next === model) return { ok: false, error: 'Cannot splice this node' }
      setModel(next)
      announce?.('Node removed, children promoted')
      return { ok: true }
    },

    detachNode: (nodeId) => {
      const model = getModel()
      const next = detachNode(model, nodeId)
      if (next === model) return { ok: false, error: 'Cannot detach' }
      setModel(next)
      announce?.('Node detached from tree')
      return { ok: true }
    },

    duplicateSubtree: (nodeId, targetParentId) => {
      const model = getModel()
      const next = duplicateSubtree(model, nodeId, targetParentId)
      if (next === model) return { ok: false, error: 'Cannot duplicate here' }
      setModel(next)
      announce?.('Subtree duplicated')
      return { ok: true }
    },

    validate: () => {
      const issues = validateModel(getModel())
      announce?.(issues.length === 0 ? 'Model is valid' : `${issues.length} issues found`)
      return { ok: true, issues, valid: issues.length === 0 }
    },

    // --- Navigation ---
    overview: () => { navigate.overview(); return { ok: true, view: 'overview' } },
    focus: (nodeId) => { navigate.focus(nodeId); return { ok: true, view: 'focus', nodeId } },
    detail: (nodeId) => { navigate.detail(nodeId); return { ok: true, view: 'detail', nodeId } },
    openSystem: (nodeId, systemKey) => { navigate.openSystem(nodeId, systemKey); return { ok: true, view: 'system', nodeId, systemKey } },
    back: () => { navigate.back(); return { ok: true } },

    // --- State ---
    getState: () => {
      const nav = getNavState()
      return {
        ok: true,
        view: nav.systemView ? 'system' : nav.paneId ? 'detail' : nav.focusedId ? 'focus' : 'overview',
        focusedId: nav.focusedId,
        paneId: nav.paneId,
        systemView: nav.systemView,
        nodeCount: Object.keys(getModel().entities).length,
      }
    },

    getNode: (nodeId) => {
      const model = getModel()
      const entity = model.entities[nodeId]
      if (!entity) return { ok: false, error: 'Node not found' }
      return {
        ok: true, id: nodeId, type: entity.type, name: entity.name,
        parentId: model.parents[nodeId],
        childIds: model.children[nodeId] || [],
      }
    },

    listNodes: () => {
      const model = getModel()
      const nodes = Object.entries(model.entities).map(([id, entity]) => ({
        id: id.slice(0, 8), fullId: id, type: entity.type, name: entity.name,
        parentId: model.parents[id]?.slice(0, 8) || null,
        children: (model.children[id] || []).length,
      }))
      return { ok: true, nodes, rootId: model.rootId.slice(0, 8) }
    },

    // --- Panels ---
    openPanel: (key) => { panels.open(key); return { ok: true, panel: key } },
    closePanel: () => { panels.close(); return { ok: true } },

    // --- Filters ---
    setFilter: (systemKey, visible) => { filters.set(systemKey, visible); return { ok: true, systemKey, visible } },
  }
}

export const AGENT_DSL = `
You are an AI agent operating the Fabrica viable system model application.

THE MODEL:
The model is a tree of nodes. Each node is either "management" or "operation".
Management nodes contain systems S5 (policy), S4 (planning), S3 (operations management).
Operations are leaf work units with S1 (operations) and S2 (coordination/variety attenuation).
The model uses draft mode — mixed types and orphans are allowed during construction.
Use validate() before publishing to check for issues.

COMMANDS:
  Model:
    read()                              → YAML of current model
    addManagement(parentId)             → add management child
    addOperation(parentId)              → add operation child
    removeNode(nodeId)                  → cascade delete (node + descendants)
    renameNode(nodeId, name)            → set node name
    moveNode(nodeId, newParentId)       → reparent entire subtree
    insertParent(nodeId)                → insert management layer above
    spliceNode(nodeId)                  → remove node, promote children to grandparent
    detachNode(nodeId)                  → disconnect from parent (becomes orphan)
    duplicateSubtree(nodeId, parentId)  → deep copy subtree under parent
    validate()                          → check model for publish readiness

  Navigation:
    overview()                → full tree view
    focus(nodeId)             → focus on node
    detail(nodeId)            → detail/pane view
    openSystem(nodeId, sysKey)→ open system page (s1-s5)
    back()                    → go back one level
    getState()                → current view state
    getNode(nodeId)           → node details (type, name, parent, children)
    listNodes()               → all nodes with names and short IDs

  Panels/Filters:
    openPanel(key)            → E=Explorer, S=Settings, T=Tools, A=Agent, F=Filter
    closePanel()              → close panel
    setFilter(sysKey, visible)→ toggle visibility (s1-s5, frame)

RULES:
- Operations cannot have children (data integrity)
- Draft mode: mixed types and orphans are allowed
- validate() reports issues: orphans, unnamed, mixed children, etc.
- Node IDs are UUIDs — use listNodes() for short IDs
- Navigation: overview → focus → detail → system, back() reverses
`
