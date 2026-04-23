// Human-readable name for a room: "{UnitName} · {SYS}".
// Kept standalone (no React) so both UI and tests can use it.

export function roomLabel(nodeId, systemKey, tree) {
  const name = findNodeName(tree, nodeId)
  const sys = systemKey.toUpperCase()
  return name ? `${name} · ${sys}` : `${nodeId.slice(0, 5)} · ${sys}`
}

function findNodeName(node, targetId) {
  if (!node) return null
  if (node.id === targetId) return node.name || null
  for (const child of node.children || []) {
    const hit = findNodeName(child, targetId)
    if (hit !== null) return hit
  }
  return null
}
