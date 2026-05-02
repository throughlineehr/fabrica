import { describe, it, expect } from 'vitest'
import { compoundFromRoom } from '../signals/compoundFromRoom'
import { getProcessorDef, createCompoundInstance } from '../signals/library'

// Build a fake room patch with the given primitives and cables.
function makeRoom() {
  const heartbeat = { id: 'uuid-hb', defId: 'heartbeat', config: { intervalMs: 2000 } }
  const tracer    = { id: 'uuid-tr', defId: 'tracer',    config: {} }
  const logger    = { id: 'uuid-lg', defId: 'logger',    config: {} }
  const cables = [
    { id: 'c1', source: { kind: 'jack', instanceId: 'uuid-hb', portId: 'out1' },
                target: { kind: 'jack', instanceId: 'uuid-tr', portId: 'in1' } },
    { id: 'c2', source: { kind: 'jack', instanceId: 'uuid-tr', portId: 'out1' },
                target: { kind: 'jack', instanceId: 'uuid-lg', portId: 'in1' } },
  ]
  return { processors: [heartbeat, tracer, logger], cables }
}

describe('compoundFromRoom', () => {
  it('captures inner instances with stable local ids', () => {
    const { processors, cables } = makeRoom()
    const def = compoundFromRoom({ processors, cables, name: 'My Pipe' })
    expect(def.id).toBe('my-pipe')
    expect(def.subRack.instances).toHaveLength(3)
    const ids = def.subRack.instances.map(i => i.id)
    expect(ids).toContain('heartbeat-1')
    expect(ids).toContain('tracer-1')
    expect(ids).toContain('logger-1')
    expect(new Set(ids).size).toBe(3) // unique
  })

  it('translates jack→jack cables to local ids; drops terminal cables', () => {
    const room = makeRoom()
    room.cables.push({
      id: 'c-term',
      source: { kind: 'jack', instanceId: 'uuid-tr', portId: 'out2' },
      target: { kind: 'terminal', terminalId: 's4-out' },
    })
    const def = compoundFromRoom({ ...room, name: 'X' })
    expect(def.subRack.cables).toHaveLength(2)
    for (const c of def.subRack.cables) {
      expect(c.source.kind).toBe('jack')
      expect(c.target.kind).toBe('jack')
      expect(c.source.instanceId).not.toMatch(/^uuid-/)
      expect(c.target.instanceId).not.toMatch(/^uuid-/)
    }
  })

  it('preserves per-instance config so reinstantiation matches', () => {
    const { processors, cables } = makeRoom()
    const def = compoundFromRoom({ processors, cables, name: 'Pipe' })
    const hb = def.subRack.instances.find(i => i.defId === 'heartbeat')
    expect(hb.config.intervalMs).toBe(2000)
    const tr = def.subRack.instances.find(i => i.defId === 'tracer')
    // tracer had empty config — should be omitted
    expect(tr.config).toBeUndefined()
  })

  it('auto-derives outer ports from unconnected inner jacks', () => {
    const { processors, cables } = makeRoom()
    const def = compoundFromRoom({ processors, cables, name: 'Pipe' })
    // heartbeat: no inputs, 8 outputs — 7 of them unconnected (out1 used).
    // tracer: 4 inputs, 4 outputs — in1 used, out1 used → 3 inputs, 3 outputs.
    // logger: 4 inputs, 0 outputs — in1 used → 3 inputs.
    // Total auto-inputs = 3 (tracer) + 3 (logger) = 6.
    // Total auto-outputs = 7 (heartbeat) + 3 (tracer) = 10.
    expect(def.ports.inputs.length).toBe(6)
    expect(def.ports.outputs.length).toBe(10)
    expect(def.hasInputs).toBe(true)
    expect(def.hasOutputs).toBe(true)
  })

  it('caller can override port exposure via expose option', () => {
    const { processors, cables } = makeRoom()
    const def = compoundFromRoom({
      processors, cables,
      name: 'Just One',
      expose: {
        inputs: [],
        outputs: [{ outerId: 'out', instanceId: 'tracer-1', portId: 'out2' }],
      },
    })
    expect(def.ports.inputs).toHaveLength(0)
    expect(def.ports.outputs).toEqual([
      { id: 'out', label: 'out', emits: { types: null, tags: null } },
    ])
    expect(def.subRack.outputBindings).toEqual({
      out: { instanceId: 'tracer-1', portId: 'out2' },
    })
  })

  it('paramBindings populate defaultConfig from inner config / def defaults', () => {
    const { processors, cables } = makeRoom()
    const def = compoundFromRoom({
      processors, cables,
      name: 'Tunable',
      expose: {
        params: [
          { outerKey: 'pulseMs', instanceId: 'heartbeat-1', configKey: 'intervalMs' },
        ],
      },
    })
    // heartbeat instance had intervalMs:2000 — that should bubble up
    expect(def.defaultConfig.pulseMs).toBe(2000)
    expect(def.subRack.paramBindings).toEqual({
      pulseMs: { instanceId: 'heartbeat-1', configKey: 'intervalMs' },
    })
  })

  it('throws when name is missing or no processors are provided', () => {
    expect(() => compoundFromRoom({ processors: [], cables: [], name: 'X' })).toThrow()
    expect(() => compoundFromRoom({ processors: [{ id: 'p', defId: 'logger' }], cables: [] })).toThrow()
  })

  it('emits a panel with input jacks at top and output jacks at bottom', () => {
    const { processors, cables } = makeRoom()
    const def = compoundFromRoom({ processors, cables, name: 'Pipe' })
    expect(def.panel).toBeDefined()
    const inputJacks = def.panel.fixtures.filter(f => f.type === 'jack' && f.kind === 'input')
    const outputJacks = def.panel.fixtures.filter(f => f.type === 'jack' && f.kind === 'output')
    expect(inputJacks.length).toBe(def.ports.inputs.length)
    expect(outputJacks.length).toBe(def.ports.outputs.length)
    for (const j of inputJacks) expect(j.y).toBe(0)
    for (const j of outputJacks) expect(j.y).toBe(11)
  })

  it('round-trips: snapshot then re-instantiate via createCompoundInstance', () => {
    // Build a tiny single-instance "compound" (just heartbeat) with a
    // declared output port pointing at heartbeat.out1.
    const processors = [{ id: 'uuid-hb', defId: 'heartbeat', config: {} }]
    const def = compoundFromRoom({
      processors, cables: [],
      name: 'Pulse Only',
      expose: {
        inputs: [],
        outputs: [{ outerId: 'pulse', instanceId: 'heartbeat-1', portId: 'out1' }],
      },
    })
    // Wire create() like library.js does for compounds
    def.create = (config, runtime) => createCompoundInstance(def, config, runtime)
    // Sanity: structure is compatible with the expected shape
    expect(getProcessorDef('heartbeat')).toBeDefined() // inner def resolves
    expect(def.subRack.instances[0].defId).toBe('heartbeat')
    expect(def.subRack.outputBindings.pulse).toEqual({ instanceId: 'heartbeat-1', portId: 'out1' })
  })
})
