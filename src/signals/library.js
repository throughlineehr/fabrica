// Processor library. Each entry is a definition; create() returns a running
// instance bound to a room.
//
// Runtime receives { bus, instanceId, roomNodeId, roomSystemKey, filters }.
// Filters are applied at the subscribe boundary via signalMatches() so each
// processor doesn't duplicate the filter check.
//
// Every processor also publishes its own events to proc:{instanceId}:events
// for the processor app page to display.

import { createSignal, appendTrace, hasTraced } from './signal'
import { roomChannel, eventsChannel, publishToRoom } from './bus'
import { signalMatches } from './filter'

export const SIGNAL_TYPES = ['metric', 'event', 'narrative', 'alert']

// If the instance restricts its outputs to specific terminals, stamp that
// onto the signal so forwarders route it. Null passes through — broadcast to all.
function withOutputRouting(signal, filters) {
  if (!filters?.outputTerminals) return signal
  return { ...signal, outgoingTerminals: filters.outputTerminals }
}

const HEARTBEAT = {
  id: 'heartbeat',
  name: 'Heartbeat',
  description: 'Emits a metric signal on a regular interval. Source only — no inputs.',
  hasInputs: false,
  hasOutputs: true,
  placement: 'any',
  defaultConfig: { intervalMs: 3000 },
  create(config, runtime) {
    const { bus, instanceId, roomNodeId, roomSystemKey, filters } = runtime
    let timer = null

    const emit = () => {
      const sig = createSignal(
        'metric',
        { key: 'heartbeat', value: Math.round(50 + Math.random() * 50), unit: 'bpm' },
        { processorId: instanceId, processorType: 'heartbeat', roomNodeId, roomSystemKey },
      )
      const stamped = appendTrace(sig, {
        roomNodeId, roomSystemKey,
        processorId: instanceId, processorType: 'heartbeat',
      })
      const routed = withOutputRouting(stamped, filters)
      publishToRoom(bus, roomNodeId, roomSystemKey, routed)
      bus.publish(eventsChannel(instanceId), routed)
    }

    return {
      start() {
        if (timer) return
        emit()
        timer = setInterval(emit, config.intervalMs || 3000)
      },
      stop() {
        if (timer) { clearInterval(timer); timer = null }
      },
    }
  },
}

const TRACER = {
  id: 'tracer',
  name: 'Tracer',
  description: 'Stamps passing signals with this room and timestamp, then forwards. Skips signals it has already traced.',
  hasInputs: true,
  hasOutputs: true,
  placement: 'any',
  defaultConfig: {},
  create(_config, runtime) {
    const { bus, instanceId, roomNodeId, roomSystemKey, filters } = runtime
    let unsub = null

    return {
      start() {
        if (unsub) return
        unsub = bus.subscribe(roomChannel(roomNodeId, roomSystemKey), (signal) => {
          if (hasTraced(signal, instanceId)) return
          if (!signalMatches(signal, filters)) return
          const traced = appendTrace(signal, {
            roomNodeId, roomSystemKey,
            processorId: instanceId, processorType: 'tracer',
          })
          const routed = withOutputRouting(traced, filters)
          publishToRoom(bus, roomNodeId, roomSystemKey, routed)
          bus.publish(eventsChannel(instanceId), routed)
        })
      },
      stop() {
        if (unsub) { unsub(); unsub = null }
      },
    }
  },
}

const LOGGER = {
  id: 'logger',
  name: 'Logger',
  description: 'Records every signal it sees. Sink only — no outputs.',
  hasInputs: true,
  hasOutputs: false,
  placement: 'any',
  defaultConfig: {},
  create(_config, runtime) {
    const { bus, instanceId, roomNodeId, roomSystemKey, filters } = runtime
    let unsub = null

    return {
      start() {
        if (unsub) return
        unsub = bus.subscribe(roomChannel(roomNodeId, roomSystemKey), (signal) => {
          if (!signalMatches(signal, filters)) return
          bus.publish(eventsChannel(instanceId), signal)
        })
      },
      stop() {
        if (unsub) { unsub(); unsub = null }
      },
    }
  },
}

export const PROCESSOR_LIBRARY = [HEARTBEAT, TRACER, LOGGER]

export function getProcessorDef(defId) {
  return PROCESSOR_LIBRARY.find(p => p.id === defId)
}

export function canPlaceProcessor(def, systemKey) {
  if (def.placement === 'any') return true
  if (Array.isArray(def.placement)) return def.placement.includes(systemKey)
  return false
}
