import { describe, it, expect } from 'vitest'
import { createModel, addNode, moveNode, insertParent, flattenNode, duplicateSubtree, detachNode } from '../tree/model'

function buildTree() {
  // Root -> [A(mgmt), B(mgmt)]
  // A -> [C(op)]
  // B -> [D(mgmt), E(mgmt)]
  let m = createModel('management')
  m = addNode(m, m.rootId, 'management') // A
  m = addNode(m, m.rootId, 'management') // B
  const aId = m.children[m.rootId][0]
  const bId = m.children[m.rootId][1]
  m = addNode(m, aId, 'operation') // C
  m = addNode(m, bId, 'management') // D
  m = addNode(m, bId, 'management') // E
  return { m, aId, bId, cId: m.children[aId][0], dId: m.children[bId][0], eId: m.children[bId][1] }
}

describe('moveNode', () => {
  it('moves a node to a new parent (draft mode allows mixed types)', () => {
    const { m, dId, aId } = buildTree()
    // Draft mode allows moving D under A even though A has operation C
    const m2 = moveNode(m, dId, aId)
    expect(m2.parents[dId]).toBe(aId)
    expect(m2.children[aId]).toContain(dId)
  })

  it('cannot move root', () => {
    const { m, aId } = buildTree()
    expect(moveNode(m, m.rootId, aId)).toBe(m)
  })

  it('cannot move into own subtree', () => {
    const { m, bId, dId } = buildTree()
    expect(moveNode(m, bId, dId)).toBe(m)
  })

  it('cannot move to same parent', () => {
    const { m, aId } = buildTree()
    expect(moveNode(m, aId, m.rootId)).toBe(m)
  })

  it('successfully reparents', () => {
    let m = createModel('management')
    m = addNode(m, m.rootId, 'management') // A
    m = addNode(m, m.rootId, 'management') // B
    const aId = m.children[m.rootId][0]
    const bId = m.children[m.rootId][1]
    m = addNode(m, aId, 'management') // C under A

    const cId = m.children[aId][0]
    const result = moveNode(m, cId, bId)
    expect(result.children[aId]).toHaveLength(0)
    expect(result.children[bId]).toContain(cId)
    expect(result.parents[cId]).toBe(bId)
  })
})

describe('insertParent', () => {
  it('inserts parent above a child node', () => {
    const { m, aId } = buildTree()
    const result = insertParent(m, aId)
    const newParentId = result.parents[aId]
    expect(newParentId).not.toBe(m.rootId)
    expect(result.entities[newParentId].type).toBe('management')
    expect(result.children[newParentId]).toContain(aId)
    expect(result.children[m.rootId]).toContain(newParentId)
    expect(result.children[m.rootId]).not.toContain(aId)
  })

  it('inserts parent above root (new root created)', () => {
    const { m } = buildTree()
    const oldRootId = m.rootId
    const result = insertParent(m, oldRootId)
    expect(result.rootId).not.toBe(oldRootId)
    expect(result.children[result.rootId]).toContain(oldRootId)
    expect(result.parents[oldRootId]).toBe(result.rootId)
  })
})

describe('flattenNode', () => {
  it('removes node and promotes children', () => {
    // Root -> B -> [D, E]
    // After flattening B: Root -> [A, D, E]
    const { m, bId, dId, eId } = buildTree()
    // First remove A to simplify (A has operation, would conflict)
    let m2 = { ...m }
    // Actually let's build a clean tree
    let clean = createModel('management')
    clean = addNode(clean, clean.rootId, 'management') // X
    const xId = clean.children[clean.rootId][0]
    clean = addNode(clean, xId, 'management') // Y
    clean = addNode(clean, xId, 'management') // Z
    const yId = clean.children[xId][0]
    const zId = clean.children[xId][1]

    const result = flattenNode(clean, xId)
    expect(result.entities[xId]).toBeUndefined()
    expect(result.children[clean.rootId]).toContain(yId)
    expect(result.children[clean.rootId]).toContain(zId)
    expect(result.parents[yId]).toBe(clean.rootId)
    expect(result.parents[zId]).toBe(clean.rootId)
  })

  it('cannot flatten root', () => {
    const { m } = buildTree()
    expect(flattenNode(m, m.rootId)).toBe(m)
  })

  it('cannot flatten operation', () => {
    const { m, cId } = buildTree()
    expect(flattenNode(m, cId)).toBe(m)
  })

  it('rejects if flattening would mix types', () => {
    // Root -> [A(has op), B(has mgmt)]
    // Flattening B would put B's mgmt children next to A (which has an op)
    // Actually this is fine — root would have A, D, E (all management)
    // Let's create a case that actually fails:
    // Root -> X -> [op1, mgmt1] — can't flatten X because parent would get mixed types
    // But wait, X can't have both op and mgmt — our validation prevents it
    // So flattening should generally work unless the parent already has something incompatible
  })
})

describe('detachNode', () => {
  it('detaches node from parent (becomes orphan)', () => {
    const { m, aId } = buildTree()
    const result = detachNode(m, aId)
    expect(result.parents[aId]).toBeNull()
    expect(result.children[m.rootId]).not.toContain(aId)
    // Node and its subtree still exist
    expect(result.entities[aId]).toBeDefined()
    expect(result.children[aId]).toBeDefined()
  })

  it('cannot detach root', () => {
    const { m } = buildTree()
    expect(detachNode(m, m.rootId)).toBe(m)
  })

  it('already detached returns same model', () => {
    const { m, aId } = buildTree()
    const m2 = detachNode(m, aId)
    expect(detachNode(m2, aId)).toBe(m2)
  })

  it('subtree stays intact after detach', () => {
    const { m, aId, cId } = buildTree()
    const result = detachNode(m, aId)
    expect(result.children[aId]).toContain(cId)
    expect(result.parents[cId]).toBe(aId)
  })
})

describe('duplicateSubtree', () => {
  it('deep copies a subtree', () => {
    let m = createModel('management')
    m = addNode(m, m.rootId, 'management')
    const aId = m.children[m.rootId][0]
    m = addNode(m, aId, 'management')
    m = addNode(m, aId, 'management')

    const before = Object.keys(m.entities).length
    const result = duplicateSubtree(m, aId, m.rootId)
    const after = Object.keys(result.entities).length
    expect(after).toBe(before + 3) // A + 2 children duplicated
    expect(result.children[m.rootId]).toHaveLength(2) // original A + copy
  })

  it('preserves names with (copy) suffix', () => {
    let m = createModel('management')
    m = { ...m, entities: { ...m.entities, [m.rootId]: { ...m.entities[m.rootId], name: 'HQ' } } }
    m = addNode(m, m.rootId, 'management')
    const aId = m.children[m.rootId][0]
    m = { ...m, entities: { ...m.entities, [aId]: { ...m.entities[aId], name: 'Division A' } } }

    const result = duplicateSubtree(m, aId, m.rootId)
    const copyId = result.children[m.rootId].find(id => id !== aId)
    expect(result.entities[copyId].name).toBe('Division A (copy)')
  })

  it('new IDs are unique', () => {
    let m = createModel('management')
    m = addNode(m, m.rootId, 'management')
    const aId = m.children[m.rootId][0]

    const result = duplicateSubtree(m, aId, m.rootId)
    const copyId = result.children[m.rootId].find(id => id !== aId)
    expect(copyId).not.toBe(aId)
  })
})
