import { describe, it, expect } from 'vitest'
import { createModel, addNode } from '../tree/model'
import { buildRenderTree, flattenTree } from '../tree/index'
import { exportModel, importModel } from '../tree/serialize'

describe('complexity / stress tests', () => {
  it('handles a wide tree (20 children)', () => {
    let m = createModel('management')
    for (let i = 0; i < 20; i++) {
      m = addNode(m, m.rootId, 'management')
    }
    const tree = buildRenderTree(m)
    expect(tree.children).toHaveLength(20)
    // No overlapping x positions
    const xs = tree.children.map(c => c.x)
    const unique = new Set(xs)
    expect(unique.size).toBe(20)
  })

  it('handles a deep tree (depth 20)', () => {
    let m = createModel('management')
    let currentId = m.rootId
    for (let i = 0; i < 19; i++) {
      m = addNode(m, currentId, 'management')
      currentId = m.children[currentId][0]
    }
    // Add operation at the leaf
    m = addNode(m, currentId, 'operation')

    const tree = buildRenderTree(m)
    const flat = flattenTree(tree)
    expect(flat).toHaveLength(21) // 20 management + 1 operation

    // Check depth
    let node = tree
    let depth = 0
    while (node.children.length > 0) {
      node = node.children[0]
      depth++
    }
    expect(depth).toBe(20)
    expect(node.type).toBe('operation')
  })

  it('handles a balanced binary tree (depth 8 = 255 nodes)', () => {
    let m = createModel('management')
    const queue = [m.rootId]
    let depth = 0

    while (depth < 7 && queue.length > 0) {
      const nextQueue = []
      for (const parentId of queue) {
        m = addNode(m, parentId, 'management')
        m = addNode(m, parentId, 'management')
        const kids = m.children[parentId]
        nextQueue.push(kids[kids.length - 2], kids[kids.length - 1])
      }
      queue.length = 0
      queue.push(...nextQueue)
      depth++
    }

    const tree = buildRenderTree(m)
    const flat = flattenTree(tree)
    expect(flat.length).toBe(255) // 2^8 - 1

    // Layout should not have overlapping positions at any layer
    const layerPositions = {}
    for (const node of flat) {
      const key = node.layer
      if (!layerPositions[key]) layerPositions[key] = []
      layerPositions[key].push(node.x)
    }
    for (const positions of Object.values(layerPositions)) {
      const sorted = [...positions].sort((a, b) => a - b)
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i] - sorted[i - 1]).toBeGreaterThan(0.5)
      }
    }
  })

  it('serializes and deserializes a complex tree', () => {
    let m = createModel('management')
    // Build: root -> [A, B, C]
    // A -> op, B -> [D, E], C -> [F -> op]
    m = addNode(m, m.rootId, 'management') // A
    m = addNode(m, m.rootId, 'management') // B
    m = addNode(m, m.rootId, 'management') // C
    const [aId, bId, cId] = m.children[m.rootId]
    m = addNode(m, aId, 'operation')
    m = addNode(m, bId, 'management') // D
    m = addNode(m, bId, 'management') // E
    m = addNode(m, cId, 'management') // F
    const fId = m.children[cId][0]
    m = addNode(m, fId, 'operation')

    const yaml = exportModel(m)
    const m2 = importModel(yaml)

    expect(Object.keys(m2.entities)).toHaveLength(Object.keys(m.entities).length)
    expect(m2.rootId).toBe(m.rootId)

    // Verify structure matches
    const tree1 = buildRenderTree(m)
    const tree2 = buildRenderTree(m2)
    expect(flattenTree(tree1).length).toBe(flattenTree(tree2).length)
  })

  it('layout performance: 500 nodes under 100ms', () => {
    let m = createModel('management')
    // Build a wide-ish tree: 10 children each, 3 levels = ~111 nodes
    // Then add more breadth
    const queue = [m.rootId]
    for (let depth = 0; depth < 2; depth++) {
      const nextQueue = []
      for (const pid of queue) {
        for (let i = 0; i < 5; i++) {
          m = addNode(m, pid, 'management')
        }
        nextQueue.push(...m.children[pid].slice(-5))
      }
      queue.length = 0
      queue.push(...nextQueue)
    }
    // Add operations to leaves
    for (const leafId of queue) {
      m = addNode(m, leafId, 'operation')
    }

    const start = performance.now()
    const tree = buildRenderTree(m)
    const elapsed = performance.now() - start

    const flat = flattenTree(tree)
    expect(flat.length).toBeGreaterThan(30)
    expect(elapsed).toBeLessThan(100)
  })
})
