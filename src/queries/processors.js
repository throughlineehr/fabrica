// Pure processor queries.

const roomKey = (nodeId, systemKey) => `${nodeId}:${systemKey}`

export function listProcessors(processorsByRoom, { nodeId, systemKey }) {
  return processorsByRoom[roomKey(nodeId, systemKey)] || []
}

export function findProcessor(processorsByRoom, { nodeId, systemKey, instanceId }) {
  return listProcessors(processorsByRoom, { nodeId, systemKey }).find(p => p.id === instanceId) || null
}

// Live (instanceId Set) per room — used by cable pruning when processors are
// removed.
export function liveProcessorIdsByRoom(processorsByRoom) {
  const map = {}
  for (const [key, list] of Object.entries(processorsByRoom)) {
    map[key] = new Set(list.map(p => p.id))
  }
  return map
}
