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

// PERIOD DETECTOR --------------------------------------------------------
// Autocorrelation-based periodicity detector. Buffers incoming numerical
// samples and, on each check tick, computes the normalised autocorrelation
// at lags between minLag and N/2. The strongest peak above `threshold` is
// declared the detected period; the lag is converted to milliseconds via
// the buffer's average sample interval.
//
// Wire `test-generator.data → period-detector.in` and
// `period-detector.detection → test-generator.results` to validate the
// periodicity-test path: with the test generator's `amp` knob > 0 the
// detector should fire `detection`/`periodic` signals; with `amp` at 0 it
// should stay silent.

const PERIOD_DETECTOR = {
  id: 'period-detector',
  name: 'Period Detector',
  description: 'Autocorrelation-based periodicity detector. Buffers numerical input and emits a detection signal when a strong periodic component is found above the confidence threshold.',
  category: 'analysis',
  hasInputs: true,
  hasOutputs: true,
  ports: {
    inputs: [
      { id: 'in', label: 'in', accepts: { types: ['metric'], tags: null } },
    ],
    outputs: [
      { id: 'detection', label: 'detection', emits: { types: ['event'], tags: ['detection', 'periodic'] } },
    ],
  },
  placement: 'any',
  defaultConfig: {
    bufferSize: 128,
    threshold: 0.5,
    checkIntervalMs: 3000,
    minPeriodMs: 1000,
  },
  panel: {
    widthHP: 10,
    bg: 'mid',
    accent: 's3',
    fixtures: [
      { type: 'jack',  id: 'jin', x: 0, y: 0, kind: 'input', port: 'in', color: 's3', label: 'in' },
      // Tuning knobs
      { type: 'knob', id: 'threshold',     x: 0, y: 2, size: 'md',
        bind: 'config.threshold',     range: [0, 1],         step: 0.05, label: 'thr' },
      { type: 'knob', id: 'bufferSize',    x: 2, y: 2, size: 'md',
        bind: 'config.bufferSize',    range: [16, 1024],     step: 16,   label: 'buf' },
      { type: 'knob', id: 'checkIntervalMs', x: 4, y: 2, size: 'md',
        bind: 'config.checkIntervalMs', range: [500, 30000], step: 500,  unit: 'ms', label: 'rate' },
      { type: 'knob', id: 'minPeriodMs',   x: 6, y: 2, size: 'md',
        bind: 'config.minPeriodMs',   range: [200, 60000],   step: 200,  unit: 'ms', label: 'minP' },
      // Status: LED + numeric readouts (state-binding plumbing pending,
      // labels still describe the intended view).
      { type: 'led',     id: 'detected',  x: 1, y: 5, bind: 'state.detected', color: 's3', label: 'det' },
      { type: 'display', id: 'periodMs',  x: 2, y: 5, w: 4, h: 1, bind: 'state.periodMs',   label: 'period' },
      { type: 'display', id: 'confidence',x: 6, y: 5, w: 3, h: 1, bind: 'state.confidence', label: 'conf' },
      { type: 'display', id: 'samples',   x: 0, y: 8, w: 4, h: 1, bind: 'state.samples',    label: 'samples' },
      // Output
      { type: 'jack', id: 'jout', x: 4, y: 11, kind: 'output', port: 'detection', color: 's3', label: 'det' },
    ],
  },
  create(config, runtime) {
    const { bus, dispatcher, instanceId, roomNodeId, roomSystemKey, filters } = runtime
    const buffer = [] // {value, timestamp}
    let timer = null

    const detectPeriod = () => {
      const N = buffer.length
      // Need at least 2× minimum-detectable lag worth of samples for
      // autocorrelation to mean anything.
      if (N < 32) return null

      const mean = buffer.reduce((s, p) => s + p.value, 0) / N
      const detrended = buffer.map(p => p.value - mean)
      const variance = detrended.reduce((s, v) => s + v * v, 0)
      if (variance === 0) return null

      // Sweep autocorrelation lags from minLag to N/2. minLag = 4 skips
      // the trivial-and-noisy first few lags. Use the *unbiased* normaliser
      // (s * N / ((N-k) * variance)) — the biased version
      // (s / variance) shrinks with lag because the cross-sum has fewer
      // terms, which can make a 4-sample-period harmonic beat the actual
      // period at higher lags.
      const minLag = 4
      const maxLag = Math.floor(N / 2)
      let bestLag = 0
      let bestR = 0
      for (let k = minLag; k <= maxLag; k++) {
        let s = 0
        for (let i = 0; i < N - k; i++) s += detrended[i] * detrended[i + k]
        const r = (s * N) / ((N - k) * variance)
        if (r > bestR) { bestR = r; bestLag = k }
      }

      if (bestR < (config.threshold ?? 0.5)) return null

      const totalSpan = buffer[N - 1].timestamp - buffer[0].timestamp
      if (totalSpan <= 0) return null
      const avgInterval = totalSpan / (N - 1)
      const periodMs = bestLag * avgInterval
      if (periodMs < (config.minPeriodMs ?? 1000)) return null

      return { periodMs, confidence: bestR, lag: bestLag }
    }

    const check = () => {
      const detection = detectPeriod()
      if (!detection) return
      const sig = createSignal(
        'event',
        {
          subkind: 'periodic',
          periodMs: Math.round(detection.periodMs),
          confidence: Number(detection.confidence.toFixed(3)),
          samples: buffer.length,
        },
        { processorId: instanceId, processorType: 'period-detector', roomNodeId, roomSystemKey },
      )
      sig.tags = ['detection', 'periodic']
      const stamped = appendTrace(sig, {
        roomNodeId, roomSystemKey,
        processorId: instanceId, processorType: 'period-detector',
      })
      dispatcher.emit(stamped, { fromInstanceId: instanceId, fromPortId: 'detection' })
      bus.publish(eventsChannel(instanceId), stamped)
    }

    return {
      onInput({ signal }) {
        if (!signalMatches(signal, filters)) return
        const value = signal.content?.value
        if (typeof value !== 'number' || !Number.isFinite(value)) return
        buffer.push({ value, timestamp: signal.timestamp || Date.now() })
        const cap = config.bufferSize || 128
        while (buffer.length > cap) buffer.shift()
      },
      start() {
        if (timer) return
        timer = setInterval(check, config.checkIntervalMs || 3000)
      },
      stop() {
        if (timer) { clearInterval(timer); timer = null }
        buffer.length = 0
      },
    }
  },
}

// NLP PROCESSORS (non-LLM) ------------------------------------------------
// Three composable text primitives that work without calling out to a
// language model: Sentiment (lexicon polarity), Keyword Extractor (RAKE),
// and Entity Extractor (regex-based URL/mention/hashtag/amount). They all
// look for text in the input signal at content.text / .message / .label /
// .body / .value and ignore signals that don't carry any.

function extractText(signal) {
  const c = signal?.content
  if (!c) return null
  if (typeof c === 'string') return c
  if (typeof c.text === 'string') return c.text
  if (typeof c.message === 'string') return c.message
  if (typeof c.label === 'string') return c.label
  if (typeof c.body === 'string') return c.body
  if (typeof c.value === 'string') return c.value
  return null
}

// Small AFINN-style polarity lexicon. Tuned for the kinds of operational
// chatter Fabrica is going to see (slack, alerts, ops feedback). User can
// override / extend via config.lexicon.
const SENTIMENT_LEXICON = {
  // positive
  good: 2, great: 3, excellent: 4, love: 3, happy: 3, wonderful: 4,
  fantastic: 4, amazing: 3, perfect: 3, beautiful: 3, success: 2, wins: 2,
  win: 2, best: 3, awesome: 3, thanks: 2, helpful: 2, easy: 1, fast: 1,
  smooth: 1, fixed: 2, resolved: 2, working: 1, deployed: 1, shipped: 2,
  // negative
  bad: -2, terrible: -4, hate: -3, awful: -3, broken: -3, fail: -3,
  failed: -3, error: -2, urgent: -2, critical: -3, emergency: -4, crash: -3,
  crashed: -3, slow: -1, stuck: -2, buggy: -2, dead: -2, problem: -2,
  issue: -2, blocker: -3, outage: -4, regression: -2, leak: -2,
  // negators
  not: -1, no: -1, never: -1,
}

const SENTIMENT = {
  id: 'sentiment',
  name: 'Sentiment',
  description: 'Lexicon-based polarity scorer. Extracts text from incoming signals, looks each token up in a small AFINN-style lexicon, and emits a metric signal with normalised polarity ∈ [-1, +1] plus a positive/negative/neutral tag.',
  category: 'analysis',
  hasInputs: true,
  hasOutputs: true,
  ports: {
    inputs: [
      { id: 'in', label: 'in', accepts: { types: null, tags: null } },
    ],
    outputs: [
      { id: 'score', label: 'score', emits: { types: ['metric'], tags: ['sentiment'] } },
    ],
  },
  placement: 'any',
  defaultConfig: {
    threshold: 0.05,    // |polarity| above this = positive/negative; otherwise neutral
    lexicon: null,      // optional override map; merged onto the built-in
  },
  panel: {
    widthHP: 8,
    bg: 'mid',
    accent: 's2',
    fixtures: [
      { type: 'jack',  id: 'jin', x: 0, y: 0, kind: 'input', port: 'in', color: 's2', label: 'in' },
      { type: 'knob',  id: 'threshold', x: 2, y: 2, size: 'md',
        bind: 'config.threshold', range: [0, 0.5], step: 0.01, label: 'thr' },
      { type: 'led',   id: 'pos', x: 1, y: 5, bind: 'state.lastPositive', color: 's1', label: '+' },
      { type: 'led',   id: 'neg', x: 4, y: 5, bind: 'state.lastNegative', color: 's2', label: '−' },
      { type: 'display', id: 'lastScore', x: 0, y: 8, w: 8, h: 1, bind: 'state.lastPolarity', label: 'polarity' },
      { type: 'jack',  id: 'jout', x: 3, y: 11, kind: 'output', port: 'score', color: 's2', label: 'score' },
    ],
  },
  create(config, runtime) {
    const { bus, dispatcher, instanceId, roomNodeId, roomSystemKey, filters } = runtime
    const lexicon = { ...SENTIMENT_LEXICON, ...(config.lexicon || {}) }
    const threshold = config.threshold ?? 0.05
    return {
      onInput({ signal }) {
        if (!signalMatches(signal, filters)) return
        const text = extractText(signal)
        if (!text) return
        const tokens = text.toLowerCase().match(/[a-z']+/g) || []
        let score = 0, hits = 0
        for (const tok of tokens) {
          if (lexicon[tok] != null) { score += lexicon[tok]; hits += 1 }
        }
        const polarity = tokens.length > 0 ? score / tokens.length : 0
        const polarityTag = polarity > threshold ? 'positive'
                          : polarity < -threshold ? 'negative' : 'neutral'

        const out = createSignal(
          'metric',
          {
            key: 'sentiment',
            value: polarity,
            polarity,
            score,
            hits,
            totalTokens: tokens.length,
            polarityTag,
            source: { signalId: signal.id, snippet: text.slice(0, 200) },
          },
          { processorId: instanceId, processorType: 'sentiment', roomNodeId, roomSystemKey },
        )
        out.tags = ['sentiment', polarityTag]
        const stamped = appendTrace(out, {
          roomNodeId, roomSystemKey, processorId: instanceId, processorType: 'sentiment',
        })
        dispatcher.emit(stamped, { fromInstanceId: instanceId, fromPortId: 'score' })
        bus.publish(eventsChannel(instanceId), stamped)
      },
      start() {},
      stop() {},
    }
  },
}

// Stopwords for RAKE (English, small). Plenty for typical chatter; users
// can extend via config.stopwords.
const RAKE_STOPWORDS = new Set([
  'a','an','the','and','or','but','if','then','else','of','in','on','at',
  'to','for','with','by','from','as','is','are','was','were','be','been',
  'being','have','has','had','do','does','did','will','would','could',
  'should','may','might','must','shall','can','this','that','these','those',
  'i','you','he','she','it','we','they','me','him','her','us','them','my',
  'your','his','hers','its','our','their','what','which','who','whom',
  'so','than','too','very','just','about','also','here','there','where',
  'when','why','how','all','any','both','each','few','more','most','other',
  'some','such','no','nor','not','only','own','same','than','too','very',
])

// RAKE keyword extraction. Splits text on stopwords + punctuation into
// candidate phrases, scores each word as (degree+freq)/freq (degree =
// sum of phrase-lengths it appears in, minus self), sums word scores per
// phrase, returns the top-K.
function rake(text, opts) {
  const stopwords = opts.stopwords || RAKE_STOPWORDS
  const minPhraseLen = opts.minPhraseLen ?? 1
  const maxPhraseLen = opts.maxPhraseLen ?? 4
  const topK = opts.topK ?? 8

  const lowered = text.toLowerCase()
  const sentences = lowered.split(/[.!?,;:\n\r\t/()[\]{}<>"]+/)
  const phrases = []
  for (const sent of sentences) {
    const tokens = sent.match(/[a-z][a-z'-]*/g) || []
    let cur = []
    const flush = () => {
      if (cur.length >= minPhraseLen && cur.length <= maxPhraseLen) phrases.push(cur)
      cur = []
    }
    for (const tok of tokens) {
      if (stopwords.has(tok) || tok.length < 2) flush()
      else cur.push(tok)
    }
    flush()
  }
  if (phrases.length === 0) return []

  const freq = new Map()
  const degree = new Map()
  for (const phrase of phrases) {
    for (const word of phrase) {
      freq.set(word, (freq.get(word) || 0) + 1)
      // degree contribution from this phrase = phrase.length - 1 (co-occurring others)
      degree.set(word, (degree.get(word) || 0) + (phrase.length - 1))
    }
  }
  const wordScore = new Map()
  for (const [w, f] of freq) {
    wordScore.set(w, ((degree.get(w) || 0) + f) / f)
  }
  const phraseScores = new Map()
  for (const phrase of phrases) {
    const t = phrase.join(' ')
    if (phraseScores.has(t)) continue
    phraseScores.set(t, phrase.reduce((s, w) => s + (wordScore.get(w) || 0), 0))
  }
  return Array.from(phraseScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([phrase, score]) => ({ phrase, score: Number(score.toFixed(3)) }))
}

const KEYWORD_EXTRACTOR = {
  id: 'keyword-extractor',
  name: 'Keyword Extractor',
  description: 'RAKE-based keyphrase extraction. No LLM. Splits each text input on stopwords and punctuation into candidate phrases, scores each by RAKE\'s degree/frequency formula, and emits a narrative signal carrying the top-K phrases.',
  category: 'analysis',
  hasInputs: true,
  hasOutputs: true,
  ports: {
    inputs: [
      { id: 'in', label: 'in', accepts: { types: null, tags: null } },
    ],
    outputs: [
      { id: 'keywords', label: 'keywords', emits: { types: ['narrative'], tags: ['keywords'] } },
    ],
  },
  placement: 'any',
  defaultConfig: {
    topK: 8,
    minPhraseLen: 1,
    maxPhraseLen: 4,
  },
  panel: {
    widthHP: 8,
    bg: 'mid',
    accent: 's3',
    fixtures: [
      { type: 'jack', id: 'jin', x: 0, y: 0, kind: 'input', port: 'in', color: 's3', label: 'in' },
      { type: 'knob', id: 'topK',         x: 1, y: 2, size: 'md',
        bind: 'config.topK',         range: [1, 32], step: 1, label: 'top-k' },
      { type: 'knob', id: 'maxPhraseLen', x: 4, y: 2, size: 'md',
        bind: 'config.maxPhraseLen', range: [1, 8], step: 1, label: 'max len' },
      { type: 'display', id: 'lastTop', x: 0, y: 5, w: 8, h: 3, bind: 'state.lastTop', label: 'top phrases' },
      { type: 'jack', id: 'jout', x: 3, y: 11, kind: 'output', port: 'keywords', color: 's3', label: 'kw' },
    ],
  },
  create(config, runtime) {
    const { bus, dispatcher, instanceId, roomNodeId, roomSystemKey, filters } = runtime
    return {
      onInput({ signal }) {
        if (!signalMatches(signal, filters)) return
        const text = extractText(signal)
        if (!text) return
        const phrases = rake(text, {
          topK: config.topK ?? 8,
          minPhraseLen: config.minPhraseLen ?? 1,
          maxPhraseLen: config.maxPhraseLen ?? 4,
        })
        if (phrases.length === 0) return
        const out = createSignal(
          'narrative',
          {
            kind: 'keywords',
            phrases, // [{phrase, score}]
            source: { signalId: signal.id, snippet: text.slice(0, 200) },
          },
          { processorId: instanceId, processorType: 'keyword-extractor', roomNodeId, roomSystemKey },
        )
        out.tags = ['keywords']
        const stamped = appendTrace(out, {
          roomNodeId, roomSystemKey, processorId: instanceId, processorType: 'keyword-extractor',
        })
        dispatcher.emit(stamped, { fromInstanceId: instanceId, fromPortId: 'keywords' })
        bus.publish(eventsChannel(instanceId), stamped)
      },
      start() {},
      stop() {},
    }
  },
}

// Default entity patterns. Order matters because we run them all and emit
// one signal per kind that found ≥1 match.
const ENTITY_PATTERNS = [
  { kind: 'url',     re: /https?:\/\/[^\s)]+/g },
  { kind: 'email',   re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { kind: 'mention', re: /@[a-zA-Z0-9_-]+/g },
  { kind: 'hashtag', re: /#[a-zA-Z0-9_-]+/g },
  { kind: 'amount',  re: /\$[\d,]+(?:\.\d+)?/g },
  { kind: 'date',    re: /\b\d{4}-\d{2}-\d{2}\b/g },
]

const ENTITY_EXTRACTOR = {
  id: 'entity-extractor',
  name: 'Entity Extractor',
  description: 'Regex-based extractor for URLs, emails, @mentions, #hashtags, $amounts, and ISO dates. Emits one event signal per kind that matched, with the list of values found.',
  category: 'analysis',
  hasInputs: true,
  hasOutputs: true,
  ports: {
    inputs: [
      { id: 'in', label: 'in', accepts: { types: null, tags: null } },
    ],
    outputs: [
      { id: 'entities', label: 'entities', emits: { types: ['event'], tags: ['entity'] } },
    ],
  },
  placement: 'any',
  defaultConfig: {},
  panel: {
    widthHP: 8,
    bg: 'mid',
    accent: 's4',
    fixtures: [
      { type: 'jack', id: 'jin', x: 0, y: 0, kind: 'input', port: 'in', color: 's4', label: 'in' },
      { type: 'led', id: 'urlled',  x: 0, y: 2, bind: 'state.lastUrl',     color: 's3', label: 'url' },
      { type: 'led', id: 'mentled', x: 2, y: 2, bind: 'state.lastMention', color: 's3', label: '@' },
      { type: 'led', id: 'hashled', x: 4, y: 2, bind: 'state.lastHashtag', color: 's3', label: '#' },
      { type: 'led', id: 'amtled',  x: 6, y: 2, bind: 'state.lastAmount',  color: 's3', label: '$' },
      { type: 'display', id: 'count', x: 0, y: 5, w: 8, h: 1, bind: 'state.lastCount', label: 'matches' },
      { type: 'jack', id: 'jout', x: 3, y: 11, kind: 'output', port: 'entities', color: 's4', label: 'ents' },
    ],
  },
  create(config, runtime) {
    const { bus, dispatcher, instanceId, roomNodeId, roomSystemKey, filters } = runtime
    return {
      onInput({ signal }) {
        if (!signalMatches(signal, filters)) return
        const text = extractText(signal)
        if (!text) return
        for (const { kind, re } of ENTITY_PATTERNS) {
          // Reset lastIndex defensively in case the regex object is shared
          re.lastIndex = 0
          const matches = []
          let m
          while ((m = re.exec(text)) !== null) {
            matches.push(m[0])
            // Avoid infinite loop on zero-length matches
            if (m.index === re.lastIndex) re.lastIndex += 1
          }
          if (matches.length === 0) continue
          const out = createSignal(
            'event',
            {
              kind: 'entity',
              entityKind: kind,
              values: matches,
              source: { signalId: signal.id, snippet: text.slice(0, 200) },
            },
            { processorId: instanceId, processorType: 'entity-extractor', roomNodeId, roomSystemKey },
          )
          out.tags = ['entity', kind]
          const stamped = appendTrace(out, {
            roomNodeId, roomSystemKey, processorId: instanceId, processorType: 'entity-extractor',
          })
          dispatcher.emit(stamped, { fromInstanceId: instanceId, fromPortId: 'entities' })
          bus.publish(eventsChannel(instanceId), stamped)
        }
      },
      start() {},
      stop() {},
    }
  },
}

// NEAR-DUPLICATE DETECTOR -------------------------------------------------
// SimHash fingerprint over a rolling window of recent signals. New input is
// hashed, then compared by Hamming distance against the fingerprints in the
// window. Within `hammingThreshold` bits → "near-duplicate" (the original
// signal is *not* forwarded to `unique`; instead a metadata event is fired
// on `duplicate`). Otherwise the signal passes through `unique` and its
// fingerprint joins the window.
//
// Wire NearDup.unique → downstream Digest/Logger/etc. to deduplicate; wire
// NearDup.duplicate → a counter or alert to surface how much of the
// incoming stream is repeats.

// 32-bit FNV-1a — small, no deps, plenty for SimHash word voting.
function fnv1a32(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// 32-bit SimHash over a token list. Each token contributes ±1 to each bit
// position based on the bits of its hash; final fingerprint takes a 1
// where the cumulative vote is positive. Order-independent (bag-of-words).
function simhash32(tokens) {
  const counters = new Int32Array(32)
  for (const tok of tokens) {
    const h = fnv1a32(tok)
    for (let i = 0; i < 32; i++) {
      counters[i] += ((h >>> i) & 1) ? 1 : -1
    }
  }
  let fp = 0
  for (let i = 0; i < 32; i++) {
    if (counters[i] > 0) fp |= (1 << i)
  }
  return fp >>> 0
}

// Hamming distance on 32-bit ints — bit-twiddle popcount of the XOR.
function hamming32(a, b) {
  let v = (a ^ b) >>> 0
  v = v - ((v >>> 1) & 0x55555555)
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333)
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}

const NEAR_DUP_DETECTOR = {
  id: 'near-duplicate-detector',
  name: 'Near-Duplicate Detector',
  description: 'SimHash-based deduplicator. Each incoming text signal is fingerprinted; if a fingerprint within `hammingThreshold` bits exists in the rolling window, the signal is suppressed from the `unique` output and a metadata event fires on `duplicate`. Otherwise the original passes through `unique` and its fingerprint joins the window.',
  category: 'analysis',
  hasInputs: true,
  hasOutputs: true,
  ports: {
    inputs: [
      { id: 'in', label: 'in', accepts: { types: null, tags: null } },
    ],
    outputs: [
      // Pass-through of the original signal when it's not a near-duplicate.
      { id: 'unique',    label: 'unique',    emits: { types: null,    tags: ['unique-after-dedup'] } },
      // New event describing the match — does NOT include the original.
      { id: 'duplicate', label: 'duplicate', emits: { types: ['event'], tags: ['near-duplicate'] } },
    ],
  },
  placement: 'any',
  defaultConfig: {
    hammingThreshold: 3,    // ≤3 bits differ on 32-bit fingerprint = ~9% — typical near-dup cutoff
    windowMs: 60000,        // forget fingerprints older than this
    windowSize: 200,        // hard cap on buffered fingerprints (memory bound)
  },
  panel: {
    widthHP: 10,
    bg: 'mid',
    accent: 's3',
    fixtures: [
      { type: 'jack', id: 'jin', x: 0, y: 0, kind: 'input', port: 'in', color: 's3', label: 'in' },
      { type: 'knob', id: 'hammingThreshold', x: 0, y: 2, size: 'md',
        bind: 'config.hammingThreshold', range: [0, 12], step: 1, label: 'thr' },
      { type: 'knob', id: 'windowMs', x: 2, y: 2, size: 'md',
        bind: 'config.windowMs', range: [1000, 600000], step: 1000, unit: 'ms', label: 'window' },
      { type: 'knob', id: 'windowSize', x: 4, y: 2, size: 'md',
        bind: 'config.windowSize', range: [10, 2000], step: 10, label: 'cap' },
      { type: 'display', id: 'unique',    x: 0, y: 5, w: 4, h: 1, bind: 'state.uniqueCount',    label: 'unique' },
      { type: 'display', id: 'duplicate', x: 4, y: 5, w: 4, h: 1, bind: 'state.duplicateCount', label: 'dup' },
      { type: 'display', id: 'window',    x: 0, y: 8, w: 8, h: 1, bind: 'state.windowSize',     label: 'in window' },
      { type: 'jack', id: 'jUnique',    x: 1, y: 11, kind: 'output', port: 'unique',    color: 's3', label: 'uniq' },
      { type: 'jack', id: 'jDuplicate', x: 7, y: 11, kind: 'output', port: 'duplicate', color: 's2', label: 'dup' },
    ],
  },
  create(config, runtime) {
    const { bus, dispatcher, instanceId, roomNodeId, roomSystemKey, filters } = runtime
    // Ring of recent unique fingerprints. Each entry:
    //   { fingerprint, signalId, timestamp, snippet }
    let window = []

    return {
      onInput({ signal }) {
        if (!signalMatches(signal, filters)) return
        const text = extractText(signal)
        if (!text) return
        const tokens = text.toLowerCase().match(/[a-z0-9]+/g) || []
        if (tokens.length === 0) return

        // Trim by age and cap.
        const now = Date.now()
        const maxAge = config.windowMs ?? 60000
        if (window.length && now - window[0].timestamp > maxAge) {
          window = window.filter(e => now - e.timestamp <= maxAge)
        }
        const cap = config.windowSize ?? 200

        const fp = simhash32(tokens)
        const threshold = config.hammingThreshold ?? 3

        // Linear scan — fine up to cap=2000. For larger windows we'd want
        // banded LSH; not worth it for this scale.
        let match = null
        for (const e of window) {
          const d = hamming32(fp, e.fingerprint)
          if (d <= threshold) { match = { entry: e, distance: d }; break }
        }

        const snippet = text.slice(0, 200)

        if (match) {
          const out = createSignal(
            'event',
            {
              kind: 'near-duplicate',
              distance: match.distance,
              fingerprint: fp.toString(16).padStart(8, '0'),
              originalSignalId: signal.id,
              matchedSignalId: match.entry.signalId,
              matchedAt: match.entry.timestamp,
              snippet,
              matchedSnippet: match.entry.snippet,
            },
            { processorId: instanceId, processorType: 'near-duplicate-detector', roomNodeId, roomSystemKey },
          )
          out.tags = ['near-duplicate']
          const stamped = appendTrace(out, {
            roomNodeId, roomSystemKey, processorId: instanceId, processorType: 'near-duplicate-detector',
          })
          dispatcher.emit(stamped, { fromInstanceId: instanceId, fromPortId: 'duplicate' })
          bus.publish(eventsChannel(instanceId), stamped)
          return
        }

        // Unique: register in window, then pass-through the original.
        window.push({ fingerprint: fp, signalId: signal.id, timestamp: now, snippet })
        if (window.length > cap) window.splice(0, window.length - cap)

        const passthrough = {
          ...signal,
          tags: [...(signal.tags || []), 'unique-after-dedup'],
        }
        dispatcher.emit(passthrough, { fromInstanceId: instanceId, fromPortId: 'unique' })
        bus.publish(eventsChannel(instanceId), passthrough)
      },
      start() {},
      stop() { window = [] },
    }
  },
}

// TOP-K TRACKER -----------------------------------------------------------
// Generic windowed-frequency processor. Reads a configurable dot-path off
// every incoming signal (default: `tags`), counts each value over the last
// `windowMs` milliseconds, and emits a narrative signal periodically with
// the top-K values ranked by count.
//
// The path can resolve to a string (counted once per signal) or an array
// (each element counted). Combine with anything that emits structured
// signals: tags off entity-extractor, polarityTag off sentiment, hashtags
// pulled from entity-extractor's `values`, anything.

function readPath(obj, path) {
  if (!obj || !path) return undefined
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj)
}

function valuesFromPath(signal, path) {
  const v = readPath(signal, path)
  if (v == null) return []
  if (Array.isArray(v)) return v.map(x => String(x))
  return [String(v)]
}

const TOP_K_TRACKER = {
  id: 'top-k-tracker',
  name: 'Top-K Tracker',
  description: 'Reads a configurable dot-path off every incoming signal (default: `tags`), counts each value over a rolling window, and emits a narrative ranked top-K periodically. Generic enough to count anything: tag frequencies, entity kinds, polarity outcomes, hashtag mentions.',
  category: 'analysis',
  hasInputs: true,
  hasOutputs: true,
  ports: {
    inputs: [
      { id: 'in', label: 'in', accepts: { types: null, tags: null } },
    ],
    outputs: [
      { id: 'top', label: 'top', emits: { types: ['narrative'], tags: ['top-k'] } },
    ],
  },
  placement: 'any',
  defaultConfig: {
    key: 'tags',          // dot-path off the signal — try 'content.entityKind', 'content.polarityTag', etc.
    topK: 5,
    windowMs: 30000,
    reportIntervalMs: 5000,
    minCount: 1,          // suppress values seen fewer than this many times in the window
    maxBufferSize: 10000, // memory safety bound; oldest evicted past this
  },
  panel: {
    widthHP: 10,
    bg: 'mid',
    accent: 's3',
    fixtures: [
      { type: 'jack', id: 'jin', x: 0, y: 0, kind: 'input', port: 'in', color: 's3', label: 'in' },
      { type: 'knob', id: 'topK',         x: 0, y: 2, size: 'md',
        bind: 'config.topK',         range: [1, 50], step: 1, label: 'top-k' },
      { type: 'knob', id: 'windowMs',     x: 2, y: 2, size: 'md',
        bind: 'config.windowMs',     range: [1000, 600000], step: 1000, unit: 'ms', label: 'window' },
      { type: 'knob', id: 'reportIntervalMs', x: 4, y: 2, size: 'md',
        bind: 'config.reportIntervalMs', range: [500, 60000], step: 500, unit: 'ms', label: 'rate' },
      { type: 'knob', id: 'minCount',     x: 6, y: 2, size: 'md',
        bind: 'config.minCount',     range: [1, 100], step: 1, label: 'min' },
      { type: 'display', id: 'distinct', x: 0, y: 5, w: 4, h: 1, bind: 'state.distinct', label: 'distinct' },
      { type: 'display', id: 'total',    x: 4, y: 5, w: 4, h: 1, bind: 'state.total',    label: 'samples' },
      { type: 'display', id: 'lastTop',  x: 0, y: 8, w: 8, h: 1, bind: 'state.lastTop',  label: 'top now' },
      { type: 'jack', id: 'jout', x: 4, y: 11, kind: 'output', port: 'top', color: 's3', label: 'top' },
    ],
  },
  create(config, runtime) {
    const { bus, dispatcher, instanceId, roomNodeId, roomSystemKey, filters } = runtime
    let buffer = [] // {value, timestamp}
    let timer = null

    const trim = (now) => {
      const windowMs = config.windowMs ?? 30000
      // Drop entries outside the window. Cheap because we always push to
      // the end → buffer is age-sorted.
      let drop = 0
      while (drop < buffer.length && now - buffer[drop].timestamp > windowMs) drop++
      if (drop > 0) buffer = buffer.slice(drop)
      const cap = config.maxBufferSize ?? 10000
      if (buffer.length > cap) buffer = buffer.slice(buffer.length - cap)
    }

    const tick = () => {
      const now = Date.now()
      trim(now)
      if (buffer.length === 0) return

      const counts = new Map()
      for (const { value } of buffer) counts.set(value, (counts.get(value) || 0) + 1)
      const total = buffer.length
      const minCount = config.minCount ?? 1
      const topK = Array.from(counts.entries())
        .filter(([, c]) => c >= minCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, config.topK ?? 5)
        .map(([value, count]) => ({
          value, count,
          share: Number((count / total).toFixed(3)),
        }))
      if (topK.length === 0) return

      const out = createSignal(
        'narrative',
        {
          kind: 'top-k',
          key: config.key ?? 'tags',
          windowMs: config.windowMs ?? 30000,
          totalSamples: total,
          distinct: counts.size,
          topK,
        },
        { processorId: instanceId, processorType: 'top-k-tracker', roomNodeId, roomSystemKey },
      )
      out.tags = ['top-k', `key:${config.key ?? 'tags'}`]
      const stamped = appendTrace(out, {
        roomNodeId, roomSystemKey, processorId: instanceId, processorType: 'top-k-tracker',
      })
      dispatcher.emit(stamped, { fromInstanceId: instanceId, fromPortId: 'top' })
      bus.publish(eventsChannel(instanceId), stamped)
    }

    return {
      onInput({ signal }) {
        if (!signalMatches(signal, filters)) return
        const path = config.key ?? 'tags'
        const values = valuesFromPath(signal, path)
        if (values.length === 0) return
        const now = Date.now()
        for (const v of values) buffer.push({ value: v, timestamp: now })
        // Light incremental trim so the buffer doesn't spike between ticks.
        if (buffer.length > (config.maxBufferSize ?? 10000)) trim(now)
      },
      start() {
        if (timer) return
        timer = setInterval(tick, config.reportIntervalMs ?? 5000)
      },
      stop() {
        if (timer) { clearInterval(timer); timer = null }
        buffer = []
      },
    }
  },
}

// STEP DETECTOR -----------------------------------------------------------
// Split-window step-change detector. Buffers 2N recent samples, splits into
// older/newer halves, and fires a `detection`+`step` signal when the
// difference of means exceeds `threshold` pooled standard deviations.
// Cooldown suppresses re-firing on the same shift.

const STEP_DETECTOR = {
  id: 'step-detector',
  name: 'Step Detector',
  description: 'Split-window step-change detector. Compares the mean of the newer half of a 2N buffer against the older half; fires when |Δmean / pooled-stddev| exceeds `threshold` (default 3). Cooldown prevents repeated emission for the same step.',
  category: 'analysis',
  hasInputs: true,
  hasOutputs: true,
  ports: {
    inputs: [
      { id: 'in', label: 'in', accepts: { types: ['metric'], tags: null } },
    ],
    outputs: [
      { id: 'detection', label: 'detection', emits: { types: ['event'], tags: ['detection', 'step'] } },
    ],
  },
  placement: 'any',
  defaultConfig: {
    windowSize: 16,        // each half — total buffer is 2 * windowSize
    threshold: 3,
    cooldownMs: 5000,
    checkIntervalMs: 500,
  },
  panel: {
    widthHP: 10,
    bg: 'mid',
    accent: 's3',
    fixtures: [
      { type: 'jack', id: 'jin', x: 0, y: 0, kind: 'input', port: 'in', color: 's3', label: 'in' },
      { type: 'knob', id: 'windowSize',      x: 0, y: 2, size: 'md',
        bind: 'config.windowSize',      range: [4, 128],   step: 1,    label: 'half-N' },
      { type: 'knob', id: 'threshold',       x: 2, y: 2, size: 'md',
        bind: 'config.threshold',       range: [1, 10],    step: 0.5,  label: 'thr (σ)' },
      { type: 'knob', id: 'cooldownMs',      x: 4, y: 2, size: 'md',
        bind: 'config.cooldownMs',      range: [0, 60000], step: 500,  unit: 'ms', label: 'cool' },
      { type: 'knob', id: 'checkIntervalMs', x: 6, y: 2, size: 'md',
        bind: 'config.checkIntervalMs', range: [100, 5000], step: 100, unit: 'ms', label: 'rate' },
      { type: 'led',     id: 'fired',     x: 1, y: 5, bind: 'state.lastFired',  color: 's3', label: 'fired' },
      { type: 'display', id: 'lastT',     x: 2, y: 5, w: 4, h: 1, bind: 'state.lastT',      label: 't-stat' },
      { type: 'display', id: 'lastDelta', x: 0, y: 8, w: 8, h: 1, bind: 'state.lastDelta',  label: 'Δmean' },
      { type: 'jack', id: 'jout', x: 4, y: 11, kind: 'output', port: 'detection', color: 's3', label: 'det' },
    ],
  },
  create(config, runtime) {
    const { bus, dispatcher, instanceId, roomNodeId, roomSystemKey, filters } = runtime
    const buffer = []     // {value, timestamp}
    let lastDetectionMs = 0
    let lastBoundaryStamp = 0  // timestamp of the last reported step boundary
    let timer = null

    // Sweep all possible boundary positions in the buffer and return the
    // one with the largest |t-stat| above threshold. This makes the
    // detector robust to the step being anywhere in recent history rather
    // than at the exact mid-point of the most recent 2N samples.
    const detect = () => {
      const n = config.windowSize ?? 16
      if (buffer.length < n * 2) return null
      let best = null
      const threshold = config.threshold ?? 3
      for (let b = n; b <= buffer.length - n; b++) {
        let sumO = 0, sumN = 0
        for (let i = b - n; i < b; i++) sumO += buffer[i].value
        for (let i = b; i < b + n; i++) sumN += buffer[i].value
        const meanO = sumO / n
        const meanN = sumN / n
        let varO = 0, varN = 0
        for (let i = b - n; i < b; i++) varO += (buffer[i].value - meanO) ** 2
        for (let i = b; i < b + n; i++) varN += (buffer[i].value - meanN) ** 2
        varO /= Math.max(1, n - 1)
        varN /= Math.max(1, n - 1)
        const pooledStd = Math.sqrt((varO + varN) / 2 + 1e-9)
        const t = (meanN - meanO) / pooledStd
        if (Math.abs(t) < threshold) continue
        if (!best || Math.abs(t) > Math.abs(best.t)) {
          best = {
            magnitude: meanN - meanO,
            t,
            boundaryAt: buffer[b].timestamp,
          }
        }
      }
      return best
    }

    const check = () => {
      const now = Date.now()
      if (now - lastDetectionMs < (config.cooldownMs ?? 5000)) return
      const r = detect()
      if (!r) return
      // Suppress re-firing on the same boundary — necessary because the
      // sweep keeps finding the same step until it falls out of the buffer.
      if (r.boundaryAt === lastBoundaryStamp) return
      lastBoundaryStamp = r.boundaryAt
      lastDetectionMs = now
      const sig = createSignal(
        'event',
        {
          subkind: 'step',
          magnitude: Number(r.magnitude.toFixed(3)),
          t: Number(r.t.toFixed(3)),
          boundaryAt: r.boundaryAt,
        },
        { processorId: instanceId, processorType: 'step-detector', roomNodeId, roomSystemKey },
      )
      sig.tags = ['detection', 'step']
      sig.timestamp = r.boundaryAt
      const stamped = appendTrace(sig, {
        roomNodeId, roomSystemKey, processorId: instanceId, processorType: 'step-detector',
      })
      dispatcher.emit(stamped, { fromInstanceId: instanceId, fromPortId: 'detection' })
      bus.publish(eventsChannel(instanceId), stamped)
    }

    return {
      onInput({ signal }) {
        if (!signalMatches(signal, filters)) return
        const v = signal.content?.value
        if (typeof v !== 'number' || !Number.isFinite(v)) return
        buffer.push({ value: v, timestamp: signal.timestamp || Date.now() })
        // Keep ~6 windows of history so the boundary sweep has room.
        const cap = (config.windowSize ?? 16) * 6
        while (buffer.length > cap) buffer.shift()
      },
      start() {
        if (timer) return
        timer = setInterval(check, config.checkIntervalMs ?? 500)
      },
      stop() {
        if (timer) { clearInterval(timer); timer = null }
        buffer.length = 0
      },
    }
  },
}

// TREND DETECTOR ----------------------------------------------------------
// Rolling-window linear-regression slope estimator. Fits a line to the last
// N samples (sample-index vs value), computes the slope's standard error
// and t-statistic, and fires `detection`+`trend` when |t| exceeds
// `threshold`. The slope is reported in units-per-second using the
// buffer's average sample interval.

const TREND_DETECTOR = {
  id: 'trend-detector',
  name: 'Trend Detector',
  description: 'Rolling-window linear-regression trend detector. Fits a line over the last N samples; fires when the slope is significantly non-zero (|slope / SE| > threshold). Reports slope in units-per-second and direction.',
  category: 'analysis',
  hasInputs: true,
  hasOutputs: true,
  ports: {
    inputs: [
      { id: 'in', label: 'in', accepts: { types: ['metric'], tags: null } },
    ],
    outputs: [
      { id: 'detection', label: 'detection', emits: { types: ['event'], tags: ['detection', 'trend'] } },
    ],
  },
  placement: 'any',
  defaultConfig: {
    windowSize: 32,
    threshold: 3,
    checkIntervalMs: 2000,
    minSamples: 16,
  },
  panel: {
    widthHP: 10,
    bg: 'mid',
    accent: 's3',
    fixtures: [
      { type: 'jack', id: 'jin', x: 0, y: 0, kind: 'input', port: 'in', color: 's3', label: 'in' },
      { type: 'knob', id: 'windowSize',      x: 0, y: 2, size: 'md',
        bind: 'config.windowSize',      range: [8, 256],    step: 1,    label: 'N' },
      { type: 'knob', id: 'threshold',       x: 2, y: 2, size: 'md',
        bind: 'config.threshold',       range: [1, 10],     step: 0.5,  label: 'thr (σ)' },
      { type: 'knob', id: 'minSamples',      x: 4, y: 2, size: 'md',
        bind: 'config.minSamples',      range: [4, 128],    step: 1,    label: 'minN' },
      { type: 'knob', id: 'checkIntervalMs', x: 6, y: 2, size: 'md',
        bind: 'config.checkIntervalMs', range: [500, 30000], step: 500, unit: 'ms', label: 'rate' },
      { type: 'led',     id: 'detected', x: 1, y: 5, bind: 'state.detected',  color: 's3', label: 'trend' },
      { type: 'display', id: 'slope',    x: 2, y: 5, w: 4, h: 1, bind: 'state.slope',    label: 'slope/s' },
      { type: 'display', id: 'tstat',    x: 0, y: 8, w: 8, h: 1, bind: 'state.tstat',    label: 't-stat' },
      { type: 'jack', id: 'jout', x: 4, y: 11, kind: 'output', port: 'detection', color: 's3', label: 'det' },
    ],
  },
  create(config, runtime) {
    const { bus, dispatcher, instanceId, roomNodeId, roomSystemKey, filters } = runtime
    const buffer = []     // {value, timestamp}
    let timer = null

    const detect = () => {
      const N = buffer.length
      const minN = config.minSamples ?? 16
      if (N < minN) return null

      const window = buffer.slice(-Math.min(N, config.windowSize ?? 32))
      const W = window.length
      let sx = 0, sy = 0, sxx = 0, sxy = 0
      for (let i = 0; i < W; i++) {
        sx += i; sy += window[i].value
        sxx += i * i; sxy += i * window[i].value
      }
      const denom = W * sxx - sx * sx
      if (denom === 0) return null
      const slope = (W * sxy - sx * sy) / denom
      const intercept = (sy - slope * sx) / W
      let ssRes = 0
      for (let i = 0; i < W; i++) {
        const pred = intercept + slope * i
        ssRes += (window[i].value - pred) ** 2
      }
      const xMean = sx / W
      const ssXX = sxx - sx * xMean
      if (ssXX <= 0) return null
      // Standard error of slope: sqrt(ssRes / (W-2)) / sqrt(ssXX)
      const se = Math.sqrt(ssRes / Math.max(1, W - 2)) / Math.sqrt(ssXX) || 1e-9
      const t = slope / se
      if (Math.abs(t) < (config.threshold ?? 3)) return null

      const totalSpan = window[W - 1].timestamp - window[0].timestamp
      if (totalSpan <= 0) return null
      const avgIntervalSec = (totalSpan / (W - 1)) / 1000
      const slopePerSec = slope / avgIntervalSec
      return {
        slopePerSec,
        t,
        direction: slope > 0 ? 'up' : 'down',
      }
    }

    const check = () => {
      const r = detect()
      if (!r) return
      const sig = createSignal(
        'event',
        {
          subkind: 'trend',
          slope: Number(r.slopePerSec.toFixed(4)),
          t: Number(r.t.toFixed(3)),
          direction: r.direction,
        },
        { processorId: instanceId, processorType: 'trend-detector', roomNodeId, roomSystemKey },
      )
      sig.tags = ['detection', 'trend']
      const stamped = appendTrace(sig, {
        roomNodeId, roomSystemKey, processorId: instanceId, processorType: 'trend-detector',
      })
      dispatcher.emit(stamped, { fromInstanceId: instanceId, fromPortId: 'detection' })
      bus.publish(eventsChannel(instanceId), stamped)
    }

    return {
      onInput({ signal }) {
        if (!signalMatches(signal, filters)) return
        const v = signal.content?.value
        if (typeof v !== 'number' || !Number.isFinite(v)) return
        buffer.push({ value: v, timestamp: signal.timestamp || Date.now() })
        const cap = (config.windowSize ?? 32) * 2
        while (buffer.length > cap) buffer.shift()
      },
      start() {
        if (timer) return
        timer = setInterval(check, config.checkIntervalMs ?? 2000)
      },
      stop() {
        if (timer) { clearInterval(timer); timer = null }
        buffer.length = 0
      },
    }
  },
}

// ANOMALY DETECTOR --------------------------------------------------------
// Online z-score outlier detector. Welford's algorithm maintains running
// mean and variance; new samples whose |z| ≥ threshold fire `detection`+
// `anomaly` and are *excluded* from the running statistics so the baseline
// doesn't drift toward the anomaly. Warmup ignores the first
// `warmupSamples` samples until the baseline stabilises.

const ANOMALY_DETECTOR = {
  id: 'anomaly-detector',
  name: 'Anomaly Detector',
  description: 'Online z-score outlier detector. Welford running mean + variance; fires when |z-score| ≥ threshold. Anomalous samples are excluded from the running statistics so the baseline doesn\'t drift toward the anomaly.',
  category: 'analysis',
  hasInputs: true,
  hasOutputs: true,
  ports: {
    inputs: [
      { id: 'in', label: 'in', accepts: { types: ['metric'], tags: null } },
    ],
    outputs: [
      { id: 'detection', label: 'detection', emits: { types: ['event'], tags: ['detection', 'anomaly'] } },
    ],
  },
  placement: 'any',
  defaultConfig: {
    threshold: 3,
    warmupSamples: 30,
  },
  panel: {
    widthHP: 8,
    bg: 'mid',
    accent: 's3',
    fixtures: [
      { type: 'jack', id: 'jin', x: 0, y: 0, kind: 'input', port: 'in', color: 's3', label: 'in' },
      { type: 'knob', id: 'threshold',     x: 1, y: 2, size: 'md',
        bind: 'config.threshold',     range: [1, 10],   step: 0.5, label: 'thr (σ)' },
      { type: 'knob', id: 'warmupSamples', x: 4, y: 2, size: 'md',
        bind: 'config.warmupSamples', range: [5, 500], step: 1,   label: 'warmup' },
      { type: 'led',     id: 'fired', x: 1, y: 5, bind: 'state.lastFired',  color: 's3', label: 'fired' },
      { type: 'display', id: 'mean',  x: 0, y: 8, w: 4, h: 1, bind: 'state.mean',     label: 'mean' },
      { type: 'display', id: 'std',   x: 4, y: 8, w: 4, h: 1, bind: 'state.stddev',   label: 'σ' },
      { type: 'jack', id: 'jout', x: 3, y: 11, kind: 'output', port: 'detection', color: 's3', label: 'det' },
    ],
  },
  create(config, runtime) {
    const { bus, dispatcher, instanceId, roomNodeId, roomSystemKey, filters } = runtime
    let count = 0
    let mean = 0
    let M2 = 0   // running sum of squared deviations (Welford)

    const updateStats = (v) => {
      count += 1
      const delta = v - mean
      mean += delta / count
      M2 += delta * (v - mean)
    }

    return {
      onInput({ signal }) {
        if (!signalMatches(signal, filters)) return
        const v = signal.content?.value
        if (typeof v !== 'number' || !Number.isFinite(v)) return

        const warmup = config.warmupSamples ?? 30
        if (count < warmup) {
          updateStats(v)
          return
        }
        const variance = M2 / Math.max(1, count - 1)
        const stddev = Math.sqrt(variance + 1e-9)
        const z = (v - mean) / stddev
        const threshold = config.threshold ?? 3

        if (Math.abs(z) < threshold) {
          // Within tolerance — update running stats
          updateStats(v)
          return
        }
        // Anomaly: fire detection but DON'T update the baseline.
        const sig = createSignal(
          'event',
          {
            subkind: 'anomaly',
            value: v,
            z: Number(z.toFixed(3)),
            mean: Number(mean.toFixed(3)),
            stddev: Number(stddev.toFixed(3)),
          },
          { processorId: instanceId, processorType: 'anomaly-detector', roomNodeId, roomSystemKey },
        )
        sig.tags = ['detection', 'anomaly']
        sig.timestamp = signal.timestamp || Date.now()
        const stamped = appendTrace(sig, {
          roomNodeId, roomSystemKey, processorId: instanceId, processorType: 'anomaly-detector',
        })
        dispatcher.emit(stamped, { fromInstanceId: instanceId, fromPortId: 'detection' })
        bus.publish(eventsChannel(instanceId), stamped)
      },
      start() {},
      stop() { count = 0; mean = 0; M2 = 0 },
    }
  },
}

// PULSE BATCHER -----------------------------------------------------------
// Eurorack-style sample-and-hold across a window. Inputs are buffered
// silently; on each flush tick (`batchMs`) the entire buffer is emitted in
// a burst on the output port, then cleared. Useful for converting a
// continuous stream into discrete pulses ("every 5 seconds, fire whatever
// arrived during the window").

const PULSE_BATCHER = {
  id: 'pulse-batcher',
  name: 'Pulse Batcher',
  description: 'Buffers incoming signals silently and emits them in a burst on a periodic flush timer. Pass-through — each signal arrives downstream unchanged, just with everything-at-once timing.',
  category: 'flow',
  hasInputs: true,
  hasOutputs: true,
  ports: {
    inputs: [
      { id: 'in', label: 'in', accepts: { types: null, tags: null } },
    ],
    outputs: [
      { id: 'out', label: 'out', emits: { types: null, tags: null } },
    ],
  },
  placement: 'any',
  defaultConfig: {
    batchMs: 5000,
    maxBuffer: 1000, // safety cap — drops oldest when exceeded
  },
  panel: {
    widthHP: 8,
    bg: 'mid',
    accent: 's3',
    fixtures: [
      { type: 'jack', id: 'jin', x: 0, y: 0, kind: 'input', port: 'in', color: 's3', label: 'in' },
      { type: 'knob', id: 'batchMs', x: 1, y: 2, size: 'md',
        bind: 'config.batchMs', range: [100, 60000], step: 100, unit: 'ms', label: 'batch' },
      { type: 'knob', id: 'maxBuffer', x: 4, y: 2, size: 'md',
        bind: 'config.maxBuffer', range: [10, 10000], step: 10, label: 'cap' },
      { type: 'display', id: 'count',     x: 0, y: 5, w: 4, h: 1, bind: 'state.bufferCount', label: 'queued' },
      { type: 'display', id: 'lastBurst', x: 4, y: 5, w: 4, h: 1, bind: 'state.lastBurstSize', label: 'last' },
      { type: 'led',     id: 'pulse',     x: 3, y: 8, bind: 'state.pulseLed', color: 's3', label: 'pulse' },
      { type: 'jack', id: 'jout', x: 3, y: 11, kind: 'output', port: 'out', color: 's3', label: 'out' },
    ],
  },
  create(config, runtime) {
    const { bus, dispatcher, instanceId, roomNodeId, roomSystemKey, filters } = runtime
    let buffer = []
    let timer = null

    const flush = () => {
      if (buffer.length === 0) return
      // Snapshot + clear before emitting so any signal that arrives during
      // the burst goes into the next window, not this one.
      const batch = buffer
      buffer = []
      for (const sig of batch) {
        dispatcher.emit(sig, { fromInstanceId: instanceId, fromPortId: 'out' })
      }
      // A small marker on our events channel so the live feed shows the
      // pulse boundary clearly (count + when).
      bus.publish(eventsChannel(instanceId), createSignal(
        'event',
        { kind: 'pulse-flush', count: batch.length },
        { processorId: instanceId, processorType: 'pulse-batcher', roomNodeId, roomSystemKey },
      ))
    }

    return {
      onInput({ signal }) {
        if (!signalMatches(signal, filters)) return
        buffer.push(signal)
        const cap = config.maxBuffer ?? 1000
        if (buffer.length > cap) buffer.shift() // drop oldest, prefer recent
      },
      start() {
        if (timer) return
        timer = setInterval(flush, config.batchMs ?? 5000)
      },
      stop() {
        if (timer) { clearInterval(timer); timer = null }
        buffer = []
      },
    }
  },
}

// SUB-PATCHING -----------------------------------------------------------
// A compound processor is a def that ships a `subRack` instead of (or in
// addition to) a primitive `create`. Its create() spawns inner instances,
// wires them via an inner-only proxy dispatcher, and forwards signals
// between the compound's declared outer ports and inner jacks.
//
// Inner-instance ids are namespaced as `${outerId}/${innerLocalId}` for
// uniqueness within the room, but the inner cable graph uses the LOCAL
// ids (the proxy dispatcher rewrites them on emit).
//
// Scope of v1 (matches the DEBT.md entry): runtime support only.
//   - Ports: declared on the outer def like a primitive
//   - Inner instances reference primitives by defId (no nested compounds yet)
//   - Inner cables: jack→jack only
//   - Bindings: inputBindings[outerPort] = {instanceId, portId};
//                outputBindings[outerPort] = {instanceId, portId}
//   - No drill-in, no editor, no save-as-library, no parameter exposure
//
// Future work tracked in DEBT.md → "Compound processors".

export function createCompoundInstance(def, config, runtime) {
  const { dispatcher: outerDispatcher, instanceId: outerId, bus } = runtime
  const sr = def.subRack
  if (!sr) throw new Error(`createCompoundInstance: ${def.id} has no subRack`)
  // Outer config: defaults < user override.
  const outerConfig = { ...(def.defaultConfig || {}), ...(config || {}) }

  // Built once at instantiation: a fast lookup from an inner-jack source
  // to its consumers — either another inner jack or the outer's output port.
  const innerEdges = new Map() // key: `${localId}|${portId}` → [{kind, …}]
  for (const cab of sr.cables || []) {
    const key = `${cab.source.instanceId}|${cab.source.portId}`
    const list = innerEdges.get(key) || []
    list.push({ kind: 'inner-jack', toId: cab.target.instanceId, toPort: cab.target.portId })
    innerEdges.set(key, list)
  }
  for (const [outerPortId, binding] of Object.entries(sr.outputBindings || {})) {
    const key = `${binding.instanceId}|${binding.portId}`
    const list = innerEdges.get(key) || []
    list.push({ kind: 'outer-out', outerPortId })
    innerEdges.set(key, list)
  }

  const innerById = {} // localId → { handle, instanceId, def }

  // Proxy dispatcher: inner instances get this instead of the real
  // dispatcher. Their emit() routes via innerEdges; everything else is a
  // no-op (inners don't directly touch the outer cable graph).
  const innerDispatcher = {
    emit(signal, { fromInstanceId, fromPortId }) {
      const localId = fromInstanceId.startsWith(outerId + '/')
        ? fromInstanceId.slice(outerId.length + 1)
        : fromInstanceId
      const targets = innerEdges.get(`${localId}|${fromPortId}`) || []
      for (const t of targets) {
        if (t.kind === 'inner-jack') {
          innerById[t.toId]?.handle.onInput?.({ signal, portId: t.toPort })
        } else if (t.kind === 'outer-out') {
          // Re-emit on the outer's port through the real dispatcher.
          outerDispatcher.emit(signal, { fromInstanceId: outerId, fromPortId: t.outerPortId })
        }
      }
    },
    setCables() {}, setRoomTerminals() {}, setBroadcast() {},
    registerProcessor() {}, unregisterProcessor() {},
    deliverFromTerminal() {},
  }

  // Index of param bindings by inner-instance id, so each inner can absorb
  // its share of the outer config in one pass:
  //   paramBindings: { outerKey: { instanceId, configKey } }
  const paramByInstance = {}
  for (const [outerKey, b] of Object.entries(sr.paramBindings || {})) {
    if (outerConfig[outerKey] === undefined) continue
    if (!paramByInstance[b.instanceId]) paramByInstance[b.instanceId] = {}
    paramByInstance[b.instanceId][b.configKey] = outerConfig[outerKey]
  }

  // Spawn inner instances. getProcessorDef is hoisted; at the time this
  // function actually runs (compound.create() call) PROCESSOR_LIBRARY is
  // fully initialised. Nested compounds work too: when an inner is itself a
  // compound, its create() recursively calls createCompoundInstance and
  // builds another proxy dispatcher around our innerDispatcher.
  for (const inst of sr.instances || []) {
    const innerDef = getProcessorDef(inst.defId)
    if (!innerDef) {
      console.error(`Compound ${def.id}: inner ${inst.id} has unknown defId ${inst.defId}`)
      continue
    }
    const innerInstanceId = `${outerId}/${inst.id}`
    // Config layering for this inner: primitive defaults < subRack-declared
    // <  paramBindings from outer config.
    const innerConfig = {
      ...(innerDef.defaultConfig || {}),
      ...(inst.config || {}),
      ...(paramByInstance[inst.id] || {}),
    }
    const handle = innerDef.create(innerConfig, {
      ...runtime,
      dispatcher: innerDispatcher,
      instanceId: innerInstanceId,
    })
    innerById[inst.id] = { handle, instanceId: innerInstanceId, def: innerDef }
    handle.start?.()
  }

  // Optional: a small marker event so the live feed shows the compound
  // started. Lets the user verify the shell came up.
  bus.publish(eventsChannel(outerId), createSignal(
    'event',
    { kind: 'compound-started', innerCount: Object.keys(innerById).length, defId: def.id },
    { processorId: outerId, processorType: def.id },
  ))

  return {
    onInput({ signal, portId }) {
      const binding = (sr.inputBindings || {})[portId]
      if (!binding) return
      innerById[binding.instanceId]?.handle.onInput?.({
        signal, portId: binding.portId,
      })
    },
    onAction(action) {
      // Fan actions to every inner — most won't have onAction; the rest
      // can decide what to do with it. Useful for "reset" semantics.
      for (const inner of Object.values(innerById)) inner.handle.onAction?.(action)
    },
    start() { /* inners already started above */ },
    stop() {
      for (const inner of Object.values(innerById)) inner.handle.stop?.()
    },
  }
}

// SENTIMENT TRACKER (compound) -------------------------------------------
// Proof-of-concept sub-patch. Demonstrates: outer input → inner binding,
// inner→inner cable, bound inner output → outer port. No new primitive
// code — entirely composed of existing processors.

const SENTIMENT_TRACKER = {
  id: 'sentiment-tracker',
  name: 'Sentiment Tracker',
  description: 'Compound: text → sentiment → top-K of polarity tags over a rolling window. Demonstrates sub-patching: composed entirely from primitives (sentiment + top-k-tracker), no new logic.',
  category: 'analysis',
  hasInputs: true,
  hasOutputs: true,
  ports: {
    inputs: [
      { id: 'in', label: 'in', accepts: { types: null, tags: null } },
    ],
    outputs: [
      { id: 'top', label: 'top', emits: { types: ['narrative'], tags: ['top-k', 'sentiment-tracker'] } },
    ],
  },
  placement: 'any',
  // Outer-tunable knobs: paramBindings below route them to inner inst configs.
  defaultConfig: {
    windowMs: 60000,
    topK: 3,
    reportIntervalMs: 5000,
    threshold: 0.05,
  },
  panel: {
    widthHP: 10,
    bg: 'mid',
    accent: 's2',
    fixtures: [
      { type: 'jack', id: 'jin', x: 0, y: 0, kind: 'input', port: 'in', color: 's2', label: 'in' },
      { type: 'knob', id: 'windowMs', x: 0, y: 2, size: 'md',
        bind: 'config.windowMs', range: [1000, 600000], step: 1000, unit: 'ms', label: 'window' },
      { type: 'knob', id: 'topK', x: 2, y: 2, size: 'md',
        bind: 'config.topK', range: [1, 10], step: 1, label: 'top-k' },
      { type: 'knob', id: 'reportIntervalMs', x: 4, y: 2, size: 'md',
        bind: 'config.reportIntervalMs', range: [500, 60000], step: 500, unit: 'ms', label: 'rate' },
      { type: 'knob', id: 'threshold', x: 6, y: 2, size: 'md',
        bind: 'config.threshold', range: [0, 0.5], step: 0.01, label: 'thr' },
      { type: 'label', id: 'lbl', x: 1, y: 5, w: 8, text: 'SENTIMENT → TOP-K', size: 'sm', color: 's2' },
      { type: 'jack', id: 'jout', x: 4, y: 11, kind: 'output', port: 'top', color: 's2', label: 'top' },
    ],
  },
  subRack: {
    instances: [
      { id: 'snt', defId: 'sentiment' },
      { id: 'tk',  defId: 'top-k-tracker', config: {
        // The inner key is fixed at the def level — it's *what* this
        // compound aggregates, not a tuning concern. Outer knobs only
        // control how (window / topK / cadence / sensitivity).
        key: 'content.polarityTag',
      } },
    ],
    cables: [
      { source: { kind: 'jack', instanceId: 'snt', portId: 'score' },
        target: { kind: 'jack', instanceId: 'tk',  portId: 'in' } },
    ],
    inputBindings:  { in:  { instanceId: 'snt', portId: 'in'  } },
    outputBindings: { top: { instanceId: 'tk',  portId: 'top' } },
    // Outer-config keys → inner instance config slots.
    paramBindings: {
      windowMs:         { instanceId: 'tk',  configKey: 'windowMs' },
      topK:             { instanceId: 'tk',  configKey: 'topK' },
      reportIntervalMs: { instanceId: 'tk',  configKey: 'reportIntervalMs' },
      threshold:        { instanceId: 'snt', configKey: 'threshold' },
    },
  },
  create(config, runtime) {
    return createCompoundInstance(SENTIMENT_TRACKER, config, runtime)
  },
}

// SPLITTER ----------------------------------------------------------------
// Eurorack-style "mult" — one input fans out to eight outputs unchanged.
// Useful for getting a single source into multiple downstream branches
// without re-cabling the source itself. Each output emits the same signal
// id, so any receiver reached via two paths dedupes naturally.

const SPLITTER = {
  id: 'splitter',
  name: 'Splitter',
  description: 'Forwards a single input to eight outputs unchanged. Use to fan one source into multiple downstream pipelines without altering the signal.',
  category: 'flow',
  hasInputs: true,
  hasOutputs: true,
  ports: {
    inputs: [
      { id: 'in', label: 'in', accepts: { types: null, tags: null } },
    ],
    outputs: Array.from({ length: 8 }, (_, i) => ({
      id: `out${i + 1}`,
      label: String(i + 1),
      emits: { types: null, tags: null },
    })),
  },
  placement: 'any',
  defaultConfig: {},
  panel: {
    widthHP: 8,
    bg: 'mid',
    accent: 's3',
    fixtures: [
      { type: 'jack', id: 'jin', x: 3, y: 0, kind: 'input', port: 'in', color: 's3', label: 'in' },
      // 8 outputs in a 4×2 grid at the bottom (matches heartbeat layout).
      { type: 'jack', id: 'jout1', x: 0, y: 9,  kind: 'output', port: 'out1', color: 's3', label: '1' },
      { type: 'jack', id: 'jout2', x: 2, y: 9,  kind: 'output', port: 'out2', color: 's3', label: '2' },
      { type: 'jack', id: 'jout3', x: 4, y: 9,  kind: 'output', port: 'out3', color: 's3', label: '3' },
      { type: 'jack', id: 'jout4', x: 6, y: 9,  kind: 'output', port: 'out4', color: 's3', label: '4' },
      { type: 'jack', id: 'jout5', x: 0, y: 11, kind: 'output', port: 'out5', color: 's3', label: '5' },
      { type: 'jack', id: 'jout6', x: 2, y: 11, kind: 'output', port: 'out6', color: 's3', label: '6' },
      { type: 'jack', id: 'jout7', x: 4, y: 11, kind: 'output', port: 'out7', color: 's3', label: '7' },
      { type: 'jack', id: 'jout8', x: 6, y: 11, kind: 'output', port: 'out8', color: 's3', label: '8' },
    ],
  },
  create(_config, runtime) {
    const { dispatcher, instanceId } = runtime
    return {
      onInput({ signal }) {
        // Forward unchanged on every output. The dispatcher takes care of
        // routing to whichever ports actually have cables; unused ones
        // are no-ops. Same signal id everywhere → receivers dedupe if
        // they're reached by two paths.
        emitOnAllOutputs(SPLITTER, dispatcher, instanceId, signal)
      },
      start() {},
      stop() {},
    }
  },
}

export const PROCESSOR_LIBRARY = [
  HEARTBEAT, TRACER, LOGGER, WEBSOCKET_TRANSDUCER, DIGEST,
  TEST_GENERATOR, TEST_EXPLAINER,
  PERIOD_DETECTOR, STEP_DETECTOR, TREND_DETECTOR, ANOMALY_DETECTOR,
  SENTIMENT, KEYWORD_EXTRACTOR, ENTITY_EXTRACTOR,
  NEAR_DUP_DETECTOR, TOP_K_TRACKER,
  SPLITTER, PULSE_BATCHER,
  // Compounds
  SENTIMENT_TRACKER,
]

// USER-SAVED COMPOUNDS ----------------------------------------------------
// In-memory registry for compounds the user has saved at runtime (via
// agentAPI.saveAsCompound or future UI). Lost on refresh — durable
// persistence is its own debt item. Library consumers (LibraryDrawer,
// runtime resolution) treat these on equal footing with built-ins via
// getEffectiveLibrary / getProcessorDef.
const userCompounds = []
const librarySubscribers = new Set()

export function registerUserCompound(def) {
  if (!def?.id) throw new Error('registerUserCompound: def needs an id')
  if (!def.subRack) throw new Error('registerUserCompound: def needs a subRack')
  if (PROCESSOR_LIBRARY.some(p => p.id === def.id) || userCompounds.some(p => p.id === def.id)) {
    throw new Error(`registerUserCompound: id "${def.id}" is already registered`)
  }
  // Wire up create() if the snapshot didn't (compoundFromRoom intentionally
  // doesn't, to avoid circular imports).
  if (!def.create) {
    def.create = (config, runtime) => createCompoundInstance(def, config, runtime)
  }
  userCompounds.push(def)
  for (const fn of librarySubscribers) fn()
  return def
}

export function unregisterUserCompound(defId) {
  const idx = userCompounds.findIndex(d => d.id === defId)
  if (idx < 0) return false
  userCompounds.splice(idx, 1)
  for (const fn of librarySubscribers) fn()
  return true
}

export function listUserCompounds() {
  return [...userCompounds]
}

export function getEffectiveLibrary() {
  return [...PROCESSOR_LIBRARY, ...userCompounds]
}

export function subscribeLibrary(fn) {
  librarySubscribers.add(fn)
  return () => librarySubscribers.delete(fn)
}

export function getProcessorDef(defId) {
  return PROCESSOR_LIBRARY.find(p => p.id === defId)
      || userCompounds.find(p => p.id === defId)
}

export function canPlaceProcessor(def, systemKey) {
  if (def.placement === 'any') return true
  if (Array.isArray(def.placement)) return def.placement.includes(systemKey)
  return false
}
