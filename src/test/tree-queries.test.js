import { describe, it, expect } from 'vitest'
import { createModel, addNode } from '../tree/model'
import { buildRenderTree, findNode, containsNode, nodeHasS2, findParent, flattenTree, getLastNode, getTreeBounds } from '../tree/index'

function buildTestTree() {
  // Root -> [A (mgmt), B (mgmt)]
  // A -> [C (op)]
  // B -> [D (mgmt), E (mgmt)]
  let m = createModel('management')
  m = addNode(m, m.rootId, 'management') // A
  m = addNode(m, m.rootId, 'management') // B
  const aId = m.children[m.rootId][0]
  const bId = m.children[m.rootId][1]
  m = addNode(m, aId, 'operation') // C
  m = addNode(m, bId, 'management') // D
  m = addNode(m, bId, 'management') // E
  return { model: m, tree: buildRenderTree(m) }
}

describe('buildRenderTree', () => {
  it('builds a tree with correct structure', () => {
    const { tree } = buildTestTree()
    expect(tree.type).toBe('management')
    expect(tree.children).toHaveLength(2)
    expect(tree.children[0].type).toBe('management')
    expect(tree.children[1].type).toBe('management')
    expect(tree.children[0].children[0].type).toBe('operation')
    expect(tree.children[1].children).toHaveLength(2)
  })

  it('assigns layout positions', () => {
    const { tree } = buildTestTree()
    expect(tree.x).toBeDefined()
    expect(tree.layer).toBe(-0) // root is depth 0, layout sets -depth
    expect(tree.children[0].layer).toBe(-1)
    expect(tree.children[0].children[0].layer).toBe(-2)
  })
})

describe('findNode', () => {
  it('finds root', () => {
    const { tree } = buildTestTree()
    expect(findNode(tree, tree.id)).toBe(tree)
  })

  it('finds deep node', () => {
    const { tree } = buildTestTree()
    const op = tree.children[0].children[0]
    expect(findNode(tree, op.id)).toBe(op)
  })

  it('returns null for missing id', () => {
    const { tree } = buildTestTree()
    expect(findNode(tree, 'nonexistent')).toBeNull()
  })
})

describe('containsNode', () => {
  it('root contains itself', () => {
    const { tree } = buildTestTree()
    expect(containsNode(tree, tree.id)).toBe(true)
  })

  it('root contains descendant', () => {
    const { tree } = buildTestTree()
    const deep = tree.children[1].children[0]
    expect(containsNode(tree, deep.id)).toBe(true)
  })

  it('sibling does not contain other branch', () => {
    const { tree } = buildTestTree()
    const a = tree.children[0]
    const d = tree.children[1].children[0]
    expect(containsNode(a, d.id)).toBe(false)
  })
})

describe('nodeHasS2', () => {
  it('operation has S2', () => {
    const { tree } = buildTestTree()
    const op = tree.children[0].children[0]
    expect(nodeHasS2(op)).toBe(true)
  })

  it('management with operation descendant has S2', () => {
    const { tree } = buildTestTree()
    expect(nodeHasS2(tree.children[0])).toBe(true)
  })

  it('management without operations does not have S2', () => {
    const { tree } = buildTestTree()
    // B -> [D, E] (both management, no operations)
    expect(nodeHasS2(tree.children[1])).toBe(false)
  })

  it('root has S2 if any descendant has operations', () => {
    const { tree } = buildTestTree()
    expect(nodeHasS2(tree)).toBe(true)
  })
})

describe('findParent', () => {
  it('root has no parent', () => {
    const { tree } = buildTestTree()
    expect(findParent(tree, tree.id)).toBeNull()
  })

  it('finds parent of child', () => {
    const { tree } = buildTestTree()
    const a = tree.children[0]
    expect(findParent(tree, a.id)).toBe(tree)
  })

  it('finds parent of deep node', () => {
    const { tree } = buildTestTree()
    const op = tree.children[0].children[0]
    expect(findParent(tree, op.id)).toBe(tree.children[0])
  })
})

describe('flattenTree', () => {
  it('flattens in depth-first order', () => {
    const { tree } = buildTestTree()
    const flat = flattenTree(tree)
    expect(flat[0]).toBe(tree)
    expect(flat[1]).toBe(tree.children[0])
    expect(flat[2]).toBe(tree.children[0].children[0]) // operation
    expect(flat[3]).toBe(tree.children[1])
    expect(flat.length).toBe(6) // root + A + C + B + D + E
  })
})

describe('getLastNode', () => {
  it('returns deepest rightmost node', () => {
    const { tree } = buildTestTree()
    const last = getLastNode(tree)
    // B -> [D, E], E is last
    expect(last).toBe(tree.children[1].children[1])
  })
})

describe('getTreeBounds', () => {
  it('returns bounding box', () => {
    const { tree } = buildTestTree()
    const bounds = getTreeBounds(tree)
    expect(bounds.minX).toBeDefined()
    expect(bounds.maxX).toBeDefined()
    expect(bounds.maxX).toBeGreaterThanOrEqual(bounds.minX)
    expect(bounds.maxY).toBeGreaterThanOrEqual(bounds.minY)
  })
})
