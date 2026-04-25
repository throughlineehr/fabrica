// Stateless WebSocket relay.
//
// Each URL path is an independent broadcast channel: every message a peer
// sends is forwarded to every other peer connected to the same path.
// No persistence, no auth, no replay — just a pipe.
//
// Connectors (e.g. connectors/slack/stdin.js) push to a path; Fabrica's
// websocket-transducer reads from the same path. Both sides connect; the
// relay sits between them.
//
// Run: `npm run relay`  (defaults to ws://localhost:8888)

import { WebSocketServer } from 'ws'
import { fileURLToPath } from 'url'

export function startRelay({ port = 8888 } = {}) {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ port })
    const rooms = new Map() // path -> Set<WebSocket>

    wss.on('listening', () => {
      const actualPort = wss.address().port
      resolve({
        port: actualPort,
        rooms,
        close: () => new Promise((r) => wss.close(() => r())),
      })
    })

    wss.on('error', (err) => reject(err))

    wss.on('connection', (ws, req) => {
      const path = req.url || '/'
      if (!rooms.has(path)) rooms.set(path, new Set())
      const peers = rooms.get(path)
      peers.add(ws)

      ws.on('message', (data) => {
        for (const peer of peers) {
          if (peer !== ws && peer.readyState === 1 /* OPEN */) {
            peer.send(data)
          }
        }
      })

      ws.on('close', () => {
        peers.delete(ws)
        if (peers.size === 0) rooms.delete(path)
      })

      ws.on('error', () => { /* peer-level errors ignored; close handler runs */ })
    })
  })
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const port = Number(process.env.PORT) || 8888
  startRelay({ port }).then(({ port: actual }) => {
    console.log(`Fabrica relay listening on ws://localhost:${actual}`)
    console.log('Each URL path is a separate broadcast channel.')
    console.log('Connect a publisher and a subscriber to the same path, e.g.:')
    console.log(`  ws://localhost:${actual}/slack/general`)
  }).catch((err) => {
    console.error('Relay failed to start:', err.message)
    process.exit(1)
  })
}
