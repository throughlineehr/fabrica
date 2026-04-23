import { describe, it, expect } from 'vitest'
import { createModel, addNode } from '../tree/model'
import { buildRenderTree } from '../tree/index'
import { computeRoomSubscriptions, invertSubscriptions, enumerateRooms, roomKey } from '../signals/topology'

// Build a tree: Root(mgmt) → A(mgmt) → op1
// Root has one management child A, A has one operation child op1.
function twoLevelTree() {
  let m = createModel('management')
  m = addNode(m, m.rootId, 'management')
  const aId = m.children[m.rootId][0]
  m = addNode(m, aId, 'operation')
  const op1 = m.children[aId][0]
  return { tree: buildRenderTree(m), rootId: m.rootId, aId, op1 }
}

describe('terminal bidirectionality', () => {
  it('every terminal of every room is dir: both', async () => {
    const { buildRoomTerminals } = await import('../signals/topology')
    const { tree } = twoLevelTree()
    const walk = (node) => {
      const systems = node.type === 'operation' ? ['s1'] : ['s3', 's4', 's5', 's2']
      for (const sys of systems) {
        for (const term of buildRoomTerminals(node, sys, tree)) {
          expect(term.dir).toBe('both')
        }
      }
      ;(node.children || []).forEach(walk)
    }
    walk(tree)
  })

  it('child management rooms have parent-pointing terminals for s3/s4/s5', async () => {
    const { buildRoomTerminals } = await import('../signals/topology')
    const { tree, aId } = twoLevelTree()
    const aNode = tree.children[0]
    expect(aNode.id).toBe(aId)
    const s3 = buildRoomTerminals(aNode, 's3', tree)
    const s4 = buildRoomTerminals(aNode, 's4', tree)
    const s5 = buildRoomTerminals(aNode, 's5', tree)
    expect(s3.some(t => t.id === 's3-parent')).toBe(true)
    expect(s4.some(t => t.id === 's4-parent')).toBe(true)
    expect(s5.some(t => t.id === 's5-parent')).toBe(true)
  })

  it('every cable color on the parent side has a matching cable color on the child side', async () => {
    // Symmetry check: if parent's room has a terminal pointing to the child,
    // the child's corresponding room has a terminal pointing back.
    const { buildRoomTerminals, resolveTerminalConnections } = await import('../signals/topology')
    const { tree } = twoLevelTree()
    const identityTr = (k) => k

    const forEachEdge = (node, systemKey) => {
      const terminals = buildRoomTerminals(node, systemKey, tree)
      const connections = resolveTerminalConnections(node, systemKey, tree, identityTr)
      const edges = []
      for (const term of terminals) {
        const peers = connections[term.id] || []
        for (const peer of peers) {
          edges.push({ from: { nodeId: node.id, systemKey }, to: peer })
        }
      }
      return edges
    }

    const checkReverse = (edge) => {
      // Find peer's terminals and see if any point back to `from`
      const findNode = (id, n = tree) => {
        if (n.id === id) return n
        for (const c of n.children || []) { const h = findNode(id, c); if (h) return h }
        return null
      }
      const peerNode = findNode(edge.to.id)
      if (!peerNode) return false
      const terms = buildRoomTerminals(peerNode, edge.to.systemKey, tree)
      const conns = resolveTerminalConnections(peerNode, edge.to.systemKey, tree, identityTr)
      for (const term of terms) {
        const peers = conns[term.id] || []
        if (peers.some(p => p.id === edge.from.nodeId && p.systemKey === edge.from.systemKey)) {
          return true
        }
      }
      return false
    }

    // Walk every edge of every room and verify the reverse direction exists.
    const nodes = [tree, tree.children[0]] // root, A
    for (const n of nodes) {
      for (const sys of ['s3', 's4', 's5', 's2']) {
        for (const edge of forEachEdge(n, sys)) {
          expect(checkReverse(edge), `missing reverse for ${edge.from.systemKey} of ${edge.from.nodeId.slice(0,5)} → ${edge.to.systemKey} of ${edge.to.id.slice(0,5)}`).toBe(true)
        }
      }
    }
    // Don't assert for op (s1) — we already know ops reach parents via s3-in/s2-out/audit
  })
})

describe('enumerateRooms', () => {
  it('returns s3/s4/s5 for management and s1 for operation; s2 only when hasS2', () => {
    const { tree, rootId, aId, op1 } = twoLevelTree()
    const rooms = enumerateRooms(tree)
    const keys = rooms.map(r => roomKey(r.nodeId, r.systemKey)).sort()

    // Root and A are management: each has s3/s4/s5, plus s2 since they have ops in subtree
    // op1 is an operation: has s1
    expect(keys).toContain(`${rootId}:s3`)
    expect(keys).toContain(`${rootId}:s4`)
    expect(keys).toContain(`${rootId}:s5`)
    expect(keys).toContain(`${rootId}:s2`) // has op in subtree (via A/op1)
    expect(keys).toContain(`${aId}:s3`)
    expect(keys).toContain(`${aId}:s4`)
    expect(keys).toContain(`${aId}:s5`)
    expect(keys).toContain(`${aId}:s2`) // has direct op
    expect(keys).toContain(`${op1}:s1`)
  })
})

describe('computeRoomSubscriptions', () => {
  it('each subscription records both the source OUT terminal and target IN terminal (when defined)', () => {
    const { tree, rootId } = twoLevelTree()
    const topo = computeRoomSubscriptions(tree)
    // Root's S4 subscribes to Root's S5 via Root's own 's5-out' terminal (on s4)
    // and Root's S5 has 's4-in' terminal as the source side.
    const entry = (topo[`${rootId}:s4`] || []).find(s => s.sourceRoomKey === `${rootId}:s5`)
    expect(entry).toBeTruthy()
    expect(entry.terminalId).toBe('s5-out')          // target's in-side terminal
    expect(entry.sourceTerminalId).toBe('s4-in')     // source's out-side terminal
  })

  it('S4 subscribes to S5 of same unit, S3 of same unit, child S4s', () => {
    const { tree, rootId, aId } = twoLevelTree()
    const topo = computeRoomSubscriptions(tree)
    const rootS4Sources = (topo[`${rootId}:s4`] || []).map(s => s.sourceRoomKey)
    expect(rootS4Sources).toContain(`${rootId}:s5`)
    expect(rootS4Sources).toContain(`${rootId}:s3`)
    expect(rootS4Sources).toContain(`${aId}:s4`)
  })

  it('S5 subscribes to S3 and S4 of same unit, and child S5s', () => {
    const { tree, rootId, aId } = twoLevelTree()
    const topo = computeRoomSubscriptions(tree)
    const rootS5Sources = (topo[`${rootId}:s5`] || []).map(s => s.sourceRoomKey)
    expect(rootS5Sources).toContain(`${rootId}:s3`)
    expect(rootS5Sources).toContain(`${rootId}:s4`)
    expect(rootS5Sources).toContain(`${aId}:s5`)
  })

  it('S3 subscribes to S4, S5, and child management S3s', () => {
    const { tree, rootId, aId } = twoLevelTree()
    const topo = computeRoomSubscriptions(tree)
    const rootS3Sources = (topo[`${rootId}:s3`] || []).map(s => s.sourceRoomKey)
    expect(rootS3Sources).toContain(`${rootId}:s4`)
    expect(rootS3Sources).toContain(`${rootId}:s5`)
    expect(rootS3Sources).toContain(`${aId}:s3`)
  })

  it('S1 of operation subscribes to parent S3', () => {
    const { tree, aId, op1 } = twoLevelTree()
    const topo = computeRoomSubscriptions(tree)
    const op1S1Sources = (topo[`${op1}:s1`] || []).map(s => s.sourceRoomKey)
    expect(op1S1Sources).toContain(`${aId}:s3`)
  })

  it('topology updates when a management child is replaced with an operation', () => {
    // Before: Root → A(mgmt) → op1. Root's S3 subscribes to A's S3.
    const { tree: before, rootId: beforeRoot, aId } = twoLevelTree()
    const beforeTopo = computeRoomSubscriptions(before)
    expect((beforeTopo[`${beforeRoot}:s3`] || []).some(s => s.sourceRoomKey === `${aId}:s3`)).toBe(true)

    // After: Root → op (single direct operation child).
    let m = createModel('management')
    m = addNode(m, m.rootId, 'operation')
    const afterRoot = m.rootId
    const opId = m.children[afterRoot][0]
    const after = buildRenderTree(m)
    const afterTopo = computeRoomSubscriptions(after)

    // No more A → so no subscription from root to A:s3
    const rootS3Sources = (afterTopo[`${afterRoot}:s3`] || []).map(s => s.sourceRoomKey)
    expect(rootS3Sources.some(s => s.startsWith(aId))).toBe(false)

    // Root's S3 now reaches the operation's S1 via the audit terminal
    expect(rootS3Sources).toContain(`${opId}:s1`)
  })
})

describe('S2 topology — CRC chain + adjacent siblings', () => {
  function twoChildrenTree() {
    // Root(mgmt) → [A(mgmt) → op1, B(mgmt) → op2]
    let m = createModel('management')
    m = addNode(m, m.rootId, 'management')
    const aId = m.children[m.rootId][0]
    m = addNode(m, m.rootId, 'management')
    const bId = m.children[m.rootId][1]
    m = addNode(m, aId, 'operation')
    m = addNode(m, bId, 'operation')
    return { tree: buildRenderTree(m), rootId: m.rootId, aId, bId }
  }

  function threeChildrenTree() {
    // Root → [A, B, C] each with an op
    let m = createModel('management')
    m = addNode(m, m.rootId, 'management')
    m = addNode(m, m.rootId, 'management')
    m = addNode(m, m.rootId, 'management')
    const [aId, bId, cId] = m.children[m.rootId]
    m = addNode(m, aId, 'operation')
    m = addNode(m, bId, 'operation')
    m = addNode(m, cId, 'operation')
    return { tree: buildRenderTree(m), rootId: m.rootId, aId, bId, cId }
  }

  it('s2-parent exists when parent management has S2', async () => {
    const { buildRoomTerminals } = await import('../signals/topology')
    const { tree, aId } = twoLevelTree()  // Root → A(mgmt) → op1
    const aNode = tree.children.find(c => c.id === aId)
    const s2Terminals = buildRoomTerminals(aNode, 's2', tree)
    expect(s2Terminals.some(t => t.id === 's2-parent')).toBe(true)
  })

  it('s2-children exists when a direct mgmt child has S2', async () => {
    const { buildRoomTerminals } = await import('../signals/topology')
    const { tree } = twoLevelTree()
    const rootS2 = buildRoomTerminals(tree, 's2', tree)
    expect(rootS2.some(t => t.id === 's2-children')).toBe(true)
  })

  it('one sibling: first child has right only, last child has left only', async () => {
    const { buildRoomTerminals } = await import('../signals/topology')
    const { tree, aId, bId } = twoChildrenTree()
    const aNode = tree.children.find(c => c.id === aId)
    const bNode = tree.children.find(c => c.id === bId)
    const aS2 = buildRoomTerminals(aNode, 's2', tree)
    const bS2 = buildRoomTerminals(bNode, 's2', tree)
    expect(aS2.some(t => t.id === 's2-sibling-left')).toBe(false)
    expect(aS2.some(t => t.id === 's2-sibling-right')).toBe(true)
    expect(bS2.some(t => t.id === 's2-sibling-left')).toBe(true)
    expect(bS2.some(t => t.id === 's2-sibling-right')).toBe(false)
  })

  it('three siblings: middle child has both left and right, endpoints have one each', async () => {
    const { buildRoomTerminals } = await import('../signals/topology')
    const { tree, aId, bId, cId } = threeChildrenTree()
    const [aNode, bNode, cNode] = [aId, bId, cId].map(id => tree.children.find(c => c.id === id))
    const aS2 = buildRoomTerminals(aNode, 's2', tree)
    const bS2 = buildRoomTerminals(bNode, 's2', tree)
    const cS2 = buildRoomTerminals(cNode, 's2', tree)
    // A: endpoint left, only right
    expect(aS2.some(t => t.id === 's2-sibling-left')).toBe(false)
    expect(aS2.some(t => t.id === 's2-sibling-right')).toBe(true)
    // B: middle, both
    expect(bS2.some(t => t.id === 's2-sibling-left')).toBe(true)
    expect(bS2.some(t => t.id === 's2-sibling-right')).toBe(true)
    // C: endpoint right, only left
    expect(cS2.some(t => t.id === 's2-sibling-left')).toBe(true)
    expect(cS2.some(t => t.id === 's2-sibling-right')).toBe(false)
  })

  it('sibling wiring is symmetric: A.right peer === B, B.left peer === A', async () => {
    const { buildRoomTerminals, resolveTerminalConnections } = await import('../signals/topology')
    const { tree, aId, bId } = twoChildrenTree()
    const aNode = tree.children.find(c => c.id === aId)
    const bNode = tree.children.find(c => c.id === bId)
    const identityTr = (k) => k
    void buildRoomTerminals(aNode, 's2', tree)
    const aConn = resolveTerminalConnections(aNode, 's2', tree, identityTr)
    const bConn = resolveTerminalConnections(bNode, 's2', tree, identityTr)
    expect(aConn['s2-sibling-right']?.[0]?.id).toBe(bId)
    expect(bConn['s2-sibling-left']?.[0]?.id).toBe(aId)
  })
})

describe('invertSubscriptions', () => {
  it('returns per-source lists of who subscribes to that source', () => {
    const { tree, rootId, aId } = twoLevelTree()
    const topo = computeRoomSubscriptions(tree)
    const inverted = invertSubscriptions(topo)
    // A's S5 is subscribed-to by Root's S5 (s5-children terminal)
    const aS5Subscribers = (inverted[`${aId}:s5`] || []).map(e => e.targetRoomKey)
    expect(aS5Subscribers).toContain(`${rootId}:s5`)
  })
})
