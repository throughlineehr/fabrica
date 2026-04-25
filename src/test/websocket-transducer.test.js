import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createBus, roomChannel, eventsChannel } from '../signals/bus'
import { getProcessorDef } from '../signals/library'

describe('websocket-transducer', () => {
  let bus, sockets

  beforeEach(() => {
    bus = createBus()
    sockets = []
    class FakeWS {
      constructor(url) {
        this.url = url
        this.readyState = 0
        sockets.push(this)
      }
      close() {
        this.readyState = 3
        if (this.onclose) this.onclose()
      }
    }
    globalThis.WebSocket = FakeWS
    vi.useFakeTimers()
  })

  afterEach(() => {
    delete globalThis.WebSocket
    vi.useRealTimers()
  })

  function build(configOverrides = {}) {
    const def = getProcessorDef('websocket-transducer')
    const inst = def.create(
      { ...def.defaultConfig, url: 'ws://example.test', ...configOverrides },
      { bus, instanceId: 'i1', roomNodeId: 'node-1', roomSystemKey: 's1', filters: {} },
    )
    return inst
  }

  it('emits incoming text messages as event signals into the room', () => {
    const received = []
    bus.subscribe(roomChannel('node-1', 's1'), (s) => received.push(s))
    const inst = build()
    inst.start()
    sockets[0].onopen()
    sockets[0].onmessage({ data: 'hello' })

    expect(received).toHaveLength(1)
    expect(received[0].type).toBe('event')
    expect(received[0].content).toEqual({ text: 'hello' })
    expect(received[0].tags).toEqual(expect.arrayContaining(['transducer', 'websocket']))
    inst.stop()
  })

  it('parses JSON when parse=json', () => {
    const received = []
    bus.subscribe(roomChannel('node-1', 's1'), (s) => received.push(s))
    const inst = build({ parse: 'json' })
    inst.start()
    sockets[0].onopen()
    sockets[0].onmessage({ data: JSON.stringify({ x: 42 }) })

    expect(received[0].content).toEqual({ x: 42 })
    inst.stop()
  })

  it('reports a parse-error status on invalid JSON', () => {
    const events = []
    bus.subscribe(eventsChannel('i1'), (s) => events.push(s))
    const inst = build({ parse: 'json' })
    inst.start()
    sockets[0].onopen()
    sockets[0].onmessage({ data: 'not json' })

    const parseErrors = events.filter(
      (s) => s.content?.kind === 'connection' && s.content.status === 'parse-error',
    )
    expect(parseErrors).toHaveLength(1)
    inst.stop()
  })

  it('schedules a reconnect on close with backoff', () => {
    const inst = build({ reconnect: { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000 } })
    inst.start()
    sockets[0].onopen()
    sockets[0].onclose()

    expect(sockets).toHaveLength(1)
    vi.advanceTimersByTime(100)
    expect(sockets).toHaveLength(2)
    inst.stop()
  })

  it('stop() cancels a pending reconnect', () => {
    const inst = build({ reconnect: { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 10000 } })
    inst.start()
    sockets[0].onopen()
    sockets[0].onclose()
    inst.stop()

    vi.advanceTimersByTime(1000)
    expect(sockets).toHaveLength(1)
  })

  it('reports an error and skips connect when URL is missing', () => {
    const events = []
    bus.subscribe(eventsChannel('i1'), (s) => events.push(s))
    const inst = build({ url: '' })
    inst.start()

    const errors = events.filter((s) => s.content?.status === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0].content.detail).toContain('No URL')
    expect(sockets).toHaveLength(0)
  })

  it('emits connection status events through the events channel', () => {
    const events = []
    bus.subscribe(eventsChannel('i1'), (s) => events.push(s))
    const inst = build()
    inst.start()
    sockets[0].onopen()
    sockets[0].onmessage({ data: 'm1' })

    const statuses = events
      .filter((s) => s.content?.kind === 'connection')
      .map((s) => s.content.status)
    expect(statuses).toEqual(expect.arrayContaining(['connecting', 'connected']))
    inst.stop()
  })
})
