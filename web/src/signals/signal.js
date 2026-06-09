// Signal — the atom of nervous input.
// Four types: metric, event, narrative, alert.
//
// trace[]     — processor visits (rich metadata). Used by tracer-style loop checks.
// hops[]      — room forwarder path (roomKey strings). Cloned per delivery,
//               represents the actual path taken to reach this particular subscriber.
// delivered[] — shared loop-prevention record. Mutated in place so sibling forwarders
//               don't re-deliver to rooms already visited. Order is meaningless.
// tags[]      — free-form labels for routing/filtering.

export function createSignal(type, content, source) {
  return {
    id: crypto.randomUUID(),
    type,
    content,
    source: source || {},
    trace: [],
    hops: [],
    delivered: [],
    tags: [],
    timestamp: Date.now(),
  }
}

export function appendTrace(signal, entry) {
  return {
    ...signal,
    trace: [...signal.trace, { ...entry, timestamp: Date.now() }],
  }
}

export function hasTraced(signal, processorId) {
  return signal.trace.some(t => t.processorId === processorId)
}
