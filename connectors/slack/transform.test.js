import { describe, it, expect } from 'vitest'
import { shouldForward, buildPayload } from './transform.js'

describe('shouldForward', () => {
  it('plain user message passes by default', () => {
    expect(shouldForward({ text: 'hi', user: 'U1', channel: 'C1' }, false)).toBe(true)
  })

  it('subtyped messages are filtered out by default', () => {
    expect(shouldForward({ subtype: 'message_deleted' }, false)).toBe(false)
    expect(shouldForward({ subtype: 'message_changed' }, false)).toBe(false)
    expect(shouldForward({ subtype: 'channel_join' }, false)).toBe(false)
    expect(shouldForward({ subtype: 'bot_message' }, false)).toBe(false)
  })

  it('thread_broadcast passes even by default — it is a real reply', () => {
    expect(shouldForward({ subtype: 'thread_broadcast', text: 'hi' }, false)).toBe(true)
  })

  it('includeSubtypes=true forwards everything', () => {
    expect(shouldForward({ subtype: 'message_deleted' }, true)).toBe(true)
    expect(shouldForward({ subtype: 'channel_join' }, true)).toBe(true)
    expect(shouldForward({ subtype: 'bot_message' }, true)).toBe(true)
  })

  it('null/undefined message never forwards', () => {
    expect(shouldForward(null, false)).toBe(false)
    expect(shouldForward(undefined, true)).toBe(false)
  })
})

describe('buildPayload', () => {
  it('packs the canonical relay shape', () => {
    const message = {
      text: 'hello',
      user: 'U123',
      channel: 'C456',
      ts: '1714000000.000123',
      thread_ts: '1714000000.000100',
      subtype: null,
    }
    const out = buildPayload(message, 'engineering', 'Alice')
    expect(out).toEqual({
      source: 'slack',
      channel: 'engineering',
      channelId: 'C456',
      user: 'Alice',
      userId: 'U123',
      text: 'hello',
      ts: '1714000000.000123',
      threadTs: '1714000000.000100',
      subtype: null,
    })
  })

  it('text falls back to empty string when missing', () => {
    expect(buildPayload({ user: 'U', channel: 'C', ts: '1' }, 'c', 'u').text).toBe('')
  })

  it('threadTs is null when not a thread reply', () => {
    expect(buildPayload({ user: 'U', channel: 'C', ts: '1', text: 'x' }, 'c', 'u').threadTs).toBeNull()
  })

  it('subtype is preserved when present (for downstream filtering)', () => {
    expect(buildPayload({ user: 'U', channel: 'C', ts: '1', subtype: 'thread_broadcast' }, 'c', 'u').subtype).toBe('thread_broadcast')
  })

  it('source is always slack', () => {
    expect(buildPayload({ user: 'U', channel: 'C', ts: '1' }, 'c', 'u').source).toBe('slack')
  })
})
