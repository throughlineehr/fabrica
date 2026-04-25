import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import WebSocket from 'ws'
import { startRelay } from '../../server/relay.js'

// Connect a WebSocket and resolve once it's open.
function open(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })
}

// Resolve with the next message a socket receives, or reject after `ms`.
function nextMessage(ws, ms = 1000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    ws.once('message', (data) => {
      clearTimeout(timer)
      resolve(data.toString())
    })
  })
}

function close(...sockets) {
  for (const ws of sockets) {
    if (ws && ws.readyState === 1) ws.close()
  }
}

describe('relay server', () => {
  let relay

  beforeEach(async () => {
    // port: 0 lets the OS pick a free port — avoids collisions in parallel tests.
    relay = await startRelay({ port: 0 })
  })

  afterEach(async () => {
    await relay.close()
  })

  it('forwards messages between peers on the same path', async () => {
    const url = `ws://localhost:${relay.port}/test/x`
    const a = await open(url)
    const b = await open(url)

    const got = nextMessage(b)
    a.send('hello')
    expect(await got).toBe('hello')

    close(a, b)
  })

  it('does not forward messages back to the sender', async () => {
    const url = `ws://localhost:${relay.port}/test/x`
    const a = await open(url)

    let received = null
    a.on('message', (data) => { received = data.toString() })
    a.send('echo?')
    await new Promise((r) => setTimeout(r, 50))
    expect(received).toBeNull()

    close(a)
  })

  it('isolates paths from each other', async () => {
    const a = await open(`ws://localhost:${relay.port}/path-A`)
    const b = await open(`ws://localhost:${relay.port}/path-B`)

    let bReceived = null
    b.on('message', (data) => { bReceived = data.toString() })
    a.send('only for A')
    await new Promise((r) => setTimeout(r, 50))
    expect(bReceived).toBeNull()

    close(a, b)
  })

  it('forwards to multiple subscribers on the same path', async () => {
    const url = `ws://localhost:${relay.port}/multi`
    const sender = await open(url)
    const sub1 = await open(url)
    const sub2 = await open(url)

    const both = Promise.all([nextMessage(sub1), nextMessage(sub2)])
    sender.send('broadcast')
    const [m1, m2] = await both
    expect(m1).toBe('broadcast')
    expect(m2).toBe('broadcast')

    close(sender, sub1, sub2)
  })

  it('cleans up empty paths on disconnect', async () => {
    const url = `ws://localhost:${relay.port}/ephemeral`
    const ws = await open(url)
    expect(relay.rooms.has('/ephemeral')).toBe(true)

    ws.close()
    await new Promise((r) => setTimeout(r, 50))
    expect(relay.rooms.has('/ephemeral')).toBe(false)
  })
})
