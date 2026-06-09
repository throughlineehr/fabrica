import { describe, it, expect } from 'vitest'
import { parseShorthand } from '../tree/shorthand'
import { buildRenderTree, flattenTree } from '../tree/index'

describe('parseShorthand', () => {
  it('parses a single root', () => {
    const m = parseShorthand('Root: m')
    expect(m.entities[m.rootId].type).toBe('management')
    expect(m.entities[m.rootId].name).toBe('Root')
  })

  it('parses a tree with children', () => {
    const m = parseShorthand(`
CEO: m
  Marketing: m
    Social: o
  Sales: o
`)
    const kids = m.children[m.rootId]
    expect(kids).toHaveLength(2)
    expect(m.entities[kids[0]].name).toBe('Marketing')
    expect(m.entities[kids[1]].name).toBe('Sales')
    expect(m.entities[kids[1]].type).toBe('operation')
    const grandkids = m.children[kids[0]]
    expect(grandkids).toHaveLength(1)
    expect(m.entities[grandkids[0]].name).toBe('Social')
  })

  it('handles full type names', () => {
    const m = parseShorthand('Root: management\n  Child: operation')
    expect(m.entities[m.rootId].type).toBe('management')
    const kid = m.children[m.rootId][0]
    expect(m.entities[kid].type).toBe('operation')
  })

  it('builds a deep tree', () => {
    const m = parseShorthand(`
L0: m
  L1: m
    L2: m
      L3: m
        L4: o
`)
    const tree = buildRenderTree(m)
    const flat = flattenTree(tree)
    expect(flat).toHaveLength(5)
    expect(flat[4].name).toBe('L4')
    expect(flat[4].type).toBe('operation')
  })

  it('handles wide tree', () => {
    const m = parseShorthand(`
Root: m
  A: m
  B: m
  C: m
  D: o
`)
    expect(m.children[m.rootId]).toHaveLength(4)
  })

  it('parents are set correctly', () => {
    const m = parseShorthand(`
Root: m
  Child: m
    Grandchild: o
`)
    const childId = m.children[m.rootId][0]
    const gcId = m.children[childId][0]
    expect(m.parents[childId]).toBe(m.rootId)
    expect(m.parents[gcId]).toBe(childId)
    expect(m.parents[m.rootId]).toBeNull()
  })

  it('throws on empty input', () => {
    expect(() => parseShorthand('')).toThrow()
  })
})
