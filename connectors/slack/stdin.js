// Stub Slack connector for testing the relay round-trip without Slack creds.
//
// Reads lines from stdin and forwards each as a message to the relay. Once
// the real Slack connector exists, it will replace this script with the
// same output shape (so Fabrica's websocket-transducer needs no changes).
//
// Usage:
//   npm run relay                           # in one terminal
//   echo 'hello world' | npm run connector:slack:stdin
//
// The relay-side path defaults to /slack/general. Override with RELAY_URL.

import readline from 'readline'
import WebSocket from 'ws'

const RELAY_URL = process.env.RELAY_URL || 'ws://localhost:8888/slack/general'

const ws = new WebSocket(RELAY_URL)

ws.on('open', () => {
  console.error(`[slack-stdin] connected to ${RELAY_URL}`)
  const rl = readline.createInterface({ input: process.stdin })
  rl.on('line', (line) => {
    if (!line.trim()) return
    const payload = JSON.stringify({
      source: 'slack-stdin',
      channel: 'general',
      text: line,
      ts: Date.now(),
    })
    ws.send(payload)
  })
  rl.on('close', () => ws.close())
})

ws.on('error', (err) => {
  console.error(`[slack-stdin] relay error: ${err.message}`)
  console.error('  is the relay running? `npm run relay`')
  process.exit(1)
})

ws.on('close', () => {
  process.exit(0)
})
