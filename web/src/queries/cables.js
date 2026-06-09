// Pure cable queries — derive views from the cables slice.
//
// These are the things a server would expose as read-only subscriptions.

const roomKey = (nodeId, systemKey) => `${nodeId}:${systemKey}`

export function listCables(cablesByRoom, { nodeId, systemKey }) {
  return cablesByRoom[roomKey(nodeId, systemKey)] || []
}

// Internal cables = both endpoints are jacks (jack→jack within a room).
export function listInternalCables(cablesByRoom, { nodeId, systemKey }) {
  return listCables(cablesByRoom, { nodeId, systemKey }).filter(c =>
    c?.source?.kind === 'jack' && c?.target?.kind === 'jack'
  )
}

// Terminal cables = at least one endpoint is a wall terminal (jack↔terminal
// or terminal↔terminal). Used by the rack's terminal-side cable rendering.
export function listTerminalCables(cablesByRoom, { nodeId, systemKey }) {
  return listCables(cablesByRoom, { nodeId, systemKey }).filter(c =>
    c?.source?.kind === 'terminal' || c?.target?.kind === 'terminal'
  )
}

// All cables sourced from a specific (instanceId, portId).
export function findCablesFromPort(cablesByRoom, { nodeId, systemKey, instanceId, portId }) {
  return listCables(cablesByRoom, { nodeId, systemKey }).filter(c =>
    c.source?.kind === 'jack' && c.source.instanceId === instanceId && c.source.portId === portId
  )
}

// All cables targeting a specific (instanceId, portId).
export function findCablesToPort(cablesByRoom, { nodeId, systemKey, instanceId, portId }) {
  return listCables(cablesByRoom, { nodeId, systemKey }).filter(c =>
    c.target?.kind === 'jack' && c.target.instanceId === instanceId && c.target.portId === portId
  )
}

// Used port keys (`${instanceId}:${portId}`) — handy for "is this output
// already cabled?" checks in select dropdowns.
export function usedPortKeys(cablesByRoom, { nodeId, systemKey, side }) {
  const set = new Set()
  for (const c of listCables(cablesByRoom, { nodeId, systemKey })) {
    const ep = side === 'source' ? c.source : c.target
    if (ep?.kind === 'jack') set.add(`${ep.instanceId}:${ep.portId}`)
  }
  return set
}
