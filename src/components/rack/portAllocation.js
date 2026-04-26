// Helpers for picking ports when adding cables by source-processor-name
// (the Switchboard's "internal connections" select doesn't show port
// numbers per Caleb's preference).

/**
 * Find the next free output port on a processor — i.e., the first output
 * port id that no existing cable currently sources from on that instance.
 * Returns null if the processor has no outputs, or the first port id if
 * all are already in use (callers can choose: refuse, allow re-use, etc.).
 *
 * @param {Array} cables — cables in the room
 * @param {string} instanceId — processor instance id
 * @param {object} processorDef — processor definition (with `ports.outputs[]`)
 * @returns {{ portId: string|null, allTaken: boolean }}
 */
export function nextFreeOutputPort(cables, instanceId, processorDef) {
  const outputs = processorDef?.ports?.outputs || []
  if (outputs.length === 0) return { portId: null, allTaken: false }

  const used = new Set()
  for (const c of cables) {
    if (c?.source?.kind === 'jack' && c.source.instanceId === instanceId) {
      used.add(c.source.portId)
    }
  }
  for (const p of outputs) {
    if (!used.has(p.id)) return { portId: p.id, allTaken: false }
  }
  // All taken — return the first port for callers that want re-use semantics.
  return { portId: outputs[0].id, allTaken: true }
}

/**
 * Same idea on the input side.
 */
export function nextFreeInputPort(cables, instanceId, processorDef) {
  const inputs = processorDef?.ports?.inputs || []
  if (inputs.length === 0) return { portId: null, allTaken: false }
  const used = new Set()
  for (const c of cables) {
    if (c?.target?.kind === 'jack' && c.target.instanceId === instanceId) {
      used.add(c.target.portId)
    }
  }
  for (const p of inputs) {
    if (!used.has(p.id)) return { portId: p.id, allTaken: false }
  }
  return { portId: inputs[0].id, allTaken: true }
}
