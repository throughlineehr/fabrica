// Snapshot a room's processors + cables into a compound processor def.
//
// Inverts the runtime's compound-instantiation: we have a flat patch
// (instances + cables in a room), we want a single reusable def that, when
// instantiated, recreates that patch internally.
//
// Pure data transformation. Caller decides how to register the result.
//
// Auto port-derivation rule (boundary = unconnected jacks):
//   - input ports: every declared INPUT jack on every inner instance whose
//     defId.ports.inputs entry has NO incoming jack→jack cable from another
//     instance in the snapshot
//   - output ports: every declared OUTPUT jack with NO outgoing jack→jack
//     cable to another instance in the snapshot
//
// The user can override post-hoc by editing the returned def — e.g., dropping
// inputs they don't want exposed, renaming outer ports, declaring
// paramBindings.

import { getProcessorDef } from './library'

const kebab = (s) => String(s)
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')

// Stable, short local id from a uuid (or any string). The local ids must be
// unique within the snapshot; we collision-check below.
function makeLocalIdMap(processors) {
  const taken = new Set()
  const map = {}
  for (const p of processors) {
    // Default: defId + '-' + counter (e.g., 'heartbeat-1', 'logger-1').
    const baseId = (p.defId || 'instance').replace(/[^a-z0-9-]/gi, '')
    let n = 1
    let local
    do { local = `${baseId}-${n++}` } while (taken.has(local))
    taken.add(local)
    map[p.id] = local
  }
  return map
}

/**
 * Snapshot a room's flat patch into a compound def.
 *
 * @param {Object} args
 * @param {Array}  args.processors - room processor instances [{id, defId, config, …}]
 * @param {Array}  args.cables     - room cables [{source, target, …}]
 * @param {String} args.name       - human-readable compound name
 * @param {String} [args.description]
 * @param {String} [args.category='analysis']
 * @param {String} [args.idHint]   - optional override for the def id (kebab-cased)
 * @param {Object} [args.expose]   - optional override of auto-derivation:
 *     { inputs: [{outerId, instanceId, portId}], outputs: [...],
 *       params: [{outerKey, instanceId, configKey}] }
 * @returns {Object} compound def ready to register
 */
export function compoundFromRoom(args) {
  const {
    processors = [], cables = [],
    name, description = '', category = 'analysis',
    idHint, expose,
  } = args
  if (!name) throw new Error('compoundFromRoom: name is required')
  if (processors.length === 0) throw new Error('compoundFromRoom: at least one processor required')

  const idMap = makeLocalIdMap(processors)

  // Inner instances — strip out the original uuid; substitute the local id.
  const innerInstances = processors.map(p => ({
    id: idMap[p.id],
    defId: p.defId,
    ...(p.config && Object.keys(p.config).length > 0 ? { config: { ...p.config } } : {}),
  }))

  // Inner cables — only jack→jack cables where both endpoints are in the
  // snapshot. Terminal-anchored cables don't translate (terminals are a
  // room concept, not a compound concept).
  const innerCables = (cables || [])
    .filter(c => c?.source?.kind === 'jack' && c?.target?.kind === 'jack')
    .filter(c => idMap[c.source.instanceId] && idMap[c.target.instanceId])
    .map(c => ({
      source: { kind: 'jack', instanceId: idMap[c.source.instanceId], portId: c.source.portId },
      target: { kind: 'jack', instanceId: idMap[c.target.instanceId], portId: c.target.portId },
    }))

  // Auto port-derivation: which inner jacks are at the boundary?
  const incomingTo = new Set()  // 'localId|portId' for inputs that have a cable into them
  const outgoingFrom = new Set()
  for (const c of innerCables) {
    incomingTo.add(`${c.target.instanceId}|${c.target.portId}`)
    outgoingFrom.add(`${c.source.instanceId}|${c.source.portId}`)
  }

  const autoInputs = []
  const autoOutputs = []
  for (const p of processors) {
    const localId = idMap[p.id]
    const def = getProcessorDef(p.defId)
    if (!def) continue
    for (const port of def.ports?.inputs || []) {
      if (!incomingTo.has(`${localId}|${port.id}`)) {
        autoInputs.push({
          outerId: `${localId}-${port.id}`,
          instanceId: localId,
          portId: port.id,
        })
      }
    }
    for (const port of def.ports?.outputs || []) {
      if (!outgoingFrom.has(`${localId}|${port.id}`)) {
        autoOutputs.push({
          outerId: `${localId}-${port.id}`,
          instanceId: localId,
          portId: port.id,
        })
      }
    }
  }

  const exposedInputs  = expose?.inputs  ?? autoInputs
  const exposedOutputs = expose?.outputs ?? autoOutputs
  const exposedParams  = expose?.params  ?? []

  const inputBindings = {}
  for (const e of exposedInputs) {
    inputBindings[e.outerId] = { instanceId: e.instanceId, portId: e.portId }
  }
  const outputBindings = {}
  for (const e of exposedOutputs) {
    outputBindings[e.outerId] = { instanceId: e.instanceId, portId: e.portId }
  }
  const paramBindings = {}
  for (const e of exposedParams) {
    paramBindings[e.outerKey] = { instanceId: e.instanceId, configKey: e.configKey }
  }

  // defaultConfig: the set of outer keys present in paramBindings, with
  // their initial values pulled from the matching inner instance's config
  // (or its def's defaultConfig).
  const defaultConfig = {}
  for (const e of exposedParams) {
    const inner = innerInstances.find(i => i.id === e.instanceId)
    const innerDef = inner ? getProcessorDef(inner.defId) : null
    const innerCfg = inner?.config || {}
    const innerDefCfg = innerDef?.defaultConfig || {}
    defaultConfig[e.outerKey] = innerCfg[e.configKey] ?? innerDefCfg[e.configKey]
  }

  // A simple square panel with the input/output jacks declared on the def.
  // Layout: inputs across top (y=0), outputs across bottom (y=11), with the
  // grid wide enough to fit them. No knobs/displays in the auto-generated
  // panel — user can edit later.
  const widthHP = Math.max(8, Math.max(exposedInputs.length, exposedOutputs.length) * 2 + 2)
  const inputFixtures = exposedInputs.map((e, i) => ({
    type: 'jack', id: `jin-${e.outerId}`, x: 1 + i * 2, y: 0,
    kind: 'input', port: e.outerId, color: 's3', label: e.outerId.slice(0, 6),
  }))
  const outputFixtures = exposedOutputs.map((e, i) => ({
    type: 'jack', id: `jout-${e.outerId}`, x: 1 + i * 2, y: 11,
    kind: 'output', port: e.outerId, color: 's3', label: e.outerId.slice(0, 6),
  }))

  const compoundDef = {
    id: kebab(idHint || name),
    name,
    description,
    category,
    hasInputs: exposedInputs.length > 0,
    hasOutputs: exposedOutputs.length > 0,
    ports: {
      inputs: exposedInputs.map(e => ({
        id: e.outerId, label: e.outerId,
        accepts: { types: null, tags: null },
      })),
      outputs: exposedOutputs.map(e => ({
        id: e.outerId, label: e.outerId,
        emits: { types: null, tags: null },
      })),
    },
    placement: 'any',
    defaultConfig,
    panel: {
      widthHP,
      bg: 'mid',
      accent: 's3',
      fixtures: [...inputFixtures, ...outputFixtures],
    },
    subRack: {
      instances: innerInstances,
      cables: innerCables,
      inputBindings,
      outputBindings,
      paramBindings,
    },
    // create() is provided by the registrar (it needs createCompoundInstance
    // which is in library.js — circular if we import here). The default
    // pattern in library.js wires this up.
  }

  return compoundDef
}
