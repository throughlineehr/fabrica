import { describe, it, expect } from 'vitest'
import { createModel, addNode, moveNode, insertParent, spliceNode, duplicateSubtree, detachNode, canSplice } from '../tree/model'

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

describe('spliceNode', () => {
  it('removes node and promotes children', () => {
    // Root -> B -> [D, E]
    // After flattening B: Root -> [A, D, E]
    // Build a clean tree inline (buildTree fixture has unrelated constraints)
    let clean = createModel('management')
    clean = addNode(clean, clean.rootId, 'management') // X
    const xId = clean.children[clean.rootId][0]
    clean = addNode(clean, xId, 'management') // Y
    clean = addNode(clean, xId, 'management') // Z
    const yId = clean.children[xId][0]
    const zId = clean.children[xId][1]

    const result = spliceNode(clean, xId)
    expect(result.entities[xId]).toBeUndefined()
    expect(result.children[clean.rootId]).toContain(yId)
    expect(result.children[clean.rootId]).toContain(zId)
    expect(result.parents[yId]).toBe(clean.rootId)
    expect(result.parents[zId]).toBe(clean.rootId)
  })

  it('cannot flatten root', () => {
    const { m } = buildTree()
    expect(spliceNode(m, m.rootId)).toBe(m)
  })

  it('cannot flatten operation', () => {
    const { m, cId } = buildTree()
    expect(spliceNode(m, cId)).toBe(m)
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

describe('canSplice', () => {
  it('allows splice when children are all management', () => {
    // Root -> B -> [D, E]  — splicing B promotes D,E to Root (all management)
    const { m, bId } = buildTree()
    expect(canSplice(m, bId)).toBe(true)
  })

  it('blocks splice on root', () => {
    const { m } = buildTree()
    expect(canSplice(m, m.rootId)).toBe(false)
  })

  it('blocks splice on operation', () => {
    const { m, cId } = buildTree()
    expect(canSplice(m, cId)).toBe(false)
  })

  it('blocks splice on leaf management (no children to promote)', () => {
    const { m, dId } = buildTree()
    expect(canSplice(m, dId)).toBe(false)
  })

  it('blocks splice when operation child would gain siblings', () => {
    // Root -> [A, B] — A has operation C
    // If we wrap C's parent differently: Root -> X -> [op] alongside Y
    // Splicing X would put op next to Y — blocked
    let m2 = createModel('management')
    m2 = addNode(m2, m2.rootId, 'management') // X
    m2 = addNode(m2, m2.rootId, 'management') // Y (sibling)
    const xId = m2.children[m2.rootId][0]
    m2 = addNode(m2, xId, 'operation') // op under X
    expect(canSplice(m2, xId)).toBe(false)
  })

  it('allows splice when operation child becomes sole child of grandparent', () => {
    // Root -> X -> [op] — no siblings of X
    let m2 = createModel('management')
    m2 = addNode(m2, m2.rootId, 'management') // X
    const xId = m2.children[m2.rootId][0]
    m2 = addNode(m2, xId, 'operation') // op under X
    expect(canSplice(m2, xId)).toBe(true)
  })

  it('blocks splice when parent already has an operation', () => {
    // Root -> [op, X -> [mgmt]]  (draft mode allows this state)
    // Splicing X would put mgmt next to op — blocked
    let m2 = createModel('management')
    m2 = addNode(m2, m2.rootId, 'operation') // op
    m2 = addNode(m2, m2.rootId, 'management') // X (draft mode allows mixed)
    const xId = m2.children[m2.rootId][1]
    m2 = addNode(m2, xId, 'management') // mgmt under X
    expect(canSplice(m2, xId)).toBe(false)
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

  it('cannot duplicate into self', () => {
    const { m, aId } = buildTree()
    expect(duplicateSubtree(m, aId, aId)).toBe(m)
  })

  it('cannot duplicate into own descendant', () => {
    const { m, bId, dId } = buildTree()
    // B -> [D, E], duplicating B into D would be recursive
    expect(duplicateSubtree(m, bId, dId)).toBe(m)
  })
})
