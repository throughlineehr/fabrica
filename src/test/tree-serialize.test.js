import { describe, it, expect } from 'vitest'
import { createModel, addNode } from '../tree/model'
import { exportModel, exportModelCompact, importModel } from '../tree/serialize'

describe('exportModel', () => {
  it('exports a single root node', () => {
    const m = createModel('management')
    const yaml = exportModel(m)
    expect(yaml).toContain('type: management')
    expect(yaml).toContain(`id: ${m.rootId}`)
  })

  it('exports children', () => {
    let m = createModel('management')
    m = addNode(m, m.rootId, 'operation')
    const yaml = exportModel(m)
    expect(yaml).toContain('type: management')
    expect(yaml).toContain('type: operation')
    expect(yaml).toContain('children:')
  })
})

describe('exportModelCompact', () => {
  it('exports without IDs', () => {
    const m = createModel('management')
    const yaml = exportModelCompact(m)
    expect(yaml).toContain('type: management')
    expect(yaml).not.toContain('id:')
  })
})

describe('importModel', () => {
  it('imports a simple model', () => {
    const yaml = `
type: management
`
    const m = importModel(yaml)
    expect(m.rootId).toBeTruthy()
    expect(m.entities[m.rootId].type).toBe('management')
    expect(m.children[m.rootId]).toEqual([])
  })

  it('imports a model with children', () => {
    const yaml = `
type: management
children:
  - type: management
  - type: operation
`
    const m = importModel(yaml)
    const kids = m.children[m.rootId]
    expect(kids).toHaveLength(2)
    expect(m.entities[kids[0]].type).toBe('management')
    expect(m.entities[kids[1]].type).toBe('operation')
    expect(m.parents[kids[0]]).toBe(m.rootId)
    expect(m.parents[kids[1]]).toBe(m.rootId)
  })

  it('imports a deep hierarchy', () => {
    const yaml = `
type: management
children:
  - type: management
    children:
      - type: management
        children:
          - type: operation
`
    const m = importModel(yaml)
    const l1 = m.children[m.rootId][0]
    const l2 = m.children[l1][0]
    const l3 = m.children[l2][0]
    expect(m.entities[l3].type).toBe('operation')
    expect(m.parents[l3]).toBe(l2)
    expect(m.parents[l2]).toBe(l1)
    expect(m.parents[l1]).toBe(m.rootId)
  })

  it('round-trips with exportModel', () => {
    let m = createModel('management')
    m = addNode(m, m.rootId, 'management')
    const childId = m.children[m.rootId][0]
    m = addNode(m, childId, 'operation')

    const yaml = exportModel(m)
    const m2 = importModel(yaml)

    // Same structure
    expect(Object.keys(m2.entities)).toHaveLength(3)
    expect(m2.children[m2.rootId]).toHaveLength(1)
    const child2 = m2.children[m2.rootId][0]
    expect(m2.children[child2]).toHaveLength(1)
    expect(m2.entities[m2.children[child2][0]].type).toBe('operation')

    // Same IDs (round-trip fidelity)
    expect(m2.rootId).toBe(m.rootId)
  })

  it('compact export round-trips (new IDs)', () => {
    let m = createModel('management')
    m = addNode(m, m.rootId, 'management')
    const yaml = exportModelCompact(m)
    const m2 = importModel(yaml)
    // Structure matches but IDs are new
    expect(Object.keys(m2.entities)).toHaveLength(2)
    expect(m2.rootId).not.toBe(m.rootId)
  })

  it('throws on invalid input', () => {
    expect(() => importModel('')).toThrow()
    expect(() => importModel('hello')).toThrow()
  })
})
