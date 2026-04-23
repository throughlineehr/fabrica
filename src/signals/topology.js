// Channel topology — the VSM wiring rules, derived from the tree.
//
// A "room" is (nodeId, systemKey). Each room has terminals (the visible cables).
// ALL terminals are bidirectional (dir: 'both'): if A can talk to B, B can talk
// to A. This is the permanent invariant. A terminal shows up in both the
// incoming and outgoing columns of the switchboard.
//
// This file is the single source of truth for both:
//   - buildRoomTerminals / resolveTerminalConnections (used by the visual room shell)
//   - computeRoomSubscriptions (used by the signal wiring layer)
//
// Keep these consistent: a cable you see on a wall IS a real subscription.

import { findParent, nodeHasS2 } from '../tree/queries'

export function buildRoomTerminals(node, systemKey, tree) {
  if (!node) return []
  const parent = findParent(tree, node.id)
  const children = node.children || []
  const mgmtChildren = children.filter(c => c.type === 'management')
  const opChildren = children.filter(c => c.type === 'operation')
  const hasOp = opChildren.length > 0

  // Adjacent-neighbor sibling model: at most one sibling on each side.
  // We chain only immediate neighbors (by children-array order), not all
  // siblings at once. So a middle-of-three unit has left + right; endpoints
  // have one neighbor; only children have none.
  const mgmtOrder = parent ? parent.children.filter(c => c.type === 'management') : []
  const myIdx = mgmtOrder.findIndex(c => c.id === node.id)
  const leftSibling = myIdx > 0 ? mgmtOrder[myIdx - 1] : null
  const rightSibling = myIdx >= 0 && myIdx < mgmtOrder.length - 1 ? mgmtOrder[myIdx + 1] : null

  const terminals = []

  // Every cable in VSM is bidirectional: if something can reach me, I can
  // reach it back. We express that uniformly with dir: 'both'. The previous
  // in/out distinction was a historical artifact of how we drew cables;
  // semantically every edge is a two-way channel.
  switch (systemKey) {
    case 's1': {
      terminals.push({ id: 's3-in', wall: 'top', colorKey: 's3', dir: 'both', labelKey: 'systems.s3' })
      terminals.push({ id: 's2-out', wall: 'right', colorKey: 's2', dir: 'both', labelKey: 'systems.s2' })
      terminals.push({ id: 'audit', wall: 'left', colorKey: 'audit', dir: 'both', labelKey: 'systemPage.audit' })
      break
    }
    case 's2': {
      // Parent S2 — the CRC chain extends up through recursion.
      if (parent && parent.type === 'management' && nodeHasS2(parent)) {
        terminals.push({ id: 's2-parent', wall: 'top', colorKey: 's2', dir: 'both', labelKey: 'systems.s2' })
      }
      if (hasOp) {
        terminals.push({ id: 's1-in', wall: 'bottom', colorKey: 's1', dir: 'both', labelKey: 'systems.s1' })
      }
      // Children S2s — CRC chain extending down.
      const s2Children = mgmtChildren.filter(c => nodeHasS2(c))
      if (s2Children.length > 0) {
        terminals.push({ id: 's2-children', wall: 'bottom', colorKey: 's2', dir: 'both', labelKey: 'systems.s2' })
      }
      terminals.push({ id: 's3-out', wall: 'left', colorKey: 's3', dir: 'both', labelKey: 'systems.s3' })
      // Adjacent siblings: one on left, one on right (if they exist).
      if (leftSibling) {
        terminals.push({ id: 's2-sibling-left', wall: 'left', colorKey: 's2', dir: 'both', labelKey: 'systems.s2' })
      }
      if (rightSibling) {
        terminals.push({ id: 's2-sibling-right', wall: 'right', colorKey: 's2', dir: 'both', labelKey: 'systems.s2' })
      }
      break
    }
    case 's3': {
      if (parent && parent.type === 'management') {
        terminals.push({ id: 's3-parent', wall: 'top', colorKey: 's3', dir: 'both', labelKey: 'systems.s3' })
      }
      if (mgmtChildren.length) {
        terminals.push({ id: 's3-children', wall: 'bottom', colorKey: 's3', dir: 'both', labelKey: 'systems.s3' })
      }
      terminals.push({ id: 's4-out', wall: 'top', colorKey: 's4', dir: 'both', labelKey: 'systems.s4' })
      terminals.push({ id: 's5-out', wall: 'top', colorKey: 's5', dir: 'both', labelKey: 'systems.s5' })
      terminals.push({ id: 'audit', wall: 'left', colorKey: 'audit', dir: 'both', labelKey: 'systemPage.audit' })
      if (nodeHasS2(node)) {
        terminals.push({ id: 's2-in', wall: 'right', colorKey: 's2', dir: 'both', labelKey: 'systems.s2' })
      }
      break
    }
    case 's4': {
      if (parent && parent.type === 'management') {
        terminals.push({ id: 's4-parent', wall: 'top', colorKey: 's4', dir: 'both', labelKey: 'systems.s4' })
      }
      terminals.push({ id: 's3-in', wall: 'bottom', colorKey: 's3', dir: 'both', labelKey: 'systems.s3' })
      if (mgmtChildren.length) {
        terminals.push({ id: 's4-children', wall: 'bottom', colorKey: 's4', dir: 'both', labelKey: 'systems.s4' })
      }
      terminals.push({ id: 's5-out', wall: 'top', colorKey: 's5', dir: 'both', labelKey: 'systems.s5' })
      break
    }
    case 's5': {
      if (parent && parent.type === 'management') {
        terminals.push({ id: 's5-parent', wall: 'top', colorKey: 's5', dir: 'both', labelKey: 'systems.s5' })
      }
      terminals.push({ id: 's3-in', wall: 'bottom', colorKey: 's3', dir: 'both', labelKey: 'systems.s3' })
      terminals.push({ id: 's4-in', wall: 'bottom', colorKey: 's4', dir: 'both', labelKey: 'systems.s4' })
      if (mgmtChildren.length) {
        terminals.push({ id: 's5-children', wall: 'bottom', colorKey: 's5', dir: 'both', labelKey: 'systems.s5' })
      }
      break
    }
  }

  return terminals
}

export function resolveTerminalConnections(node, systemKey, tree, tr) {
  if (!node) return {}
  const parent = findParent(tree, node.id)
  const children = node.children || []
  const mgmtChildren = children.filter(c => c.type === 'management')
  const opChildren = children.filter(c => c.type === 'operation')

  // Adjacent-neighbor sibling lookup — must match buildRoomTerminals exactly.
  const mgmtOrder = parent ? parent.children.filter(c => c.type === 'management') : []
  const myIdx = mgmtOrder.findIndex(c => c.id === node.id)
  const leftSibling = myIdx > 0 ? mgmtOrder[myIdx - 1] : null
  const rightSibling = myIdx >= 0 && myIdx < mgmtOrder.length - 1 ? mgmtOrder[myIdx + 1] : null

  const verb = (sysKey) => tr(`systems.${sysKey}verb`)
  const label = (n) => n.name || `${tr('nav.unit')} ${n.id.slice(0, 5)}`
  const entry = (n, sysKey) => ({ id: n.id, name: label(n), verb: verb(sysKey), systemKey: sysKey })

  const connections = {}

  switch (systemKey) {
    case 's1': {
      if (parent) connections['s3-in'] = [entry(parent, 's3')]
      if (parent) connections['s2-out'] = [entry(parent, 's2')]
      if (parent) connections['audit'] = [entry(parent, 's3')]
      break
    }
    case 's2': {
      if (parent && parent.type === 'management' && nodeHasS2(parent)) {
        connections['s2-parent'] = [entry(parent, 's2')]
      }
      if (opChildren.length) connections['s1-in'] = opChildren.map(c => entry(c, 's1'))
      const s2Children = mgmtChildren.filter(c => nodeHasS2(c))
      if (s2Children.length > 0) connections['s2-children'] = s2Children.map(c => entry(c, 's2'))
      connections['s3-out'] = [entry(node, 's3')]
      if (leftSibling) connections['s2-sibling-left'] = [entry(leftSibling, 's2')]
      if (rightSibling) connections['s2-sibling-right'] = [entry(rightSibling, 's2')]
      break
    }
    case 's3': {
      if (parent && parent.type === 'management') {
        connections['s3-parent'] = [entry(parent, 's3')]
      }
      if (mgmtChildren.length) connections['s3-children'] = mgmtChildren.map(c => entry(c, 's3'))
      connections['s4-out'] = [entry(node, 's4')]
      connections['s5-out'] = [entry(node, 's5')]
      if (nodeHasS2(node)) connections['s2-in'] = [entry(node, 's2')]
      const auditTargets = [...opChildren.map(c => entry(c, 's1')), ...mgmtChildren.map(c => entry(c, 's3'))]
      if (parent && parent.type === 'management') auditTargets.push(entry(parent, 's3'))
      if (auditTargets.length) connections['audit'] = auditTargets
      break
    }
    case 's4': {
      if (parent && parent.type === 'management') {
        connections['s4-parent'] = [entry(parent, 's4')]
      }
      connections['s3-in'] = [entry(node, 's3')]
      if (mgmtChildren.length) connections['s4-children'] = mgmtChildren.map(c => entry(c, 's4'))
      connections['s5-out'] = [entry(node, 's5')]
      break
    }
    case 's5': {
      if (parent && parent.type === 'management') {
        connections['s5-parent'] = [entry(parent, 's5')]
      }
      connections['s3-in'] = [entry(node, 's3')]
      connections['s4-in'] = [entry(node, 's4')]
      if (mgmtChildren.length) connections['s5-children'] = mgmtChildren.map(c => entry(c, 's5'))
      break
    }
  }

  return connections
}

// Enumerate every room the tree implies.
export function enumerateRooms(tree) {
  const rooms = []
  const walk = (node) => {
    if (node.type === 'operation') {
      rooms.push({ nodeId: node.id, systemKey: 's1' })
    } else {
      rooms.push({ nodeId: node.id, systemKey: 's3' })
      rooms.push({ nodeId: node.id, systemKey: 's4' })
      rooms.push({ nodeId: node.id, systemKey: 's5' })
      if (nodeHasS2(node)) {
        rooms.push({ nodeId: node.id, systemKey: 's2' })
      }
    }
    ;(node.children || []).forEach(walk)
  }
  walk(tree)
  return rooms
}

export function roomKey(nodeId, systemKey) {
  return `${nodeId}:${systemKey}`
}

// Find the source room's OUT terminal id that connects to (targetNodeId, targetSystemKey).
// Used to tag each forwarder with its source-side terminal for output routing.
function findSourceOutTerminalId(tree, sourceNodeId, sourceSystemKey, targetNodeId, targetSystemKey, findById) {
  const source = findById(sourceNodeId)
  if (!source) return null
  const terminals = buildRoomTerminals(source, sourceSystemKey, tree)
  const connections = resolveTerminalConnections(source, sourceSystemKey, tree, (k) => k)
  for (const term of terminals) {
    if (term.dir !== 'out' && term.dir !== 'both') continue
    const conns = connections[term.id] || []
    if (conns.some(c => c.id === targetNodeId && c.systemKey === targetSystemKey)) {
      return term.id
    }
  }
  return null
}

// Walk the tree and return
// { [targetRoomKey]: [{ sourceRoomKey, sourceTerminalId, terminalId, colorKey }, ...] }.
// Every 'in' or 'both' terminal contributes one subscription per connected source.
// sourceTerminalId is the OUT-side terminal on the source room (for output routing).
// terminalId is the IN-side terminal on the target room (for arrival stamping).
export function computeRoomSubscriptions(tree) {
  const identityTr = (k) => k
  const subs = {}

  const nodeByIdCache = new Map()
  const findById = (id, node = tree) => {
    if (nodeByIdCache.has(id)) return nodeByIdCache.get(id)
    if (node.id === id) { nodeByIdCache.set(id, node); return node }
    for (const child of (node.children || [])) {
      const hit = findById(id, child)
      if (hit) { nodeByIdCache.set(id, hit); return hit }
    }
    return null
  }

  for (const { nodeId, systemKey } of enumerateRooms(tree)) {
    const node = findById(nodeId)
    if (!node) continue
    const terminals = buildRoomTerminals(node, systemKey, tree)
    const connections = resolveTerminalConnections(node, systemKey, tree, identityTr)
    const target = roomKey(nodeId, systemKey)
    const inbound = []
    for (const term of terminals) {
      if (term.dir !== 'in' && term.dir !== 'both') continue
      const conns = connections[term.id] || []
      for (const conn of conns) {
        inbound.push({
          sourceRoomKey: roomKey(conn.id, conn.systemKey),
          sourceTerminalId: findSourceOutTerminalId(tree, conn.id, conn.systemKey, nodeId, systemKey, findById),
          terminalId: term.id,
          colorKey: term.colorKey,
        })
      }
    }
    if (inbound.length) subs[target] = inbound
  }

  return subs
}

// Invert: for each source, which rooms subscribe to it?
// Each entry's `terminalId` is the SOURCE-side (OUT) terminal — the one you'd
// see on the wall of the source room. Colors are taken from the target's
// matching terminal since that's what the target renders; source-side
// terminal color is the same in every VSM edge we define.
export function invertSubscriptions(subscriptions) {
  const inverted = {}
  for (const [targetKey, sources] of Object.entries(subscriptions)) {
    for (const src of sources) {
      if (!inverted[src.sourceRoomKey]) inverted[src.sourceRoomKey] = []
      inverted[src.sourceRoomKey].push({
        targetRoomKey: targetKey,
        terminalId: src.sourceTerminalId || src.terminalId,
        colorKey: src.colorKey,
      })
    }
  }
  return inverted
}
