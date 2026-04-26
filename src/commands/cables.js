// Pure cable commands.
//
// Each command takes the cables slice (`{ [`${nodeId}:${systemKey}`]: Cable[] }`)
// plus an args bag, and returns `{ cables, result }`. No React, no setters, no
// global state — these can be applied symmetrically on client or server.
//
// Cable shape:
//   { id, source: Endpoint, target: Endpoint, color }
// Endpoint:
//   { kind: 'jack',     instanceId, portId }
//   { kind: 'terminal', terminalId, nodeId, systemKey, color }

const roomKey = (nodeId, systemKey) => `${nodeId}:${systemKey}`

export function addCable(cablesByRoom, { nodeId, systemKey, source, target, color }) {
  if (!source || !target) {
    return { cables: cablesByRoom, result: { ok: false, error: 'Source and target descriptors required' } }
  }
  const key = roomKey(nodeId, systemKey)
  const id = 'c-' + crypto.randomUUID().slice(0, 8)
  const list = cablesByRoom[key] || []
  const next = { ...cablesByRoom, [key]: [...list, { id, source, target, color }] }
  return { cables: next, result: { ok: true, cableId: id } }
}

export function removeCable(cablesByRoom, { nodeId, systemKey, cableId }) {
  const key = roomKey(nodeId, systemKey)
  const list = cablesByRoom[key] || []
  const filtered = list.filter(c => c.id !== cableId)
  if (filtered.length === list.length) {
    return { cables: cablesByRoom, result: { ok: false, error: 'Cable not found' } }
  }
  return { cables: { ...cablesByRoom, [key]: filtered }, result: { ok: true } }
}

// Prune cables for rooms that no longer exist (room deleted from tree).
export function pruneCablesByRoom(cablesByRoom, liveRoomKeys) {
  let changed = false
  const next = {}
  for (const [key, list] of Object.entries(cablesByRoom)) {
    if (liveRoomKeys.has(key)) next[key] = list
    else changed = true
  }
  return { cables: changed ? next : cablesByRoom, result: { ok: true, changed } }
}

// Prune cables whose endpoint processors disappeared (processor removed but
// room still exists). `liveProcessorIdsByRoom` is `{ roomKey: Set<instanceId> }`.
export function pruneCablesByProcessor(cablesByRoom, liveProcessorIdsByRoom) {
  let changed = false
  const next = {}
  for (const [key, list] of Object.entries(cablesByRoom)) {
    const liveIds = liveProcessorIdsByRoom[key] || new Set()
    const refsLive = (d) => {
      if (!d) return false
      if (d.kind === 'jack') return liveIds.has(d.instanceId)
      return true
    }
    const filtered = list.filter(c => refsLive(c.source) && refsLive(c.target))
    if (filtered.length !== list.length) changed = true
    next[key] = filtered
  }
  return { cables: changed ? next : cablesByRoom, result: { ok: true, changed } }
}
