// Agent Command Interface
//
// The agent operates the application through structured commands.
// Each command returns a result describing what happened.
//
// This is the SINGLE mutation surface for the application. Both the AI agent
// (via AgentPanel) and the human UI (via App.jsx callbacks) call into here.
// Downstream features — audit logging, undo/redo, websocket sync — can be
// bolted onto this surface without touching callers.

import {
  addNode, removeNode, renameNode, moveNode, insertParent, spliceNode,
  detachNode, duplicateSubtree, validateModel, exportModelCompact,
} from '../tree/index'
import { parseShorthand } from '../tree/shorthand'
import { getProcessorDef } from '../signals/library'
import * as cmd from '../commands'
import * as q from '../queries'

export function createAgentAPI({
  getModel, setModel,
  getProcessors, setProcessors,
  getCables, setCables,
  getNavState, navigate,
  panels, filters,
  accessibility, language, aiConfig,
  announce,
}) {
  return {
    // ================================================================
    // Model: tree mutations
    // ================================================================

    read: () => ({ ok: true, yaml: exportModelCompact(getModel()) }),

    replaceModel: (newModel) => {
      setModel(newModel)
      announce?.('Model replaced')
      return { ok: true }
    },

    // Build a tree from indented shorthand notation. Replaces the
    // current model wholesale. See `tree/shorthand.js` for the format.
    shorthand: (text) => {
      try {
        const parsed = parseShorthand(text)
        setModel(parsed)
        announce?.('Model built from shorthand')
        return { ok: true, rootId: parsed.rootId, nodeCount: Object.keys(parsed.entities).length }
      } catch (err) {
        return { ok: false, error: String(err.message || err) }
      }
    },

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
      announce?.(name ? `Renamed to ${name}` : 'Name cleared')
      return { ok: true }
    },

    moveNode: (nodeId, newParentId, insertIndex) => {
      const model = getModel()
      const next = moveNode(model, nodeId, newParentId, insertIndex)
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

    duplicateSubtree: (nodeId, targetParentId, insertIndex) => {
      const model = getModel()
      const next = duplicateSubtree(model, nodeId, targetParentId, insertIndex)
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

    // ================================================================
    // Processors: per-room signal-processing instances
    // ================================================================
    // Processors live in App-level state keyed by `${nodeId}:${systemKey}`.
    // Every mutation goes through these commands so audit logging and undo
    // see the same thing the agent does.

    // All processor mutations delegate to pure commands in src/commands/.
    // The wrapper here just plugs them into React state and announces.

    addProcessor: (nodeId, systemKey, defId, config) => {
      if (!getProcessors || !setProcessors) return { ok: false, error: 'Processors runtime not available' }
      let result
      setProcessors(prev => {
        const out = cmd.addProcessor(prev, { nodeId, systemKey, defId, config })
        result = out.result
        return out.processors
      })
      if (result?.ok) {
        const def = getProcessorDef(defId)
        announce?.(`${def?.name || defId} added`)
      }
      return result
    },

    removeProcessor: (nodeId, systemKey, instanceId) => {
      if (!getProcessors || !setProcessors) return { ok: false, error: 'Processors runtime not available' }
      const inst = q.findProcessor(getProcessors(), { nodeId, systemKey, instanceId })
      if (!inst) return { ok: false, error: 'Processor not found' }
      const def = getProcessorDef(inst.defId)
      let result
      setProcessors(prev => {
        const out = cmd.removeProcessor(prev, { nodeId, systemKey, instanceId })
        result = out.result
        return out.processors
      })
      if (result?.ok) announce?.(`${def?.name || 'Processor'} removed`)
      return result
    },

    // Merge a filter patch into an instance's filters. Example patch:
    //   { types: ['metric'] }  — restrict to metric-only
    //   { tags: null }         — clear tag filter
    updateProcessorFilters: (nodeId, systemKey, instanceId, patch) => {
      if (!getProcessors || !setProcessors) return { ok: false, error: 'Processors runtime not available' }
      let result
      setProcessors(prev => {
        const out = cmd.updateProcessorFilters(prev, { nodeId, systemKey, instanceId, patch })
        result = out.result
        return out.processors
      })
      if (result?.ok) announce?.('Processor filters updated')
      return result
    },

    // Operational config (e.g. heartbeat intervalMs). Separate from filters.
    updateProcessorConfig: (nodeId, systemKey, instanceId, configPatch) => {
      if (!getProcessors || !setProcessors) return { ok: false, error: 'Processors runtime not available' }
      let result
      setProcessors(prev => {
        const out = cmd.updateProcessorConfig(prev, { nodeId, systemKey, instanceId, configPatch })
        result = out.result
        return out.processors
      })
      if (result?.ok) announce?.('Processor config updated')
      return result
    },

    // Broadcast: top-level routing flag. When true, the dispatcher delivers
    // outputs to every wall terminal in the room (overriding terminal cables);
    // internal jack→jack cables are unaffected.
    setProcessorBroadcast: (nodeId, systemKey, instanceId, broadcast) => {
      if (!getProcessors || !setProcessors) return { ok: false, error: 'Processors runtime not available' }
      let result
      setProcessors(prev => {
        const out = cmd.setProcessorBroadcast(prev, { nodeId, systemKey, instanceId, broadcast })
        result = out.result
        return out.processors
      })
      if (result?.ok) announce?.(broadcast ? 'Broadcast enabled' : 'Broadcast disabled')
      return result
    },

    openProcessor: (nodeId, systemKey, instanceId) => {
      if (!getProcessors) return { ok: false, error: 'Processors runtime not available' }
      if (!q.findProcessor(getProcessors(), { nodeId, systemKey, instanceId })) return { ok: false, error: 'Processor not found' }
      navigate.openProcessor?.(nodeId, systemKey, instanceId)
      return { ok: true, view: 'processor', nodeId, systemKey, instanceId }
    },

    listProcessors: (nodeId, systemKey) => {
      if (!getProcessors) return { ok: false, error: 'Processors runtime not available' }
      const list = q.listProcessors(getProcessors(), { nodeId, systemKey })
      return {
        ok: true,
        processors: list.map(p => ({
          id: p.id.slice(0, 8), fullId: p.id, defId: p.defId,
          config: p.config, filters: p.filters,
        })),
      }
    },

    // ================================================================
    // Cables — internal wiring within a room. Both Switchboard and
    // Rack views drive the same cable list per room. A cable's
    // source/target is a descriptor:
    //   { kind: 'jack',     instanceId, portId }
    //   { kind: 'terminal', terminalId, nodeId, systemKey, color }
    // ================================================================

    addCable: (nodeId, systemKey, source, target, color) => {
      if (!getCables || !setCables) return { ok: false, error: 'Cables runtime not available' }
      let result
      setCables(prev => {
        const out = cmd.addCable(prev, { nodeId, systemKey, source, target, color })
        result = out.result
        return out.cables
      })
      if (result?.ok) announce?.('Cable created')
      return result
    },

    removeCable: (nodeId, systemKey, cableId) => {
      if (!getCables || !setCables) return { ok: false, error: 'Cables runtime not available' }
      let result
      setCables(prev => {
        const out = cmd.removeCable(prev, { nodeId, systemKey, cableId })
        result = out.result
        return out.cables
      })
      if (result?.ok) announce?.('Cable removed')
      return result
    },

    listCables: (nodeId, systemKey) => {
      if (!getCables) return { ok: false, error: 'Cables runtime not available' }
      return { ok: true, cables: q.listCables(getCables(), { nodeId, systemKey }) }
    },

    // ================================================================
    // Navigation
    // ================================================================

    overview: () => { navigate.overview(); return { ok: true, view: 'overview' } },
    focus: (nodeId) => { navigate.focus(nodeId); return { ok: true, view: 'focus', nodeId } },
    detail: (nodeId) => { navigate.detail(nodeId); return { ok: true, view: 'detail', nodeId } },
    openSystem: (nodeId, systemKey) => { navigate.openSystem(nodeId, systemKey); return { ok: true, view: 'system', nodeId, systemKey } },
    back: () => { navigate.back(); return { ok: true } },

    // ================================================================
    // Queries
    // ================================================================

    getState: () => {
      const nav = getNavState()
      return {
        ok: true,
        view: nav.processorView ? 'processor'
          : nav.systemView ? 'system'
          : nav.paneId ? 'detail'
          : nav.focusedId ? 'focus'
          : 'overview',
        focusedId: nav.focusedId,
        paneId: nav.paneId,
        systemView: nav.systemView,
        processorView: nav.processorView,
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

    // ================================================================
    // Panels & filters (view-only, no domain mutation)
    // ================================================================

    openPanel: (key) => { panels.open(key); return { ok: true, panel: key } },
    closePanel: () => { panels.close(); return { ok: true } },

    setFilter: (systemKey, visible) => { filters.set(systemKey, visible); return { ok: true, systemKey, visible } },

    // ================================================================
    // Accessibility & user preferences
    // ================================================================

    setLanguage: (langCode) => {
      if (!language?.set) return { ok: false, error: 'Language runtime not available' }
      language.set(langCode)
      announce?.(`Language set to ${langCode}`)
      return { ok: true, language: langCode }
    },

    toggleAccessibility: (mode) => {
      if (!accessibility) return { ok: false, error: 'Accessibility runtime not available' }
      const map = {
        epilepsy: accessibility.toggleEpilepsy,
        dyslexia: accessibility.toggleDyslexia,
        colorBlind: accessibility.toggleColorBlind,
      }
      if (!map[mode]) return { ok: false, error: `Unknown mode: ${mode}` }
      map[mode]()
      announce?.(`${mode} toggled`)
      return { ok: true, mode }
    },

    setFontVisibility: (scale) => {
      if (!accessibility?.setFontVisibility) return { ok: false, error: 'Accessibility runtime not available' }
      const clamped = Math.max(0, Math.min(1, Number(scale)))
      accessibility.setFontVisibility(clamped)
      return { ok: true, fontVisibility: clamped }
    },

    setAIConfig: (patch) => {
      if (!aiConfig) return { ok: false, error: 'AI config runtime not available' }
      if (patch.provider !== undefined) aiConfig.setProvider?.(patch.provider)
      if (patch.model !== undefined) aiConfig.setModel?.(patch.model)
      if (patch.endpoint !== undefined) aiConfig.setEndpoint?.(patch.endpoint)
      if (patch.apiKey !== undefined) aiConfig.setApiKey?.(patch.apiKey)
      return { ok: true }
    },
  }
}

export const AGENT_DSL = `
You are an AI agent operating the Fabrica viable system model application.

THE MODEL:
The model is a tree of nodes. Each node is either "management" or "operation".
Management nodes contain systems S5 (policy), S4 (planning), S3 (operations management).
S2 regulators coordinate operations; S1 are leaf operations.
The model uses draft mode — mixed types and orphans are allowed during construction.
Use validate() before publishing to check for issues.

Each management unit's room (S1–S5, S2) can host PROCESSORS — units of signal
processing drawn from a library. Processors publish/subscribe on terminal-cabled
channels. Their filters narrow what signals they react to or publish.

COMMANDS:
  Model (tree):
    read()                              → YAML of current model
    addManagement(parentId)             → add management child
    addOperation(parentId)              → add operation child
    removeNode(nodeId)                  → cascade delete (node + descendants)
    renameNode(nodeId, name)            → set node name
    moveNode(nodeId, newParentId, index?)→ reparent (optional insertIndex)
    insertParent(nodeId)                → insert management layer above
    spliceNode(nodeId)                  → remove node, promote children
    detachNode(nodeId)                  → disconnect from parent (becomes orphan)
    duplicateSubtree(nodeId, parentId, index?)  → deep copy subtree
    validate()                          → check model for publish readiness
    shorthand(text)                     → BUILD tree from indented shorthand
                                          (replaces current model). Format:
                                          "name: m" / "name: o" with 2-space
                                          indent for depth.

  Processors:
    addProcessor(nodeId, systemKey, defId, config?)  → add processor to a room
    removeProcessor(nodeId, systemKey, instanceId)   → remove from room
    updateProcessorFilters(nodeId, systemKey, instanceId, patch)
        patch keys: types[] | tags[]
        null on a key = no constraint on that axis
        (terminal-list filtering moved to cables — see addCable)
    updateProcessorConfig(nodeId, systemKey, instanceId, configPatch)
        operational config (e.g. { intervalMs: 2000 } for heartbeat)
    openProcessor(nodeId, systemKey, instanceId)     → navigate to processor page
    listProcessors(nodeId, systemKey)                → processors in a room

  Navigation:
    overview()                → full tree view
    focus(nodeId)             → focus on node
    detail(nodeId)            → detail/pane view
    openSystem(nodeId, sysKey)→ open system page (s1-s5)
    back()                    → go back one level
    getState()                → current view state
    getNode(nodeId)           → node details (type, name, parent, children)
    listNodes()               → all nodes with names and short IDs

  Panels / filters / preferences:
    openPanel(key)            → E=Explorer, S=Settings, T=Tools, A=Agent, F=Filter
    closePanel()              → close panel
    setFilter(sysKey, visible)→ toggle system visibility
    setLanguage(langCode)     → switch app language
    toggleAccessibility(mode) → mode: 'epilepsy' | 'dyslexia' | 'colorBlind'
    setFontVisibility(0..1)   → scale fonts for readability
    setAIConfig({ provider?, model?, endpoint?, apiKey? })

RULES:
- Operations cannot have children (data integrity)
- Draft mode: mixed types and orphans are allowed
- validate() reports issues: orphans, unnamed, mixed children, etc.
- Node IDs are UUIDs — use listNodes() for short IDs
- Processor instance IDs are UUIDs — use listProcessors(nodeId, sysKey) for short IDs
- Navigation: overview → focus → detail → system → processor, back() reverses

Not exposed in this DSL (intentional, available on the JS API only):
- replaceModel(newModel)  — wholesale tree replacement; reserved for
  serialize/deserialize callers, not natural-language requests.
`
