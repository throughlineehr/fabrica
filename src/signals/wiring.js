// Wiring — turns a topology map into live bus subscriptions.
//
// For each (source → target) pair, a forwarder subscribes on the source's
// room channel and republishes to the target's room channel.
//
// Two sets of info travel with each forwarder:
//   - sourceTerminalId: the OUT terminal on the source room carrying this edge.
//     Used for output routing — if a signal carries `outgoingTerminals`, only
//     forwarders whose sourceTerminalId is in that set actually deliver.
//   - targetTerminalId: the IN terminal on the target room this edge lands on.
//     Stamped onto delivered signals as `arrivalTerminal` so processors can
//     filter by input terminal.
//
// Loop prevention: delivered[] is mutated in place (shared across forwarders)
// so diamond paths don't double-deliver; hops[] is cloned per delivery so
// each subscriber's path record ends at its own room.
//
// wireTopology returns a cleanup that drops every forwarder it created.

import { roomChannel } from './bus'

function wireForwarder(bus, sourceRoomKey, sourceTerminalId, targetRoomKey, targetTerminalId) {
  const src = `room:${sourceRoomKey}`
  return bus.subscribe(src, (signal) => {
    // Output routing: if the signal says "only go out these terminals" and
    // this forwarder isn't one of them, skip.
    if (signal.outgoingTerminals && sourceTerminalId &&
        !signal.outgoingTerminals.includes(sourceTerminalId)) {
      return
    }

    if (!signal.delivered) signal.delivered = []
    if (signal.delivered.includes(targetRoomKey)) return
    signal.delivered.push(targetRoomKey)

    const [nodeId, systemKey] = targetRoomKey.split(':')
    bus.publish(roomChannel(nodeId, systemKey), {
      ...signal,
      hops: [...(signal.hops || []), targetRoomKey],
      arrivalTerminal: targetTerminalId,
    })
  })
}

export function wireTopology(bus, topology) {
  const cleanups = []
  for (const [targetKey, sources] of Object.entries(topology)) {
    for (const src of sources) {
      cleanups.push(wireForwarder(
        bus,
        src.sourceRoomKey,
        src.sourceTerminalId,
        targetKey,
        src.terminalId,
      ))
    }
  }
  return () => cleanups.forEach(c => c())
}
