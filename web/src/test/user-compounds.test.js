// Tests for the live user-compound registration mechanism and the
// saveAsCompound agent command.

import { describe, it, expect, afterEach } from 'vitest'
import {
  registerUserCompound, unregisterUserCompound,
  listUserCompounds, getEffectiveLibrary, subscribeLibrary,
  getProcessorDef, PROCESSOR_LIBRARY,
} from '../signals/library'
import { compoundFromRoom } from '../signals/compoundFromRoom'

function freshDef(name = 'Tester') {
  // Build a minimal compound def from a heartbeat-only "room"
  return compoundFromRoom({
    processors: [{ id: 'uuid', defId: 'heartbeat', config: {} }],
    cables: [],
    name,
    expose: {
      inputs: [],
      outputs: [{ outerId: 'pulse', instanceId: 'heartbeat-1', portId: 'out1' }],
    },
  })
}

describe('user compound registration', () => {
  // Each test cleans up so the global registry stays small.
  afterEach(() => {
    for (const c of listUserCompounds()) unregisterUserCompound(c.id)
  })

  it('registerUserCompound adds a def the rest of the library can resolve', () => {
    const def = freshDef('A')
    registerUserCompound(def)
    expect(getProcessorDef(def.id)).toBe(def)
    expect(listUserCompounds().map(d => d.id)).toEqual([def.id])
    expect(getEffectiveLibrary().some(d => d.id === def.id)).toBe(true)
    expect(getEffectiveLibrary().length).toBe(PROCESSOR_LIBRARY.length + 1)
  })

  it('wires create() onto a def that lacks one (compoundFromRoom output)', () => {
    const def = freshDef('B')
    expect(def.create).toBeUndefined() // compoundFromRoom intentionally leaves this empty
    registerUserCompound(def)
    expect(typeof def.create).toBe('function')
  })

  it('refuses ids that collide with built-ins or already-registered user compounds', () => {
    expect(() => registerUserCompound({ ...freshDef('C'), id: 'heartbeat' })).toThrow()
    const def = freshDef('D')
    registerUserCompound(def)
    expect(() => registerUserCompound(def)).toThrow()
  })

  it('subscribeLibrary fires on register and unregister', () => {
    let fires = 0
    const off = subscribeLibrary(() => { fires += 1 })
    const def = freshDef('E')
    registerUserCompound(def)
    expect(fires).toBe(1)
    unregisterUserCompound(def.id)
    expect(fires).toBe(2)
    off()
    registerUserCompound(freshDef('E2'))
    expect(fires).toBe(2) // unsubscribed
  })

  it('unregisterUserCompound returns false on unknown id', () => {
    expect(unregisterUserCompound('nope')).toBe(false)
  })
})
