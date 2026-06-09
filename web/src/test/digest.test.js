import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createBus, eventsChannel } from '../signals/bus'
import { createSignal } from '../signals/signal'
import { getProcessorDef } from '../signals/library'
import { createDispatcher } from '../signals/dispatcher'

const ROOM_KEY = 'node-1:s1'

describe('digest', () => {
  let bus, dispatcher
  let llmCalls
  let llmResponse
  let llmError
  // The spy receives whatever digest emits, via cables.
  let received
  let inst

  beforeEach(() => {
    bus = createBus()
    dispatcher = createDispatcher({ onTerminal: () => {} })
    llmCalls = []
    llmResponse = JSON.stringify({
      themes: [
        { label: 'release prep', text: 'team is finalizing the release', significance: 'normal', userIds: ['u1'], channelIds: ['c1'] },
      ],
    })
    llmError = null
    received = []
    inst = null

    // Spy processor that records every signal arriving on its input.
    dispatcher.registerProcessor('spy', {
      roomKey: ROOM_KEY,
      inputHandler: ({ signal }) => received.push(signal),
    })
    // Synthetic emitter — used by tests to push signals into digest.
    dispatcher.registerProcessor('emitter', {
      roomKey: ROOM_KEY,
      inputHandler: () => {},
    })

    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    if (inst) inst.stop()
    dispatcher.unregisterProcessor('spy')
    dispatcher.unregisterProcessor('emitter')
    dispatcher.unregisterProcessor('d1')
  })

  function build(configOverrides = {}) {
    const def = getProcessorDef('digest')
    const llm = {
      prompt: async (messages) => {
        llmCalls.push(messages)
        if (llmError) throw llmError
        return llmResponse
      },
    }
    inst = def.create(
      { ...def.defaultConfig, debounceMs: 1000, maxBuffer: 5, ...configOverrides },
      { bus, dispatcher, instanceId: 'd1', roomNodeId: 'node-1', roomSystemKey: 's1', filters: {}, llm },
    )
    dispatcher.registerProcessor('d1', { roomKey: ROOM_KEY, inputHandler: inst.onInput })

    // Wire: emitter → digest.in1, digest.{themes,alerts} → spy.in1
    dispatcher.setCables({
      [ROOM_KEY]: [
        { id: 'c-in', source: { kind: 'jack', instanceId: 'emitter', portId: 'out1' },
                      target: { kind: 'jack', instanceId: 'd1', portId: 'in1' } },
        { id: 'c-themes', source: { kind: 'jack', instanceId: 'd1', portId: 'themes' },
                          target: { kind: 'jack', instanceId: 'spy', portId: 'in1' } },
        { id: 'c-alerts', source: { kind: 'jack', instanceId: 'd1', portId: 'alerts' },
                          target: { kind: 'jack', instanceId: 'spy', portId: 'in1' } },
      ],
    })

    inst.start()
    return inst
  }

  function pushSignal(content, tags = ['slack']) {
    const sig = createSignal('narrative', content, { processorType: 'websocket-transducer' })
    sig.tags = tags
    dispatcher.emit(sig, { fromInstanceId: 'emitter', fromPortId: 'out1' })
    return sig
  }

  it('flushes after debounce window since last input', async () => {
    build()
    pushSignal({ text: 'one' })
    pushSignal({ text: 'two' })

    expect(llmCalls).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()
    await Promise.resolve()

    expect(llmCalls).toHaveLength(1)
    expect(received).toHaveLength(1)
    expect(received[0].type).toBe('narrative')
    expect(received[0].content.label).toBe('release prep')
    expect(received[0].content.supporting).toHaveLength(2)
    expect(received[0].tags).toEqual(expect.arrayContaining(['digest', 'theme', 'slack']))
  })

  it('flushes when buffer hits maxBuffer without waiting for debounce', async () => {
    build({ maxBuffer: 3, debounceMs: 60000 })
    pushSignal({ text: 'a' })
    pushSignal({ text: 'b' })
    pushSignal({ text: 'c' })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(llmCalls).toHaveLength(1)
    expect(received).toHaveLength(1)
  })

  it('emits one signal per theme', async () => {
    llmResponse = JSON.stringify({
      themes: [
        { label: 'A', text: 'theme a', significance: 'normal' },
        { label: 'B', text: 'theme b', significance: 'high' },
        { label: 'C', text: 'theme c', significance: 'algedonic' },
      ],
    })
    build()
    pushSignal({ text: 'msg' })
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()
    await Promise.resolve()

    expect(received).toHaveLength(3)
    expect(received.map(s => s.content.significance)).toEqual(['normal', 'high', 'algedonic'])
  })

  it('emits an alert signal when the LLM call fails', async () => {
    llmError = new Error('rate limited')
    build()
    pushSignal({ text: 'msg' })
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()
    await Promise.resolve()

    expect(received).toHaveLength(1)
    expect(received[0].type).toBe('alert')
    expect(received[0].content.kind).toBe('digest-failed')
    expect(received[0].content.error).toContain('rate limited')
    expect(received[0].content.supporting).toHaveLength(1)
  })

  it('does not buffer its own emitted signals (loop guard via hasTraced)', async () => {
    llmResponse = JSON.stringify({ themes: [{ label: 'x', text: 'x', significance: 'normal' }] })
    build()
    pushSignal({ text: 'one' })
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()
    await Promise.resolve()

    expect(llmCalls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()
    expect(llmCalls).toHaveLength(1)
  })

  it('tolerates fenced code blocks and surrounding prose in LLM output', async () => {
    llmResponse = 'Here are the themes:\n```json\n{ "themes": [{ "label": "ok", "text": "ok", "significance": "normal" }] }\n```\nDone.'
    build()
    pushSignal({ text: 'one' })
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()
    await Promise.resolve()

    expect(received).toHaveLength(1)
    expect(received[0].content.label).toBe('ok')
  })

  it('reports an internal flush event for UI visibility', async () => {
    const events = []
    bus.subscribe(eventsChannel('d1'), (s) => events.push(s))
    build()
    pushSignal({ text: 'one' })
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()
    await Promise.resolve()

    const flushEvents = events.filter(s => s.content?.kind === 'digest-flush')
    expect(flushEvents).toHaveLength(1)
    expect(flushEvents[0].content.reason).toBe('debounce')
    expect(flushEvents[0].content.count).toBe(1)
  })

  it('algedonic significance survives the full pipeline', async () => {
    llmResponse = JSON.stringify({
      themes: [{
        label: 'EU payments down',
        text: 'production checkout failing for all EU customers, escalated to oncall',
        significance: 'algedonic',
        userIds: ['U1', 'U2'],
        channelIds: ['C-engineering'],
      }],
    })
    build()
    pushSignal({ text: 'payments down EU' }, ['slack', 'urgent'])
    pushSignal({ text: 'rolling back' }, ['slack', 'urgent'])
    pushSignal({ text: 'oncall paged' }, ['slack', 'urgent'])
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()
    await Promise.resolve()

    expect(received).toHaveLength(1)
    const sig = received[0]
    expect(sig.type).toBe('narrative')
    expect(sig.content.significance).toBe('algedonic')
    expect(sig.content.userIds).toEqual(['U1', 'U2'])
    expect(sig.content.channelIds).toEqual(['C-engineering'])
    expect(sig.content.timeRange).toBeTruthy()
    expect(sig.content.timeRange.from).toBeLessThanOrEqual(sig.content.timeRange.to)
  })
})
