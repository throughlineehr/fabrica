// Cable-driven dispatcher.
//
// One graph: cables (within a room) plus the topology bridge (a terminal in
// room R can be peered to a terminal in room R'; that's external state the
// caller owns). The dispatcher walks the graph from an emitting jack and
// delivers signals to receiving jacks via per-processor input handlers.
//
// Hop cap (default 32): every traversal hop increments hopCount; when the cap
// is reached the signal is dropped. Cycles end silently. (Routing the cycle
// diagnostic upward to the nearest S5 algedonic channel is a future concern;
// today we just stop.)
//
// Dedup: each processor keeps a small bounded set of recently-seen signal ids
// so the same signal arriving via two paths only fires the input handler once.
//
// Cross-room: when a jack→terminal cable is followed, the dispatcher calls
// `onTerminal(fromRoomKey, terminalId, signal, hopCount)`. The caller
// resolves topology and (if there's a peer) calls
// `deliverFromTerminal(peerRoomKey, peerTerminalId, signal, hopCount)`. The
// dispatcher then continues delivery from terminal-sourced cables in the
// peer room.
//
// Broadcast: per-instance flag. When set, an emit fans out to every terminal
// in the emitter's room (caller registers `roomTerminalsByRoom`). Internal
// jack→jack cables continue to fire. External jack→terminal cables are
// suppressed (broadcast wins for terminal egress).

const DEFAULT_HOP_CAP = 32
const DEFAULT_DEDUP_SIZE = 256

export function createDispatcher({
  onTerminal,
  hopCap = DEFAULT_HOP_CAP,
  dedupSize = DEFAULT_DEDUP_SIZE,
} = {}) {
  // ---- mutable state -----------------------------------------------------
  let cablesByRoom = {}
  let roomTerminalsByRoom = {}
  const broadcastByInstance = {}
  const inputHandlers = {}        // instanceId → handler({ signal, portId })
  const instanceLocation = {}     // instanceId → roomKey
  const seenByInstance = {}       // instanceId → Set<signalId> (bounded)

  // ---- mutators ----------------------------------------------------------
  function setCables(next) { cablesByRoom = next || {} }
  function setRoomTerminals(next) { roomTerminalsByRoom = next || {} }
  function setBroadcast(instanceId, broadcast) {
    if (broadcast) broadcastByInstance[instanceId] = true
    else delete broadcastByInstance[instanceId]
  }
  function registerProcessor(instanceId, { roomKey, inputHandler }) {
    instanceLocation[instanceId] = roomKey
    inputHandlers[instanceId] = inputHandler
    if (!seenByInstance[instanceId]) seenByInstance[instanceId] = new Set()
  }
  function unregisterProcessor(instanceId) {
    delete instanceLocation[instanceId]
    delete inputHandlers[instanceId]
    delete seenByInstance[instanceId]
    delete broadcastByInstance[instanceId]
  }

  // ---- internal: deliver to a single jack target -------------------------
  function deliverToJack(signal, target, hopCount) {
    if (hopCount > hopCap) return
    const handler = inputHandlers[target.instanceId]
    if (!handler) return

    // Dedup by signal id at this processor
    const seen = seenByInstance[target.instanceId]
    if (seen && signal.id) {
      if (seen.has(signal.id)) return
      seen.add(signal.id)
      if (seen.size > dedupSize) {
        const it = seen.values()
        seen.delete(it.next().value) // drop oldest
      }
    }

    handler({ signal: { ...signal, hopCount }, portId: target.portId })
  }

  // ---- emit: jack → graph ------------------------------------------------
  function emit(signal, { fromInstanceId, fromPortId }) {
    const startHop = signal.hopCount || 0
    if (startHop >= hopCap) return
    const startRoomKey = instanceLocation[fromInstanceId]
    if (!startRoomKey) return

    const broadcasting = !!broadcastByInstance[fromInstanceId]
    const cables = cablesByRoom[startRoomKey] || []
    const fanoutHop = startHop + 1
    const sentToTerminal = new Set()

    for (const cable of cables) {
      const s = cable.source
      if (s?.kind !== 'jack') continue
      if (s.instanceId !== fromInstanceId) continue
      if (s.portId !== fromPortId) continue

      const t = cable.target
      if (t?.kind === 'jack') {
        // Internal cables always fire — broadcast does not suppress them.
        deliverToJack(signal, t, fanoutHop)
      } else if (t?.kind === 'terminal' && !broadcasting) {
        // External cables only fire when not broadcasting.
        if (!sentToTerminal.has(t.terminalId)) {
          sentToTerminal.add(t.terminalId)
          onTerminal?.(startRoomKey, t.terminalId, signal, fanoutHop)
        }
      }
    }

    // Broadcast: fan out to every terminal in the emitter's room.
    if (broadcasting) {
      const tids = roomTerminalsByRoom[startRoomKey] || []
      for (const tid of tids) {
        if (sentToTerminal.has(tid)) continue
        sentToTerminal.add(tid)
        onTerminal?.(startRoomKey, tid, signal, fanoutHop)
      }
    }
  }

  // ---- arrival from peer room: terminal → graph --------------------------
  function deliverFromTerminal(roomKey, terminalId, signal, hopCount = 0) {
    if (hopCount > hopCap) return
    const cables = cablesByRoom[roomKey] || []
    const fanoutHop = hopCount + 1
    const sentToTerminal = new Set([terminalId]) // don't bounce back

    for (const cable of cables) {
      const s = cable.source
      if (s?.kind !== 'terminal' || s.terminalId !== terminalId) continue

      const t = cable.target
      if (t?.kind === 'jack') {
        deliverToJack(signal, t, fanoutHop)
      } else if (t?.kind === 'terminal') {
        if (!sentToTerminal.has(t.terminalId)) {
          sentToTerminal.add(t.terminalId)
          onTerminal?.(roomKey, t.terminalId, signal, fanoutHop)
        }
      }
    }
  }

  return {
    setCables, setRoomTerminals, setBroadcast,
    registerProcessor, unregisterProcessor,
    emit, deliverFromTerminal,
    // Test helpers — read-only views of internal state
    _state: () => ({
      cablesByRoom, roomTerminalsByRoom,
      broadcastByInstance: { ...broadcastByInstance },
      registeredInstances: Object.keys(inputHandlers),
    }),
  }
}
