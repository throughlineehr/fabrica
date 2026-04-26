import { describe, it, expect } from 'vitest'
import { validatePanel, BODY_ROWS, MIN_WIDTH_HP, MAX_WIDTH_HP } from '../components/rack/panelSchema'

const proc = {
  ports: {
    inputs: [{ id: 'in', label: 'in', accepts: { types: null, tags: null } }],
    outputs: [
      { id: 'out', label: 'out', emits: { types: null, tags: [] } },
      { id: 'errors', label: 'errors', emits: { types: ['alert'], tags: [] } },
    ],
  },
  defaultConfig: { intervalMs: 3000, label: '' },
}

function panel(extra = {}) {
  return { widthHP: 6, bg: 'mid', accent: 's1', fixtures: [], ...extra }
}

describe('validatePanel — happy paths', () => {
  it('an empty fixtures list with valid widthHP/bg/accent passes', () => {
    expect(validatePanel(panel(), proc).ok).toBe(true)
  })

  it('a knob bound to an existing config field passes', () => {
    const r = validatePanel(panel({
      fixtures: [{ type: 'knob', id: 'rate', x: 0, y: 0, bind: 'config.intervalMs' }],
    }), proc)
    expect(r.ok).toBe(true)
  })

  it('a jack referencing a declared input port passes', () => {
    const r = validatePanel(panel({
      fixtures: [{ type: 'jack', id: 'in1', x: 0, y: 0, kind: 'input', port: 'in' }],
    }), proc)
    expect(r.ok).toBe(true)
  })

  it('a custom Component skips fixture checks', () => {
    const r = validatePanel({ widthHP: 8, Component: () => null }, proc)
    expect(r.ok).toBe(true)
  })
})

describe('validatePanel — width', () => {
  it('rejects non-integer widthHP', () => {
    const r = validatePanel(panel({ widthHP: 6.5 }), proc)
    expect(r.ok).toBe(false)
    expect(r.issues.some(i => i.type === 'bad-width')).toBe(true)
  })

  it(`rejects widthHP below ${MIN_WIDTH_HP}`, () => {
    expect(validatePanel(panel({ widthHP: 2 }), proc).ok).toBe(false)
  })

  it(`rejects widthHP above ${MAX_WIDTH_HP}`, () => {
    expect(validatePanel(panel({ widthHP: 30 }), proc).ok).toBe(false)
  })
})

describe('validatePanel — bg/accent', () => {
  it('rejects unknown bg', () => {
    const r = validatePanel(panel({ bg: 'rainbow' }), proc)
    expect(r.issues.some(i => i.type === 'bad-bg')).toBe(true)
  })

  it('rejects unknown accent', () => {
    const r = validatePanel(panel({ accent: 'magenta' }), proc)
    expect(r.issues.some(i => i.type === 'bad-accent')).toBe(true)
  })
})

describe('validatePanel — fixture position + size', () => {
  it('rejects fixture extending past right edge', () => {
    const r = validatePanel(panel({
      widthHP: 4,
      fixtures: [{ type: 'knob', id: 'k', x: 3, y: 0 }], // 2x2 starting at x=3 → reaches x=5, > 4
    }), proc)
    expect(r.issues.some(i => i.type === 'out-of-bounds')).toBe(true)
  })

  it('rejects fixture extending past bottom of body', () => {
    const r = validatePanel(panel({
      fixtures: [{ type: 'knob', id: 'k', x: 0, y: BODY_ROWS - 1 }], // 2x2 at y=12 → reaches y=14, > 13
    }), proc)
    expect(r.issues.some(i => i.type === 'out-of-bounds')).toBe(true)
  })

  it('rejects negative position', () => {
    const r = validatePanel(panel({
      fixtures: [{ type: 'knob', id: 'k', x: -1, y: 0 }],
    }), proc)
    expect(r.issues.some(i => i.type === 'bad-position')).toBe(true)
  })

  it('rejects unknown fixture type', () => {
    const r = validatePanel(panel({
      fixtures: [{ type: 'wormhole', id: 'w', x: 0, y: 0 }],
    }), proc)
    expect(r.issues.some(i => i.type === 'bad-fixture-type')).toBe(true)
  })
})

describe('validatePanel — overlap', () => {
  it('rejects two fixtures overlapping', () => {
    const r = validatePanel(panel({
      widthHP: 6,
      fixtures: [
        { type: 'knob', id: 'a', x: 0, y: 0 },
        { type: 'knob', id: 'b', x: 1, y: 1 },
      ],
    }), proc)
    expect(r.issues.some(i => i.type === 'overlap')).toBe(true)
  })

  it('accepts fixtures touching but not overlapping', () => {
    const r = validatePanel(panel({
      widthHP: 6,
      fixtures: [
        { type: 'knob', id: 'a', x: 0, y: 0 }, // 0,0 → 2,2
        { type: 'knob', id: 'b', x: 2, y: 0 }, // 2,0 → 4,2
      ],
    }), proc)
    expect(r.ok).toBe(true)
  })
})

describe('validatePanel — id uniqueness', () => {
  it('rejects duplicate ids', () => {
    const r = validatePanel(panel({
      widthHP: 8,
      fixtures: [
        { type: 'knob', id: 'rate', x: 0, y: 0 },
        { type: 'knob', id: 'rate', x: 4, y: 0 },
      ],
    }), proc)
    expect(r.issues.some(i => i.type === 'duplicate-id')).toBe(true)
  })
})

describe('validatePanel — jacks', () => {
  it('rejects jack with unknown port', () => {
    const r = validatePanel(panel({
      fixtures: [{ type: 'jack', id: 'j', x: 0, y: 0, kind: 'output', port: 'nope' }],
    }), proc)
    expect(r.issues.some(i => i.type === 'jack-unknown-port')).toBe(true)
  })

  it('rejects jack with mismatched kind', () => {
    // 'in' is an input port; treating it as output should fail
    const r = validatePanel(panel({
      fixtures: [{ type: 'jack', id: 'j', x: 0, y: 0, kind: 'output', port: 'in' }],
    }), proc)
    expect(r.issues.some(i => i.type === 'jack-unknown-port')).toBe(true)
  })

  it('rejects jack missing port reference', () => {
    const r = validatePanel(panel({
      fixtures: [{ type: 'jack', id: 'j', x: 0, y: 0, kind: 'input' }],
    }), proc)
    expect(r.issues.some(i => i.type === 'jack-missing-port')).toBe(true)
  })

  it('accepts jacks for both input and output ports', () => {
    const r = validatePanel(panel({
      widthHP: 8,
      fixtures: [
        { type: 'jack', id: 'jin',  x: 0, y: 0, kind: 'input',  port: 'in' },
        { type: 'jack', id: 'jout', x: 4, y: 0, kind: 'output', port: 'out' },
        { type: 'jack', id: 'jerr', x: 6, y: 0, kind: 'output', port: 'errors' },
      ],
    }), proc)
    expect(r.ok).toBe(true)
  })
})

describe('validatePanel — bindings', () => {
  it('rejects bind without config. or state. prefix', () => {
    const r = validatePanel(panel({
      fixtures: [{ type: 'knob', id: 'k', x: 0, y: 0, bind: 'intervalMs' }],
    }), proc)
    expect(r.issues.some(i => i.type === 'bad-binding')).toBe(true)
  })

  it('rejects config binding to non-existent field', () => {
    const r = validatePanel(panel({
      fixtures: [{ type: 'knob', id: 'k', x: 0, y: 0, bind: 'config.fakeKey' }],
    }), proc)
    expect(r.issues.some(i => i.type === 'bind-unknown-config')).toBe(true)
  })

  it('accepts state.X without verifying field (state is informal)', () => {
    const r = validatePanel(panel({
      fixtures: [{ type: 'led', id: 'l', x: 0, y: 0, bind: 'state.active' }],
    }), proc)
    expect(r.ok).toBe(true)
  })
})
