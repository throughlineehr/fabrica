import { describe, it, expect } from 'vitest'
import { createModel, addNode, removeNode, canAddManagement, canAddOperation } from '../tree/model'

describe('createModel', () => {
  it('creates a model with a root management node', () => {
    const model = createModel('management')
    expect(model.rootId).toBeTruthy()
    expect(model.entities[model.rootId].type).toBe('management')
    expect(model.children[model.rootId]).toEqual([])
    expect(model.parents[model.rootId]).toBeNull()
  })
})

describe('addNode', () => {
  it('adds a management child', () => {
    const m0 = createModel('management')
    const m1 = addNode(m0, m0.rootId, 'management')
    const childIds = m1.children[m0.rootId]
    expect(childIds).toHaveLength(1)
    expect(m1.entities[childIds[0]].type).toBe('management')
    expect(m1.parents[childIds[0]]).toBe(m0.rootId)
  })

  it('adds an operation child', () => {
    const m0 = createModel('management')
    const m1 = addNode(m0, m0.rootId, 'operation')
    const childIds = m1.children[m0.rootId]
    expect(childIds).toHaveLength(1)
    expect(m1.entities[childIds[0]].type).toBe('operation')
  })

  it('does not mutate the original model', () => {
    const m0 = createModel('management')
    const m1 = addNode(m0, m0.rootId, 'management')
    expect(m0.children[m0.rootId]).toHaveLength(0)
    expect(m1.children[m0.rootId]).toHaveLength(1)
  })

  it('returns same model if parent does not exist', () => {
    const m0 = createModel('management')
    const m1 = addNode(m0, 'nonexistent', 'management')
    expect(m1).toBe(m0)
  })
})

describe('removeNode', () => {
  it('removes a child node', () => {
    let m = createModel('management')
    m = addNode(m, m.rootId, 'management')
    const childId = m.children[m.rootId][0]
    m = removeNode(m, childId)
    expect(m.children[m.rootId]).toHaveLength(0)
    expect(m.entities[childId]).toBeUndefined()
    expect(m.parents[childId]).toBeUndefined()
  })

  it('removes descendants recursively', () => {
    let m = createModel('management')
    m = addNode(m, m.rootId, 'management')
    const childId = m.children[m.rootId][0]
    m = addNode(m, childId, 'operation')
    const grandchildId = m.children[childId][0]
    m = removeNode(m, childId)
    expect(m.entities[childId]).toBeUndefined()
    expect(m.entities[grandchildId]).toBeUndefined()
  })

  it('cannot remove root', () => {
    const m0 = createModel('management')
    const m1 = removeNode(m0, m0.rootId)
    expect(m1).toBe(m0)
  })
})

describe('validation', () => {
  it('canAddManagement returns true for empty management node', () => {
    const m = createModel('management')
    expect(canAddManagement(m, m.rootId)).toBe(true)
  })

  it('canAddOperation returns true for empty management node', () => {
    const m = createModel('management')
    expect(canAddOperation(m, m.rootId)).toBe(true)
  })

  it('cannot add management if node has an operation', () => {
    let m = createModel('management')
    m = addNode(m, m.rootId, 'operation')
    expect(canAddManagement(m, m.rootId)).toBe(false)
  })

  it('cannot add operation if node has management children', () => {
    let m = createModel('management')
    m = addNode(m, m.rootId, 'management')
    expect(canAddOperation(m, m.rootId)).toBe(false)
  })

  it('cannot add second operation', () => {
    let m = createModel('management')
    m = addNode(m, m.rootId, 'operation')
    expect(canAddOperation(m, m.rootId)).toBe(false)
  })

  it('can add multiple management children', () => {
    let m = createModel('management')
    m = addNode(m, m.rootId, 'management')
    expect(canAddManagement(m, m.rootId)).toBe(true)
    m = addNode(m, m.rootId, 'management')
    expect(canAddManagement(m, m.rootId)).toBe(true)
  })

  it('addNode allows mixed types in draft mode', () => {
    let m = createModel('management')
    m = addNode(m, m.rootId, 'operation')
    const m2 = addNode(m, m.rootId, 'management')
    // Draft mode allows this — validateModel() catches it
    expect(m2.children[m.rootId]).toHaveLength(2)
  })
})
