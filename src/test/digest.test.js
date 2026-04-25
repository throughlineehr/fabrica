import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createBus, roomChannel, eventsChannel, publishToRoom } from '../signals/bus'
import { createSignal } from '../signals/signal'
import { getProcessorDef } from '../signals/library'

describe('digest', () => {
  let bus
  let llmCalls
  let llmResponse
  let llmError

  beforeEach(() => {
    bus = createBus()
    llmCalls = []
    llmResponse = JSON.stringify({
      themes: [
        { label: 'release prep', text: 'team is finalizing the release', significance: 'normal', userIds: ['u1'], channelIds: ['c1'] },
      ],
    })
    llmError = null
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
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
    const inst = def.create(
      { ...def.defaultConfig, debounceMs: 1000, maxBuffer: 5, ...configOverrides },
      { bus, instanceId: 'd1', roomNodeId: 'node-1', roomSystemKey: 's1', filters: {}, llm },
    )
    return inst
  }

  function pushSignal(content, tags = ['slack']) {
    const sig = createSignal('narrative', content, { processorType: 'websocket-transducer' })
    sig.tags = tags
    publishToRoom(bus, 'node-1', 's1', sig)
    return sig
  }

  it('flushes after debounce window since last input', async () => {
    const received = []
    bus.subscribe(roomChannel('node-1', 's1'), (s) => {
      if (s.source.processorType === 'digest') received.push(s)
    })
    const inst = build()
    inst.start()
    pushSignal({ text: 'one' })
    pushSignal({ text: 'two' })

    expect(llmCalls).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1000)
    // let the awaited promise resolve
    await Promise.resolve()
    await Promise.resolve()

    expect(llmCalls).toHaveLength(1)
    expect(received).toHaveLength(1)
    expect(received[0].type).toBe('narrative')
    expect(received[0].content.label).toBe('release prep')
    expect(received[0].content.supporting).toHaveLength(2)
    expect(received[0].tags).toEqual(expect.arrayContaining(['digest', 'theme', 'slack']))
    inst.stop()
  })

  it('flushes when buffer hits maxBuffer without waiting for debounce', async () => {
    const received = []
    bus.subscribe(roomChannel('node-1', 's1'), (s) => {
      if (s.source.processorType === 'digest') received.push(s)
    })
    const inst = build({ maxBuffer: 3, debounceMs: 60000 })
    inst.start()
    pushSignal({ text: 'a' })
    pushSignal({ text: 'b' })
    pushSignal({ text: 'c' })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(llmCalls).toHaveLength(1)
    expect(received).toHaveLength(1)
    inst.stop()
  })

  it('emits one signal per theme', async () => {
    llmResponse = JSON.stringify({
      themes: [
        { label: 'A', text: 'theme a', significance: 'normal' },
        { label: 'B', text: 'theme b', significance: 'high' },
        { label: 'C', text: 'theme c', significance: 'algedonic' },
      ],
    })
    const received = []
    bus.subscribe(roomChannel('node-1', 's1'), (s) => {
      if (s.source.processorType === 'digest') received.push(s)
    })
    const inst = build()
    inst.start()
    pushSignal({ text: 'msg' })
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()
    await Promise.resolve()

    expect(received).toHaveLength(3)
    expect(received.map(s => s.content.significance)).toEqual(['normal', 'high', 'algedonic'])
    inst.stop()
  })

  it('emits an alert signal when the LLM call fails', async () => {
    llmError = new Error('rate limited')
    const received = []
    bus.subscribe(roomChannel('node-1', 's1'), (s) => {
      if (s.source.processorType === 'digest') received.push(s)
    })
    const inst = build()
    inst.start()
    pushSignal({ text: 'msg' })
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()
    await Promise.resolve()

    expect(received).toHaveLength(1)
    expect(received[0].type).toBe('alert')
    expect(received[0].content.kind).toBe('digest-failed')
    expect(received[0].content.error).toContain('rate limited')
    expect(received[0].content.supporting).toHaveLength(1)
    inst.stop()
  })

  it('does not buffer its own emitted signals (loop guard)', async () => {
    llmResponse = JSON.stringify({ themes: [{ label: 'x', text: 'x', significance: 'normal' }] })
    const inst = build()
    inst.start()
    pushSignal({ text: 'one' })
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()
    await Promise.resolve()

    expect(llmCalls).toHaveLength(1)
    // emitted theme should not retrigger a flush
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()
    expect(llmCalls).toHaveLength(1)
    inst.stop()
  })

  it('tolerates fenced code blocks and surrounding prose in LLM output', async () => {
    llmResponse = 'Here are the themes:\n```json\n{ "themes": [{ "label": "ok", "text": "ok", "significance": "normal" }] }\n```\nDone.'
    const received = []
    bus.subscribe(roomChannel('node-1', 's1'), (s) => {
      if (s.source.processorType === 'digest') received.push(s)
    })
    const inst = build()
    inst.start()
    pushSignal({ text: 'one' })
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()
    await Promise.resolve()

    expect(received).toHaveLength(1)
    expect(received[0].content.label).toBe('ok')
    inst.stop()
  })

  it('reports an internal flush event for UI visibility', async () => {
    const events = []
    bus.subscribe(eventsChannel('d1'), (s) => events.push(s))
    const inst = build()
    inst.start()
    pushSignal({ text: 'one' })
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()
    await Promise.resolve()

    const flushEvents = events.filter(s => s.content?.kind === 'digest-flush')
    expect(flushEvents).toHaveLength(1)
    expect(flushEvents[0].content.reason).toBe('debounce')
    expect(flushEvents[0].content.count).toBe(1)
    inst.stop()
  })
})
