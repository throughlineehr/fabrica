import { describe, it, expect } from 'vitest'
import { createModel, addNode, renameNode, validateModel, createOrphan } from '../tree/model'

describe('validateModel', () => {
  it('clean model has only unnamed warnings', () => {
    let m = createModel('management')
    m = renameNode(m, m.rootId, 'HQ')
    m = addNode(m, m.rootId, 'management')
    const childId = m.children[m.rootId][0]
    m = renameNode(m, childId, 'Division')
    m = addNode(m, childId, 'operation')
    const opId = m.children[childId][0]
    m = renameNode(m, opId, 'Widget Factory')

    const issues = validateModel(m)
    expect(issues).toHaveLength(0)
  })

  it('detects unnamed nodes', () => {
    const m = createModel('management')
    const issues = validateModel(m)
    expect(issues.some(i => i.type === 'unnamed')).toBe(true)
  })

  it('detects mixed children', () => {
    let m = createModel('management')
    m = addNode(m, m.rootId, 'management')
    m = addNode(m, m.rootId, 'operation') // draft mode allows this
    const issues = validateModel(m)
    expect(issues.some(i => i.type === 'mixed-children')).toBe(true)
  })

  it('detects multiple operations', () => {
    let m = createModel('management')
    m = addNode(m, m.rootId, 'operation')
    m = addNode(m, m.rootId, 'operation') // draft mode allows this
    const issues = validateModel(m)
    expect(issues.some(i => i.type === 'multiple-operations')).toBe(true)
  })

  it('detects empty management', () => {
    let m = createModel('management')
    m = addNode(m, m.rootId, 'management')
    const issues = validateModel(m)
    expect(issues.some(i => i.type === 'empty-management')).toBe(true)
  })

  it('detects orphans', () => {
    let m = createModel('management')
    const { model: m2, nodeId } = createOrphan(m, 'operation', 'Lost Node')
    const issues = validateModel(m2)
    expect(issues.some(i => i.type === 'orphan' && i.nodeId === nodeId)).toBe(true)
  })
})

describe('createOrphan', () => {
  it('creates a disconnected node', () => {
    const m = createModel('management')
    const { model: m2, nodeId } = createOrphan(m, 'operation', 'Standalone')
    expect(m2.entities[nodeId].type).toBe('operation')
    expect(m2.entities[nodeId].name).toBe('Standalone')
    expect(m2.parents[nodeId]).toBeNull()
    expect(m2.children[nodeId]).toEqual([])
  })
})

describe('validateModel — edge cases', () => {
  it('root-only management is valid (apart from being unnamed)', () => {
    // A bare model is unnamed; that's the only issue.
    const m = createModel('management')
    const issues = validateModel(m)
    // Just unnamed — no orphan, no empty-management on the root
    // (the root itself is what the validator considers "the tree").
    const types = new Set(issues.map(i => i.type))
    expect(types.has('unnamed')).toBe(true)
    expect(types.has('orphan')).toBe(false)
  })

  it('multiple orphans are each reported', () => {
    let m = createModel('management')
    m = renameNode(m, m.rootId, 'HQ')
    const { model: m1, nodeId: oA } = createOrphan(m, 'operation', 'OrphA')
    const { model: m2, nodeId: oB } = createOrphan(m1, 'management', 'OrphB')
    const issues = validateModel(m2)
    const orphanIds = issues.filter(i => i.type === 'orphan').map(i => i.nodeId)
    expect(orphanIds).toContain(oA)
    expect(orphanIds).toContain(oB)
  })

  it('operation with children is invalid (operations are leaves)', () => {
    // Build a model where an operation has been wedged with a child via
    // direct map manipulation (bypassing addNode's leaf rule on operations).
    let m = createModel('management')
    m = renameNode(m, m.rootId, 'HQ')
    m = addNode(m, m.rootId, 'operation')
    const opId = m.children[m.rootId][0]
    // Inject an illegitimate child under the operation.
    const childId = crypto.randomUUID()
    const wedged = {
      ...m,
      entities: { ...m.entities, [childId]: { type: 'management', name: 'Wedged' } },
      children: { ...m.children, [opId]: [childId], [childId]: [] },
      parents: { ...m.parents, [childId]: opId },
    }
    const issues = validateModel(wedged)
    expect(issues.some(i => i.type === 'operation-has-children')).toBe(true)
  })

  it('mixed-children + multiple-operations stack on the same parent', () => {
    let m = createModel('management')
    m = renameNode(m, m.rootId, 'HQ')
    m = addNode(m, m.rootId, 'management')
    m = addNode(m, m.rootId, 'operation')
    m = addNode(m, m.rootId, 'operation') // draft mode allows
    const issues = validateModel(m)
    expect(issues.some(i => i.type === 'mixed-children')).toBe(true)
    expect(issues.some(i => i.type === 'multiple-operations')).toBe(true)
  })

  it('deep linear chain of named management units validates with empty-management at the leaf', () => {
    // root → a → b → c (all named, all management, no operations).
    // The leaf 'c' has no children — empty-management.
    let m = createModel('management')
    m = renameNode(m, m.rootId, 'L0')
    m = addNode(m, m.rootId, 'management')
    const aId = m.children[m.rootId][0]
    m = renameNode(m, aId, 'L1')
    m = addNode(m, aId, 'management')
    const bId = m.children[aId][0]
    m = renameNode(m, bId, 'L2')
    m = addNode(m, bId, 'management')
    const cId = m.children[bId][0]
    m = renameNode(m, cId, 'L3')
    const issues = validateModel(m)
    expect(issues.some(i => i.type === 'empty-management' && i.nodeId === cId)).toBe(true)
  })
})
