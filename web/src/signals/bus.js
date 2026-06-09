// Signal bus — transport abstraction.
// The (publish, subscribe) surface is the permanent contract.
// Current: in-memory pubsub. Target: websocket client → redis pubsub broker.
// Nothing above this file should care which.

export function createBus() {
  const subs = new Map()

  return {
    publish(channel, signal) {
      subs.get(channel)?.forEach(cb => cb(signal))
    },

    subscribe(channel, callback) {
      if (!subs.has(channel)) subs.set(channel, new Set())
      subs.get(channel).add(callback)
      return () => subs.get(channel).delete(callback)
    },
  }
}

// Channel naming lives here so names aren't scattered through the codebase.
export function roomChannel(nodeId, systemKey) {
  return `room:${nodeId}:${systemKey}`
}

export function eventsChannel(instanceId) {
  return `proc:${instanceId}:events`
}

// Publish helper.
//  - hops[]: per-delivery path record. Cloned for every emission so each
//    subscriber's view shows the actual path taken to reach it.
//  - delivered[]: shared loop-prevention record. Same reference across all
//    forwarders so they see each other's claims and skip redundant delivery.
export function publishToRoom(bus, nodeId, systemKey, signal) {
  const roomKey = `${nodeId}:${systemKey}`
  const delivered = signal.delivered || []
  if (!delivered.includes(roomKey)) delivered.push(roomKey)
  bus.publish(roomChannel(nodeId, systemKey), {
    ...signal,
    hops: [...(signal.hops || []), roomKey],
    delivered,
  })
}
