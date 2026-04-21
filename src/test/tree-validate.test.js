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
