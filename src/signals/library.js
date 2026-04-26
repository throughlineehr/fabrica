// Processor library. Each entry is a definition; create() returns a running
// instance bound to a room.
//
// Runtime receives:
//   { bus, dispatcher, instanceId, roomNodeId, roomSystemKey, filters, llm }
// - bus: live UI feed (eventsChannel) only.
// - dispatcher: cable-driven routing. Emits go through dispatcher.emit;
//   inputs are delivered via the handle's onInput method (registered by
//   the runtime once create() returns).
//
// Filters apply per processor to type/tag only (terminal-list filtering
// moved to the cable graph).

import { createSignal, appendTrace, hasTraced } from './signal'
import { eventsChannel } from './bus'
import { signalMatches } from './filter'

export const SIGNAL_TYPES = ['metric', 'event', 'narrative', 'alert']

// Library categorization. The LibraryDrawer renders these as a chip row;
// processor defs declare which category they belong to via `category`.
// Order in this array is the order the chips render in.
export const PROCESSOR_CATEGORIES = [
  { id: 'connector',  label: 'Connectors',  description: 'Bring outside data in (Slack, HTTP, MQTT, …)' },
  { id: 'transducer', label: 'Transducers', description: 'Reality boundary — S1 only' },
  { id: 'flow',       label: 'Flow',        description: 'Generic signal handling (heartbeat, tracer, logger, …)' },
  { id: 'analysis',   label: 'Analysis',    description: 'Variety attenuation (digest, anomaly, …)' },
  { id: 'governance', label: 'Governance',  description: 'Decision machinery (parliament, policy, audit, …)' },
  { id: 'effector',   label: 'Effectors',   description: 'Outbound side of transducers' },
  { id: 'testing',    label: 'Testing',     description: 'Synthetic sources and validators for verifying detector pipelines' },
]

// Box-Muller for Gaussian noise. Given uniform random in (0,1), returns
// a sample from N(0,1); scale by stddev for arbitrary spread.
function gaussianSample() {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// Convention: every processor declares 4 input ports (top of panel) for
// visual consistency. Most core processors today only functionally consume
// the first input; the rest are reserved for future control inputs (reset,
// rate-CV, gate, etc.) — declared so panel layouts read as one family.
const FOUR_INPUTS = [
  { id: 'in1', label: '1', accepts: { types: null, tags: null } },
  { id: 'in2', label: '2', accepts: { types: null, tags: null } },
  { id: 'in3', label: '3', accepts: { types: null, tags: null } },
  { id: 'in4', label: '4', accepts: { types: null, tags: null } },
]
// Top-row input jack fixtures — the standard 4-across layout used by every
// core panel. Plugin-author convention: inputs always at y=0-1.
const FOUR_INPUT_FIXTURES = (colorKey) => [
  { type: 'jack', id: 'jin1', x: 0, y: 0, kind: 'input', port: 'in1', color: colorKey, label: '1' },
  { type: 'jack', id: 'jin2', x: 2, y: 0, kind: 'input', port: 'in2', color: colorKey, label: '2' },
  { type: 'jack', id: 'jin3', x: 4, y: 0, kind: 'input', port: 'in3', color: colorKey, label: '3' },
  { type: 'jack', id: 'jin4', x: 6, y: 0, kind: 'input', port: 'in4', color: colorKey, label: '4' },
]

// Helper: emit the same signal on every output port a processor declares.
// Cables decide which receivers (if any) it reaches; dedup at the receiver
// handles fan-in collisions.
function emitOnAllOutputs(def, dispatcher, instanceId, signal) {
  for (const p of def.ports?.outputs || []) {
    dispatcher.emit(signal, { fromInstanceId: instanceId, fromPortId: p.id })
  }
}

const HEARTBEAT = {
  id: 'heartbeat',
  name: 'Heartbeat',
  description: 'Emits a metric signal on a regular interval. Source only — no inputs.',
  category: 'flow',
  hasInputs: false,
  hasOutputs: true,
  ports: {
    inputs: [],
    outputs: Array.from({ length: 8 }, (_, i) => ({
      id: `out${i + 1}`, label: String(i + 1),
      emits: { types: ['metric'], tags: [] },
    })),
  },
  placement: 'any',
  defaultConfig: { intervalMs: 3000 },
  panel: {
    widthHP: 8,
    bg: 'mid',
    accent: 's1',
    fixtures: [
      // Source-only processor — no input jacks rendered.
      { type: 'knob', id: 'rate', x: 2, y: 1, size: 'lg',
        bind: 'config.intervalMs', range: [100, 10000], step: 100, unit: 'ms', label: 'rate' },
      { type: 'led',  id: 'beat', x: 6, y: 2, bind: 'state.beat', color: 's1', label: 'beat' },
      // 8 outputs in a 4×2 grid at the bottom
      { type: 'jack', id: 'jout1', x: 0, y: 9,  kind: 'output', port: 'out1', color: 's1', label: '1' },
      { type: 'jack', id: 'jout2', x: 2, y: 9,  kind: 'output', port: 'out2', color: 's1', label: '2' },
      { type: 'jack', id: 'jout3', x: 4, y: 9,  kind: 'output', port: 'out3', color: 's1', label: '3' },
      { type: 'jack', id: 'jout4', x: 6, y: 9,  kind: 'output', port: 'out4', color: 's1', label: '4' },
      { type: 'jack', id: 'jout5', x: 0, y: 11, kind: 'output', port: 'out5', color: 's1', label: '5' },
      { type: 'jack', id: 'jout6', x: 2, y: 11, kind: 'output', port: 'out6', color: 's1', label: '6' },
      { type: 'jack', id: 'jout7', x: 4, y: 11, kind: 'output', port: 'out7', color: 's1', label: '7' },
      { type: 'jack', id: 'jout8', x: 6, y: 11, kind: 'output', port: 'out8', color: 's1', label: '8' },
    ],
  },
  create(config, runtime) {
    const { bus, dispatcher, instanceId, roomNodeId, roomSystemKey } = runtime
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
      emitOnAllOutputs(HEARTBEAT, dispatcher, instanceId, stamped)
      bus.publish(eventsChannel(instanceId), stamped)
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
  category: 'flow',
  hasInputs: true,
  hasOutputs: true,
  ports: {
    inputs: FOUR_INPUTS,
    outputs: Array.from({ length: 4 }, (_, i) => ({
      id: `out${i + 1}`, label: String(i + 1),
      emits: { types: null, tags: [] },
    })),
  },
  placement: 'any',
  defaultConfig: {},
  panel: {
    widthHP: 8,
    bg: 'mid',
    accent: 's3',
    fixtures: [
      ...FOUR_INPUT_FIXTURES('s3'),
      { type: 'divider', id: 'd1', x: 0, y: 4, w: 8, h: 1, orient: 'h' },
      { type: 'label',   id: 'lbl', x: 2, y: 6, w: 4, text: 'TRACE', size: 'sm', color: 's3' },
      // 4 outputs in a 2×2 grid centered at the bottom
      { type: 'jack', id: 'jout1', x: 2, y: 9,  kind: 'output', port: 'out1', color: 's3', label: '1' },
      { type: 'jack', id: 'jout2', x: 4, y: 9,  kind: 'output', port: 'out2', color: 's3', label: '2' },
      { type: 'jack', id: 'jout3', x: 2, y: 11, kind: 'output', port: 'out3', color: 's3', label: '3' },
      { type: 'jack', id: 'jout4', x: 4, y: 11, kind: 'output', port: 'out4', color: 's3', label: '4' },
    ],
  },
  create(_config, runtime) {
    const { bus, dispatcher, instanceId, roomNodeId, roomSystemKey, filters } = runtime
    return {
      onInput({ signal }) {
        if (hasTraced(signal, instanceId)) return
        if (!signalMatches(signal, filters)) return
        const traced = appendTrace(signal, {
          roomNodeId, roomSystemKey,
          processorId: instanceId, processorType: 'tracer',
        })
        emitOnAllOutputs(TRACER, dispatcher, instanceId, traced)
        bus.publish(eventsChannel(instanceId), traced)
      },
      start() {},
      stop() {},
    }
  },
}

const LOGGER = {
  id: 'logger',
  name: 'Logger',
  description: 'Records every signal it sees. Sink only — no outputs.',
  category: 'flow',
  hasInputs: true,
  hasOutputs: false,
  ports: {
    inputs: FOUR_INPUTS,
    outputs: [],
  },
  placement: 'any',
  defaultConfig: {},
  panel: {
    widthHP: 8,
    bg: 'mid',
    accent: 's4',
    fixtures: [
      ...FOUR_INPUT_FIXTURES('s4'),
      { type: 'display', id: 'count', x: 1, y: 4, w: 6, h: 2, bind: 'state.count', label: 'events' },
      { type: 'led',     id: 'idle',  x: 3, y: 9, bind: 'state.idle', color: 's4', label: 'idle' },
    ],
  },
  create(_config, runtime) {
    const { bus, instanceId, filters } = runtime
    const shortId = instanceId.slice(0, 8)
    return {
      onInput({ signal }) {
        if (!signalMatches(signal, filters)) return
        // Mirror to the browser console so the log persists across room
        // navigation. The events channel still drives the in-app feed when
        // the processor page is open.
        const tags = (signal.tags && signal.tags.length) ? ` [${signal.tags.join(',')}]` : ''
        console.log(`[logger ${shortId}] ${signal.type}${tags}`, signal)
        bus.publish(eventsChannel(instanceId), signal)
      },
      start() {},
      stop() {},
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
  category: 'transducer',
  hasInputs: false,
  hasOutputs: true,
  ports: {
    inputs: [],
    outputs: [
      { id: 'out', label: 'out', emits: { types: null, tags: ['transducer', 'websocket'] } },
    ],
  },
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
  panel: {
    widthHP: 8,
    bg: 'mid',
    accent: 's1',
    fixtures: [
      // Source-only processor — no input jacks rendered.
      { type: 'textInput', id: 'url',    x: 0, y: 1, w: 8, h: 1,
        bind: 'config.url', placeholder: 'ws://...', label: 'url' },
      { type: 'dropdown',  id: 'parse',  x: 0, y: 3, w: 4, h: 1,
        bind: 'config.parse', options: [{ value: 'text', label: 'text' }, { value: 'json', label: 'json' }], label: 'parse' },
      { type: 'dropdown',  id: 'sigType',x: 4, y: 3, w: 4, h: 1,
        bind: 'config.signalType', options: [
          { value: 'metric',    label: 'metric' },
          { value: 'event',     label: 'event' },
          { value: 'narrative', label: 'narrative' },
          { value: 'alert',     label: 'alert' },
        ], label: 'type' },
      { type: 'led',       id: 'conn',   x: 1, y: 6, bind: 'state.connected', color: 's1', label: 'conn' },
      { type: 'display',   id: 'count',  x: 2, y: 6, w: 5, h: 1, bind: 'state.msgCount', label: 'msgs' },
      { type: 'jack',      id: 'jout',   x: 3, y: 11, kind: 'output', port: 'out', color: 's1', label: 'out' },
    ],
  },
  create(config, runtime) {
    const { bus, dispatcher, instanceId, roomNodeId, roomSystemKey } = runtime
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
      emitOnAllOutputs(WEBSOCKET_TRANSDUCER, dispatcher, instanceId, stamped)
      bus.publish(eventsChannel(instanceId), stamped)
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
  category: 'analysis',
  hasInputs: true,
  hasOutputs: true,
  ports: {
    inputs: FOUR_INPUTS,
    outputs: [
      { id: 'themes', label: 'themes', emits: { types: ['narrative'], tags: ['digest', 'theme'] } },
      { id: 'alerts', label: 'alerts', emits: { types: ['alert'],     tags: ['digest', 'alert'] } },
    ],
  },
  placement: ['s1'],
  role: 's1-transducer',
  defaultConfig: {
    debounceMs: 10000,
    maxBuffer: 5,
    systemPrompt: DIGEST_DEFAULT_PROMPT,
    tags: [],
  },
  panel: {
    widthHP: 12,
    bg: 'mid',  // Fabrica core convention: all core processors share one bg.
    accent: 's2',
    fixtures: [
      // 4 inputs at top — match the convention. Slight horizontal stretch
      // since the panel is 12HP wide; jacks at x=0,3,6,9.
      { type: 'jack', id: 'jin1', x: 0, y: 0, kind: 'input', port: 'in1', color: 's3', label: '1' },
      { type: 'jack', id: 'jin2', x: 3, y: 0, kind: 'input', port: 'in2', color: 's3', label: '2' },
      { type: 'jack', id: 'jin3', x: 6, y: 0, kind: 'input', port: 'in3', color: 's3', label: '3' },
      { type: 'jack', id: 'jin4', x: 9, y: 0, kind: 'input', port: 'in4', color: 's3', label: '4' },
      // Body controls
      { type: 'knob',    id: 'debounce', x: 1, y: 4, size: 'md',
        bind: 'config.debounceMs', range: [1000, 60000], step: 1000, unit: 'ms', label: 'debounce' },
      { type: 'knob',    id: 'buffer',   x: 5, y: 4, size: 'md',
        bind: 'config.maxBuffer',  range: [1, 50], step: 1, label: 'buffer' },
      { type: 'led',     id: 'algedonic',x: 9, y: 5, bind: 'state.algedonic', color: 'algedonic', label: 'alg' },
      { type: 'display', id: 'bufCount', x: 1, y: 8, w: 8, h: 1, bind: 'state.bufferCount', label: 'buffered' },
      // Outputs at bottom
      { type: 'jack', id: 'jthemes', x: 3, y: 11, kind: 'output', port: 'themes', color: 's2', label: 'themes' },
      { type: 'jack', id: 'jalerts', x: 7, y: 11, kind: 'output', port: 'alerts', color: 'algedonic', label: 'alerts' },
    ],
  },
  create(config, runtime) {
    const { bus, dispatcher, instanceId, roomNodeId, roomSystemKey, filters, llm } = runtime
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

    // Digest emits on a SPECIFIC output port (themes vs alerts) — they have
    // different semantics. Pass the portId in.
    const emit = (sig, portId) => {
      const stamped = appendTrace(sig, {
        roomNodeId, roomSystemKey,
        processorId: instanceId, processorType: 'digest',
      })
      dispatcher.emit(stamped, { fromInstanceId: instanceId, fromPortId: portId })
      reportEvent(stamped)
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
        for (const theme of themes) emit(buildThemeSignal(theme, sources), 'themes')
      } catch (err) {
        emit(buildAlertSignal(String(err.message || err), sources), 'alerts')
      } finally {
        flushing = false
      }
    }

    return {
      onInput({ signal }) {
        if (hasTraced(signal, instanceId)) return
        if (!signalMatches(signal, filters)) return
        buffer.push(signal)

        if (debounceTimer) clearTimeout(debounceTimer)
        const debounceMs = config.debounceMs ?? 60000
        debounceTimer = setTimeout(() => flush('debounce'), debounceMs)

        const max = config.maxBuffer ?? 20
        if (buffer.length >= max) flush('max-buffer')
      },
      start() {},
      stop() {
        if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
        buffer = []
      },
    }
  },
}

// TEST GENERATOR ----------------------------------------------------------
// Synthetic signal source for verifying detector / analyser pipelines. Emits
// a continuous numerical stream tagged with the active patterns, accepts
// detection events back on its input, and tracks which scheduled events
// were caught vs missed in an internal ledger. Periodic structured reports
// flow out of the `report` port.
//
// The "expected input" is the ledger: every scheduled discrete test event
// (step / anomaly) becomes an entry that's flipped to `caught: true` when a
// matching detection arrives within `matchToleranceMs`. Continuous patterns
// (trend / period) are tracked as boolean "ever-detected" flags.

const TEST_GENERATOR = {
  id: 'test-generator',
  name: 'Test Generator',
  description: 'Synthetic numerical stream for detector validation. Mix baseline, noise, trend, periodicity, scheduled steps and anomalies. Tracks which emitted events get caught by downstream detectors.',
  category: 'testing',
  hasInputs: true,
  hasOutputs: true,
  ports: {
    inputs: [
      // Anything arriving here is treated as a candidate detection. Properly
      // tagged ('detection' + kind) → matched against the ledger. Anything
      // else → counted as a false positive so a self-loop (data → results)
      // explodes the FP counter and produces a FAIL verdict.
      { id: 'results', label: 'results', accepts: { types: null, tags: null } },
    ],
    outputs: [
      { id: 'data',   label: 'data',   emits: { types: ['metric'],    tags: ['testdata'] } },
      { id: 'report', label: 'report', emits: { types: ['narrative'], tags: ['testdata', 'report'] } },
    ],
  },
  placement: 'any',
  defaultConfig: {
    intervalMs: 500,
    baseline: 50,
    noise: 2,
    trendSlope: 0,
    periodAmplitude: 0,
    periodMs: 30000,
    stepDelta: 20,
    anomalyValue: 100,
    matchToleranceMs: 3000,
    reportIntervalMs: 15000,
  },
  panel: {
    widthHP: 14,
    bg: 'mid',
    accent: 's4',
    fixtures: [
      // Results input at top-left (2x2 due to default jack size). Wire
      // detector outputs here for the test generator to score.
      { type: 'jack', id: 'jin', x: 0, y: 0, kind: 'input', port: 'results', color: 's4', label: 'rslt' },
      // Pattern knobs (row y=2-3)
      { type: 'knob', id: 'baseline',        x: 0,  y: 2, size: 'md',
        bind: 'config.baseline',        range: [0, 200],     step: 1,    label: 'base' },
      { type: 'knob', id: 'noise',           x: 2,  y: 2, size: 'md',
        bind: 'config.noise',           range: [0, 20],      step: 0.5,  label: 'noise' },
      { type: 'knob', id: 'trendSlope',      x: 4,  y: 2, size: 'md',
        bind: 'config.trendSlope',      range: [-5, 5],      step: 0.1,  unit: '/s', label: 'trend' },
      { type: 'knob', id: 'periodAmplitude', x: 6,  y: 2, size: 'md',
        bind: 'config.periodAmplitude', range: [0, 50],      step: 1,    label: 'amp' },
      { type: 'knob', id: 'periodMs',        x: 8,  y: 2, size: 'md',
        bind: 'config.periodMs',        range: [1000, 120000], step: 1000, unit: 'ms', label: 'period' },
      { type: 'knob', id: 'intervalMs',      x: 10, y: 2, size: 'md',
        bind: 'config.intervalMs',      range: [100, 5000],  step: 100,  unit: 'ms', label: 'rate' },
      // Inject row (y=5-6: knobs span 2 rows; buttons sit on y=5)
      { type: 'knob',   id: 'stepDelta',     x: 0,  y: 5, size: 'md',
        bind: 'config.stepDelta',     range: [-50, 50], step: 1, label: 'Δstep' },
      { type: 'button', id: 'btnStep',       x: 2,  y: 5, w: 2, h: 1, action: 'step',    label: 'step' },
      { type: 'knob',   id: 'anomalyValue',  x: 4,  y: 5, size: 'md',
        bind: 'config.anomalyValue',  range: [0, 200],  step: 1, label: 'spike' },
      { type: 'button', id: 'btnAnomaly',    x: 6,  y: 5, w: 2, h: 1, action: 'anomaly', label: 'spike' },
      { type: 'button', id: 'btnReport',     x: 8,  y: 5, w: 2, h: 1, action: 'report',  label: 'report' },
      { type: 'button', id: 'btnReset',      x: 10, y: 5, w: 2, h: 1, action: 'reset',   label: 'reset' },
      // Live ledger — small displays so they fit four-across
      { type: 'display', id: 'caught',   x: 0,  y: 8, w: 3, h: 1, bind: 'state.caught',          label: 'caught' },
      { type: 'display', id: 'missed',   x: 3,  y: 8, w: 3, h: 1, bind: 'state.missed',          label: 'missed' },
      { type: 'display', id: 'falsePos', x: 6,  y: 8, w: 3, h: 1, bind: 'state.falsePositives',  label: 'false+' },
      { type: 'display', id: 'emitted',  x: 9,  y: 8, w: 3, h: 1, bind: 'state.emitted',         label: 'emitted' },
      // Outputs — data jack on left, report jack on right
      { type: 'jack', id: 'jdata',   x: 3,  y: 11, kind: 'output', port: 'data',   color: 's4', label: 'data' },
      { type: 'jack', id: 'jreport', x: 9,  y: 11, kind: 'output', port: 'report', color: 's2', label: 'report' },
    ],
  },
  create(config, runtime) {
    const { bus, dispatcher, instanceId, roomNodeId, roomSystemKey, filters } = runtime
    let timer = null
    let reportTimer = null
    let startMs = 0
    let seq = 0

    // Ledger of discrete scheduled events (steps + anomalies). Each entry:
    //   { id, kind: 'step'|'anomaly', at: ms-relative-to-startMs, magnitude, caught, detectionAt? }
    const ledger = []
    const cumulativeStepOffset = () => ledger
      .filter(e => e.kind === 'step' && (Date.now() - startMs) >= e.at)
      .reduce((s, e) => s + e.magnitude, 0)

    // Continuous-pattern detection flags (set true when any detection arrives
    // matching a currently-active pattern).
    const patternFlags = { trend: false, period: false }

    // FP breakdown so the report can explain *why* a self-loop fails:
    // malformed = no 'detection' tag at all (raw data signals echoed back)
    // unkindish = 'detection' tag but no recognised kind tag
    // hallucinated = detector claimed a continuous pattern that isn't active
    // unmatched = detection arrived but no nearby ledger entry of that kind
    let counts = {
      emitted: 0, detectionsReceived: 0,
      malformed: 0, unkindish: 0, hallucinated: 0, unmatched: 0,
    }
    const totalFalsePositives = () =>
      counts.malformed + counts.unkindish + counts.hallucinated + counts.unmatched

    const computeVerdict = (test, fp) => {
      const d = test.discrete
      const c = test.continuous
      const dApplicable = d.expected > 0
      const trendApplicable = c.trend.active
      const periodApplicable = c.period.active
      const totalTests = (dApplicable ? d.expected : 0)
        + (trendApplicable ? 1 : 0) + (periodApplicable ? 1 : 0)

      if (totalTests === 0) {
        if (fp > 0) return { verdict: 'FAIL', reason: `No tests scheduled but ${fp} false positives received` }
        return { verdict: 'NO TEST', reason: 'No tests scheduled. Configure trend/period or press step/spike to schedule discrete events.' }
      }
      const caught = (dApplicable ? d.caught : 0)
        + (trendApplicable && c.trend.detected ? 1 : 0)
        + (periodApplicable && c.period.detected ? 1 : 0)
      const passRate = caught / totalTests

      if (passRate === 1 && fp === 0) {
        return { verdict: 'PASS', reason: `${caught}/${totalTests} caught, no false positives` }
      }
      if (caught === 0) {
        return { verdict: 'FAIL', reason: `0/${totalTests} caught${fp ? `, ${fp} false positives` : ''}` }
      }
      if (passRate >= 0.5 && fp <= totalTests) {
        return { verdict: 'PARTIAL', reason: `${caught}/${totalTests} caught${fp ? `, ${fp} false positives` : ''}` }
      }
      return { verdict: 'FAIL', reason: `${caught}/${totalTests} caught, ${fp} false positives` }
    }

    const buildReport = () => {
      const runtimeMs = Date.now() - startMs
      const expectedDiscrete = ledger.length
      const caughtDiscrete = ledger.filter(e => e.caught).length
      const missedDiscrete = ledger.filter(e =>
        !e.caught && (Date.now() - startMs) > e.at + (config.matchToleranceMs || 3000)
      ).length
      const pendingDiscrete = expectedDiscrete - caughtDiscrete - missedDiscrete

      const test = {
        discrete: {
          expected: expectedDiscrete,
          caught: caughtDiscrete,
          missed: missedDiscrete,
          pending: pendingDiscrete,
        },
        continuous: {
          trend:  { active: config.trendSlope !== 0, detected: patternFlags.trend },
          period: { active: config.periodAmplitude > 0, detected: patternFlags.period },
        },
      }
      const fp = totalFalsePositives()
      const { verdict, reason } = computeVerdict(test, fp)

      const sig = createSignal(
        'narrative',
        {
          kind: 'test-report',
          verdict, reason,
          runtimeMs,
          test,
          falsePositives: {
            total: fp,
            malformed: counts.malformed,
            unkindish: counts.unkindish,
            hallucinated: counts.hallucinated,
            unmatched: counts.unmatched,
          },
          patterns: {
            baseline: config.baseline,
            noise: config.noise,
            trendSlope: config.trendSlope,
            periodAmplitude: config.periodAmplitude,
            periodMs: config.periodMs,
          },
          ledger: ledger.map(e => ({
            id: e.id, kind: e.kind, at: e.at, magnitude: e.magnitude, caught: e.caught,
          })),
          counts: {
            emitted: counts.emitted,
            detectionsReceived: counts.detectionsReceived,
          },
        },
        { processorId: instanceId, processorType: 'test-generator', roomNodeId, roomSystemKey },
      )
      sig.tags = ['testdata', 'report', `verdict:${verdict.toLowerCase().replace(/\s+/g, '-')}`]
      const stamped = appendTrace(sig, { roomNodeId, roomSystemKey, processorId: instanceId, processorType: 'test-generator' })
      dispatcher.emit(stamped, { fromInstanceId: instanceId, fromPortId: 'report' })
      bus.publish(eventsChannel(instanceId), stamped)
    }

    const tick = () => {
      const now = Date.now()
      const t = (now - startMs) / 1000
      const tags = ['testdata']

      let value = config.baseline
      if (config.trendSlope) { value += config.trendSlope * t; tags.push('trending') }
      if (config.periodAmplitude > 0) {
        value += config.periodAmplitude * Math.sin(2 * Math.PI * (now - startMs) / config.periodMs)
        tags.push('periodic')
      }
      value += cumulativeStepOffset()
      // Anomaly: if there's a scheduled anomaly within ±intervalMs/2 of now, override the value.
      const tol = (config.intervalMs || 500) / 2
      const anomaly = ledger.find(e => e.kind === 'anomaly' && !e.fired && Math.abs((now - startMs) - e.at) < tol)
      if (anomaly) {
        value = anomaly.magnitude
        anomaly.fired = true
        tags.push('anomaly', `event:${anomaly.id}`)
      }
      // Step boundary: tag the first tick where a step engages.
      const stepBoundary = ledger.find(e => e.kind === 'step' && !e.fired && (now - startMs) >= e.at)
      if (stepBoundary) {
        stepBoundary.fired = true
        tags.push('step', `event:${stepBoundary.id}`)
      }
      if (tags.length === 1) tags.push('baseline')
      // Add gaussian noise last so the test event tags still align with the
      // "intended" value modulo measurement noise.
      if (config.noise > 0) value += gaussianSample() * config.noise

      seq += 1
      counts.emitted = seq
      const sig = createSignal(
        'metric',
        { key: 'test', value, seq, eventId: stepBoundary?.id || anomaly?.id || null },
        { processorId: instanceId, processorType: 'test-generator', roomNodeId, roomSystemKey },
      )
      sig.tags = tags
      const stamped = appendTrace(sig, {
        roomNodeId, roomSystemKey, processorId: instanceId, processorType: 'test-generator',
      })
      dispatcher.emit(stamped, { fromInstanceId: instanceId, fromPortId: 'data' })
      bus.publish(eventsChannel(instanceId), stamped)
    }

    const onInput = ({ signal }) => {
      if (!signalMatches(signal, filters)) return
      counts.detectionsReceived += 1

      // Detection contract: signal carries 'detection' tag plus a kind tag
      // (step/anomaly/trend/periodic). Anything else arriving on the
      // results port is noise and counts as a false positive — the whole
      // point is to make a self-loop fail loudly.
      const tags = signal.tags || []
      if (!tags.includes('detection')) {
        counts.malformed += 1
        return
      }
      const subkind = tags.find(t => ['step','anomaly','trend','periodic'].includes(t))
                  || signal.content?.subkind
      if (!subkind) {
        counts.unkindish += 1
        return
      }

      if (subkind === 'trend') {
        if (config.trendSlope !== 0) patternFlags.trend = true
        else counts.hallucinated += 1
        return
      }
      if (subkind === 'periodic') {
        if (config.periodAmplitude > 0) patternFlags.period = true
        else counts.hallucinated += 1
        return
      }

      // Discrete: match against unmatched ledger events of the same kind in
      // the recent past.
      const detectedAt = signal.timestamp || Date.now()
      const tol = config.matchToleranceMs || 3000
      const candidate = ledger.find(e =>
        e.kind === subkind && !e.caught &&
        Math.abs((detectedAt - startMs) - e.at) <= tol
      )
      if (candidate) {
        candidate.caught = true
        candidate.detectionAt = detectedAt - startMs
      } else {
        counts.unmatched += 1
      }
    }

    const onAction = (action) => {
      const now = Date.now()
      if (action === 'step') {
        const id = `step-${ledger.length + 1}`
        // Arm the step ~1s in the future so the panel-press has time to settle.
        ledger.push({ id, kind: 'step', at: (now - startMs) + 1000, magnitude: config.stepDelta, caught: false, fired: false })
      } else if (action === 'anomaly') {
        const id = `anomaly-${ledger.length + 1}`
        ledger.push({ id, kind: 'anomaly', at: (now - startMs) + 1000, magnitude: config.anomalyValue, caught: false, fired: false })
      } else if (action === 'reset') {
        ledger.length = 0
        patternFlags.trend = false
        patternFlags.period = false
        counts = {
          emitted: 0, detectionsReceived: 0,
          malformed: 0, unkindish: 0, hallucinated: 0, unmatched: 0,
        }
        seq = 0
        startMs = Date.now()
      } else if (action === 'report') {
        buildReport()
      }
    }

    return {
      onInput,
      onAction,
      start() {
        if (timer) return
        startMs = Date.now()
        timer = setInterval(tick, config.intervalMs || 500)
        if (config.reportIntervalMs > 0) {
          reportTimer = setInterval(buildReport, config.reportIntervalMs)
        }
      },
      stop() {
        if (timer) { clearInterval(timer); timer = null }
        if (reportTimer) { clearInterval(reportTimer); reportTimer = null }
      },
    }
  },
}

// TEST EXPLAINER ----------------------------------------------------------
// LLM-backed processor that turns a Test Generator's structured report into
// a plain-language pass/fail narrative. Designed to be wired downstream of
// `test-generator.report` so a human reading the live feed can see what the
// detector pipeline got right, what it missed, and what surprised it.
//
// One LLM call per report received. The prompt asks for a short paragraph
// plus a one-line verdict so it integrates well with the live signal feed.

const TEST_EXPLAINER_PROMPT = `You are an explainer for an automated testing harness. The user has wired a synthetic signal generator (which knows what test events it scheduled) to one or more detector processors, and wired the detection signals back to the generator. The generator emits a structured "test-report" signal periodically with this shape:

{
  patterns: { baseline, noise, trendSlope, periodAmplitude, periodMs },
  continuous: { trendActive, trendDetected, periodActive, periodDetected },
  discrete: { expected, caught, missed, falsePositives, ledger: [{id, kind, at, magnitude, caught}] },
  runtimeMs
}

When you receive a report, write a brief plain-language summary (<= 4 sentences) covering:
- which patterns were configured and whether the detectors caught them,
- the discrete-event score (caught/missed/falsePositives),
- one specific missed event if any (cite by id and kind),
- a one-line verdict at the end starting with "VERDICT:" — one of "PASS", "PARTIAL", or "FAIL".

Be concrete and concise. No greeting, no preamble, no markdown.`

const TEST_EXPLAINER = {
  id: 'test-explainer',
  name: 'Test Explainer',
  description: 'LLM agent that reads Test Generator reports and writes plain-language pass/fail narratives. Wire test-generator.report into this processor and route its narrative output to a Logger.',
  category: 'testing',
  hasInputs: true,
  hasOutputs: true,
  ports: {
    inputs: [
      { id: 'reports', label: 'reports', accepts: { types: ['narrative'], tags: ['testdata', 'report'] } },
    ],
    outputs: [
      { id: 'narrative', label: 'narrative', emits: { types: ['narrative'], tags: ['testdata', 'explanation'] } },
    ],
  },
  placement: 'any',
  defaultConfig: {
    systemPrompt: TEST_EXPLAINER_PROMPT,
  },
  panel: {
    widthHP: 8,
    bg: 'mid',
    accent: 's2',
    fixtures: [
      { type: 'jack', id: 'jin',   x: 0, y: 0, kind: 'input',  port: 'reports',  color: 's2', label: 'rpt' },
      { type: 'led',  id: 'busy',  x: 4, y: 1, bind: 'state.busy', color: 's2', label: 'busy' },
      { type: 'display', id: 'verdict', x: 0, y: 4, w: 8, h: 2, bind: 'state.lastVerdict', label: 'verdict' },
      { type: 'display', id: 'count',   x: 0, y: 7, w: 4, h: 1, bind: 'state.explained',   label: 'reports' },
      { type: 'jack', id: 'jout',  x: 3, y: 11, kind: 'output', port: 'narrative', color: 's2', label: 'out' },
    ],
  },
  create(config, runtime) {
    const { bus, dispatcher, instanceId, roomNodeId, roomSystemKey, filters, llm } = runtime
    let inFlight = false

    const onInput = async ({ signal }) => {
      if (signal?.content?.kind !== 'test-report') return
      if (!signalMatches(signal, filters)) return
      if (!llm?.prompt) {
        // Surface the misconfiguration through the live feed so the user
        // doesn't wonder why nothing comes out.
        bus.publish(eventsChannel(instanceId), createSignal(
          'alert',
          { kind: 'no-llm', error: 'No LLM configured in runtime' },
          { processorId: instanceId, processorType: 'test-explainer', roomNodeId, roomSystemKey },
        ))
        return
      }
      if (inFlight) return // back-pressure: drop overlapping reports
      inFlight = true

      let text
      try {
        text = await llm.prompt([
          { role: 'system', content: config.systemPrompt || TEST_EXPLAINER_PROMPT },
          { role: 'user',   content: JSON.stringify(signal.content) },
        ])
      } catch (err) {
        bus.publish(eventsChannel(instanceId), createSignal(
          'alert',
          { kind: 'explainer-failed', error: String(err?.message || err) },
          { processorId: instanceId, processorType: 'test-explainer', roomNodeId, roomSystemKey },
        ))
        inFlight = false
        return
      } finally {
        // inFlight cleared in success path below; finally still runs.
      }
      inFlight = false

      const verdictMatch = text.match(/VERDICT:\s*(PASS|PARTIAL|FAIL)/i)
      const verdict = verdictMatch ? verdictMatch[1].toUpperCase() : 'UNKNOWN'

      const out = createSignal(
        'narrative',
        {
          text: text.trim(),
          verdict,
          source: { reportId: signal.id },
        },
        { processorId: instanceId, processorType: 'test-explainer', roomNodeId, roomSystemKey },
      )
      out.tags = ['testdata', 'explanation', `verdict:${verdict.toLowerCase()}`]
      const stamped = appendTrace(out, {
        roomNodeId, roomSystemKey, processorId: instanceId, processorType: 'test-explainer',
      })
      dispatcher.emit(stamped, { fromInstanceId: instanceId, fromPortId: 'narrative' })
      bus.publish(eventsChannel(instanceId), stamped)
    }

    return {
      onInput,
      start() {},
      stop() { inFlight = false },
    }
  },
}

export const PROCESSOR_LIBRARY = [HEARTBEAT, TRACER, LOGGER, WEBSOCKET_TRANSDUCER, DIGEST, TEST_GENERATOR, TEST_EXPLAINER]

export function getProcessorDef(defId) {
  return PROCESSOR_LIBRARY.find(p => p.id === defId)
}

export function canPlaceProcessor(def, systemKey) {
  if (def.placement === 'any') return true
  if (Array.isArray(def.placement)) return def.placement.includes(systemKey)
  return false
}
