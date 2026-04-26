// Pure processor commands.
//
// Operate on the processors slice (`{ [`${nodeId}:${systemKey}`]: Instance[] }`).
// Each command returns `{ processors, result }`.
//
// Instance shape:
//   { id, defId, config, filters, broadcast? }

import { getProcessorDef, canPlaceProcessor } from '../signals/library'
import { defaultFilters } from '../signals/filter'

const roomKey = (nodeId, systemKey) => `${nodeId}:${systemKey}`

export function addProcessor(processorsByRoom, { nodeId, systemKey, defId, config }) {
  const def = getProcessorDef(defId)
  if (!def) return { processors: processorsByRoom, result: { ok: false, error: `Unknown processor: ${defId}` } }
  if (!canPlaceProcessor(def, systemKey)) {
    return { processors: processorsByRoom, result: { ok: false, error: `Processor "${defId}" cannot be placed in ${systemKey}` } }
  }
  const instance = {
    id: crypto.randomUUID(),
    defId,
    config: { ...(def.defaultConfig || {}), ...(config || {}) },
    filters: defaultFilters(),
  }
  const key = roomKey(nodeId, systemKey)
  const next = { ...processorsByRoom, [key]: [...(processorsByRoom[key] || []), instance] }
  return { processors: next, result: { ok: true, instanceId: instance.id } }
}

export function removeProcessor(processorsByRoom, { nodeId, systemKey, instanceId }) {
  const key = roomKey(nodeId, systemKey)
  const list = processorsByRoom[key] || []
  if (!list.find(p => p.id === instanceId)) {
    return { processors: processorsByRoom, result: { ok: false, error: 'Processor not found' } }
  }
  const next = { ...processorsByRoom, [key]: list.filter(p => p.id !== instanceId) }
  return { processors: next, result: { ok: true } }
}

export function updateProcessorFilters(processorsByRoom, { nodeId, systemKey, instanceId, patch }) {
  const key = roomKey(nodeId, systemKey)
  const list = processorsByRoom[key] || []
  if (!list.find(p => p.id === instanceId)) {
    return { processors: processorsByRoom, result: { ok: false, error: 'Processor not found' } }
  }
  const next = {
    ...processorsByRoom,
    [key]: list.map(inst => inst.id === instanceId
      ? { ...inst, filters: { ...(inst.filters || defaultFilters()), ...(patch || {}) } }
      : inst,
    ),
  }
  return { processors: next, result: { ok: true } }
}

export function updateProcessorConfig(processorsByRoom, { nodeId, systemKey, instanceId, configPatch }) {
  const key = roomKey(nodeId, systemKey)
  const list = processorsByRoom[key] || []
  if (!list.find(p => p.id === instanceId)) {
    return { processors: processorsByRoom, result: { ok: false, error: 'Processor not found' } }
  }
  const next = {
    ...processorsByRoom,
    [key]: list.map(inst => inst.id === instanceId
      ? { ...inst, config: { ...(inst.config || {}), ...(configPatch || {}) } }
      : inst,
    ),
  }
  return { processors: next, result: { ok: true } }
}

// Broadcast is a routing flag, not a config knob — it changes how the
// dispatcher reads the cable graph for this processor. Top-level field on
// the instance for that reason.
export function setProcessorBroadcast(processorsByRoom, { nodeId, systemKey, instanceId, broadcast }) {
  const key = roomKey(nodeId, systemKey)
  const list = processorsByRoom[key] || []
  if (!list.find(p => p.id === instanceId)) {
    return { processors: processorsByRoom, result: { ok: false, error: 'Processor not found' } }
  }
  const next = {
    ...processorsByRoom,
    [key]: list.map(inst => inst.id === instanceId
      ? { ...inst, broadcast: Boolean(broadcast) }
      : inst,
    ),
  }
  return { processors: next, result: { ok: true } }
}

// Prune processors whose room no longer exists.
export function pruneProcessorsByRoom(processorsByRoom, liveRoomKeys) {
  let changed = false
  const next = {}
  for (const [key, list] of Object.entries(processorsByRoom)) {
    if (liveRoomKeys.has(key)) next[key] = list
    else changed = true
  }
  return { processors: changed ? next : processorsByRoom, result: { ok: true, changed } }
}
