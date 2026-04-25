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

// S1 TRANSDUCERS -----------------------------------------------------------
// Transducers sample reality. They are the boundary where the system's
// nervous space meets the outside world. By design they live only at S1 —
// past that boundary the system trusts the muscle. Effectors (TBD) are the
// symmetric concept on the outbound side.

const WEBSOCKET_TRANSDUCER = {
  id: 'websocket-transducer',
  name: 'WebSocket Transducer',
  description: 'Connects to an external WebSocket URL and emits each incoming message as a signal in this room. Auto-reconnects with exponential backoff.',
  hasInputs: false,
  hasOutputs: true,
  placement: ['s1'],
  role: 'transducer',
  externalRequests: ['ws://*', 'wss://*'],
  runtime: 'either',
  defaultConfig: {
    url: '',
    parse: 'text',         // 'text' | 'json'
    signalType: 'event',   // metric | event | narrative | alert
    tags: [],
    reconnect: { maxAttempts: 10, baseDelayMs: 500, maxDelayMs: 30000 },
  },
  create(config, runtime) {
    const { bus, instanceId, roomNodeId, roomSystemKey, filters } = runtime
    let socket = null
    let attempts = 0
    let stopRequested = false
    let reconnectTimer = null

    const reportStatus = (status, detail) => {
      const sig = createSignal(
        'event',
        { kind: 'connection', status, detail, url: config.url },
        { processorId: instanceId, processorType: 'websocket-transducer', roomNodeId, roomSystemKey },
      )
      bus.publish(eventsChannel(instanceId), sig)
    }

    const emit = (raw) => {
      let content
      if (config.parse === 'json') {
        try { content = JSON.parse(raw) }
        catch (err) { reportStatus('parse-error', String(err.message || err)); return }
      } else {
        content = { text: raw }
      }
      const sig = createSignal(
        config.signalType || 'event',
        content,
        {
          processorId: instanceId,
          processorType: 'websocket-transducer',
          roomNodeId,
          roomSystemKey,
          externalSource: config.url,
        },
      )
      sig.tags = [...(config.tags || []), 'transducer', 'websocket']
      const stamped = appendTrace(sig, {
        roomNodeId, roomSystemKey,
        processorId: instanceId, processorType: 'websocket-transducer',
      })
      const routed = withOutputRouting(stamped, filters)
      publishToRoom(bus, roomNodeId, roomSystemKey, routed)
      bus.publish(eventsChannel(instanceId), routed)
    }

    const connect = () => {
      if (stopRequested) return
      if (!config.url) { reportStatus('error', 'No URL configured'); return }
      if (typeof WebSocket === 'undefined') {
        reportStatus('error', 'WebSocket not available in this runtime')
        return
      }
      try { socket = new WebSocket(config.url) }
      catch (err) {
        reportStatus('error', String(err.message || err))
        scheduleReconnect()
        return
      }
      reportStatus('connecting', config.url)
      socket.onopen = () => { attempts = 0; reportStatus('connected', config.url) }
      socket.onmessage = (ev) => {
        const data = typeof ev.data === 'string' ? ev.data : '<binary>'
        emit(data)
      }
      socket.onerror = () => { reportStatus('error', 'socket error') }
      socket.onclose = () => {
        socket = null
        reportStatus('disconnected', null)
        scheduleReconnect()
      }
    }

    const scheduleReconnect = () => {
      if (stopRequested) return
      const max = config.reconnect?.maxAttempts ?? 10
      if (attempts >= max) { reportStatus('giving-up', `${attempts} attempts exhausted`); return }
      const base = config.reconnect?.baseDelayMs ?? 500
      const ceiling = config.reconnect?.maxDelayMs ?? 30000
      const delay = Math.min(base * Math.pow(2, attempts), ceiling)
      attempts += 1
      reportStatus('reconnecting', `attempt ${attempts} in ${delay}ms`)
      reconnectTimer = setTimeout(connect, delay)
    }

    return {
      start() {
        stopRequested = false
        attempts = 0
        connect()
      },
      stop() {
        stopRequested = true
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
        if (socket) {
          try { socket.close() } catch { /* ignore */ }
          socket = null
        }
      },
    }
  },
}

// S1 → S2 VARIETY FILTERS --------------------------------------------------
// Beer (Brain of the Firm, ch. 12): the S1-side transducer compares raw
// operational data against baseline; only statistically significant
// information is passed up. Suppress noise, forward news. The Digest is the
// LLM-backed analogue for narrative signals — it buffers chatter and emits
// a small set of themes representing what's actually changed.

const DIGEST_DEFAULT_PROMPT = `You are the S1→S2 transducer in a viable system model. You receive a buffer of raw operational signals (chat messages, events). Your job is to act as a variety filter: identify what is *new, anomalous, or actionable* — not just summarize.

Return JSON only, no prose. Shape:
{ "themes": [
  { "label": "short title",
    "text": "one or two sentence theme",
    "significance": "low" | "normal" | "high" | "algedonic",
    "userIds": ["..."],
    "channelIds": ["..."]
  }
]}

Use "algedonic" only for genuine emergencies (Beer's pain/pleasure fast-path). If nothing significant has changed, return { "themes": [] }.`

const DIGEST = {
  id: 'digest',
  name: 'Digest',
  description: 'S1→S2 variety filter. Buffers incoming signals, then asks an LLM to extract themes (what is new or anomalous). Emits one narrative signal per theme. Fires after 10s of silence since the last input or when the buffer reaches 5, whichever comes first.',
  hasInputs: true,
  hasOutputs: true,
  placement: ['s1'],
  role: 's1-transducer',
  defaultConfig: {
    debounceMs: 10000,
    maxBuffer: 5,
    systemPrompt: DIGEST_DEFAULT_PROMPT,
    tags: [],
  },
  create(config, runtime) {
    const { bus, instanceId, roomNodeId, roomSystemKey, filters, llm } = runtime
    let unsub = null
    let buffer = []
    let debounceTimer = null
    let flushing = false

    const reportEvent = (sig) => bus.publish(eventsChannel(instanceId), sig)

    const buildThemeSignal = (theme, sources) => {
      const fromTs = sources[0]?.timestamp ?? Date.now()
      const toTs = sources[sources.length - 1]?.timestamp ?? Date.now()
      const sourceTags = new Set()
      for (const s of sources) for (const t of (s.tags || [])) sourceTags.add(t)

      const sig = createSignal(
        'narrative',
        {
          label: theme.label || '',
          text: theme.text || '',
          significance: theme.significance || 'normal',
          userIds: Array.isArray(theme.userIds) ? theme.userIds : [],
          channelIds: Array.isArray(theme.channelIds) ? theme.channelIds : [],
          timeRange: { from: fromTs, to: toTs },
          supporting: sources.map(s => s.id),
        },
        { processorId: instanceId, processorType: 'digest', roomNodeId, roomSystemKey },
      )
      sig.tags = [...(config.tags || []), 'digest', 'theme', ...Array.from(sourceTags)]
      return sig
    }

    const buildAlertSignal = (errMessage, sources) => {
      const sig = createSignal(
        'alert',
        {
          kind: 'digest-failed',
          error: errMessage,
          bufferedCount: sources.length,
          supporting: sources.map(s => s.id),
        },
        { processorId: instanceId, processorType: 'digest', roomNodeId, roomSystemKey },
      )
      sig.tags = [...(config.tags || []), 'digest', 'alert']
      return sig
    }

    const emit = (sig) => {
      const stamped = appendTrace(sig, {
        roomNodeId, roomSystemKey,
        processorId: instanceId, processorType: 'digest',
      })
      const routed = withOutputRouting(stamped, filters)
      publishToRoom(bus, roomNodeId, roomSystemKey, routed)
      reportEvent(routed)
    }

    const parseThemes = (text) => {
      // Tolerate fenced code blocks and surrounding prose.
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('No JSON object in LLM response')
      const parsed = JSON.parse(match[0])
      if (!Array.isArray(parsed.themes)) throw new Error('Response missing themes[]')
      return parsed.themes
    }

    const flush = async (reason) => {
      if (flushing || buffer.length === 0) return
      const sources = buffer
      buffer = []
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
      flushing = true

      reportEvent(createSignal(
        'event',
        { kind: 'digest-flush', reason, count: sources.length },
        { processorId: instanceId, processorType: 'digest', roomNodeId, roomSystemKey },
      ))

      try {
        if (!llm?.prompt) throw new Error('No LLM available in runtime')
        const userPayload = sources.map(s => ({
          id: s.id, ts: s.timestamp, tags: s.tags, content: s.content,
        }))
        const text = await llm.prompt([
          { role: 'system', content: config.systemPrompt || DIGEST_DEFAULT_PROMPT },
          { role: 'user', content: JSON.stringify({ signals: userPayload }) },
        ])
        const themes = parseThemes(text)
        for (const theme of themes) emit(buildThemeSignal(theme, sources))
      } catch (err) {
        emit(buildAlertSignal(String(err.message || err), sources))
      } finally {
        flushing = false
      }
    }

    const onSignal = (signal) => {
      if (hasTraced(signal, instanceId)) return
      if (!signalMatches(signal, filters)) return
      buffer.push(signal)

      if (debounceTimer) clearTimeout(debounceTimer)
      const debounceMs = config.debounceMs ?? 60000
      debounceTimer = setTimeout(() => flush('debounce'), debounceMs)

      const max = config.maxBuffer ?? 20
      if (buffer.length >= max) flush('max-buffer')
    }

    return {
      start() {
        if (unsub) return
        unsub = bus.subscribe(roomChannel(roomNodeId, roomSystemKey), onSignal)
      },
      stop() {
        if (unsub) { unsub(); unsub = null }
        if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
        buffer = []
      },
    }
  },
}

export const PROCESSOR_LIBRARY = [HEARTBEAT, TRACER, LOGGER, WEBSOCKET_TRANSDUCER, DIGEST]

export function getProcessorDef(defId) {
  return PROCESSOR_LIBRARY.find(p => p.id === defId)
}

export function canPlaceProcessor(def, systemKey) {
  if (def.placement === 'any') return true
  if (Array.isArray(def.placement)) return def.placement.includes(systemKey)
  return false
}
