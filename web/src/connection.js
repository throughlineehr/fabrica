// WebSocket connection to Fabrica server
//
// State flows FROM the server.
// Commands flow TO the server.

let ws = null
let onStateCallback = null
let onSignalCallback = null
let pendingCommands = new Map()
let reconnectTimer = null
let messageId = 0

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws'

export function connect({ onState, onSignal, onConnect, onDisconnect }) {
  if (ws) {
    ws.close()
  }

  onStateCallback = onState
  onSignalCallback = onSignal

  ws = new WebSocket(WS_URL)

  ws.onopen = () => {
    console.log('[connection] Connected to server')
    clearTimeout(reconnectTimer)
    onConnect?.()
  }

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)

    if (msg.type === 'state') {
      // State broadcast from server
      onStateCallback?.({
        model: msg.state.model,
        processors: msg.state.processors,
        cables: msg.state.cables,
      })
    } else if (msg.type === 'signal') {
      // Signal delivery (Step 4)
      onSignalCallback?.(msg)
    } else if (msg.type === 'result') {
      // Command result
      const pending = pendingCommands.get(msg.id)
      if (pending) {
        pendingCommands.delete(msg.id)
        if (msg.ok) {
          pending.resolve({ ok: true, ...msg.data })
        } else {
          pending.resolve({ ok: false, error: msg.error })
        }
      }
    }
  }

  ws.onerror = (err) => {
    console.error('[connection] WebSocket error:', err)
  }

  ws.onclose = () => {
    console.log('[connection] Disconnected from server')
    onDisconnect?.()

    // Reject all pending commands
    for (const [id, pending] of pendingCommands) {
      pending.resolve({ ok: false, error: 'Connection lost' })
    }
    pendingCommands.clear()

    // Auto-reconnect after 2 seconds
    reconnectTimer = setTimeout(() => {
      console.log('[connection] Attempting reconnect...')
      connect({ onState, onSignal, onConnect, onDisconnect })
    }, 2000)
  }

  return {
    send,
    close: () => {
      clearTimeout(reconnectTimer)
      ws?.close()
      ws = null
    },
    isConnected: () => ws?.readyState === WebSocket.OPEN,
  }
}

// Send a command to the server
// Returns a promise that resolves when the server responds
export function send(command, args) {
  return new Promise((resolve) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      resolve({ ok: false, error: 'Not connected' })
      return
    }

    const id = `cmd-${++messageId}`
    pendingCommands.set(id, { resolve })

    ws.send(JSON.stringify({
      id,
      type: 'command',
      command,
      args,
    }))

    // Timeout after 10 seconds
    setTimeout(() => {
      if (pendingCommands.has(id)) {
        pendingCommands.delete(id)
        resolve({ ok: false, error: 'Command timeout' })
      }
    }, 10000)
  })
}

// Convenience wrappers for server commands
export const commands = {
  // Tree
  addNode: (parentId, nodeType) => send('addNode', { parentId, nodeType }),
  removeNode: (nodeId) => send('removeNode', { nodeId }),
  renameNode: (nodeId, name) => send('renameNode', { nodeId, name }),
  moveNode: (nodeId, newParentId) => send('moveNode', { nodeId, newParentId }),

  // Processors
  addProcessor: (roomKey, defId, config) => send('addProcessor', { roomKey, defId, config }),
  removeProcessor: (roomKey, instanceId) => send('removeProcessor', { roomKey, instanceId }),
  updateProcessorConfig: (roomKey, instanceId, config) => send('updateProcessorConfig', { roomKey, instanceId, config }),

  // Cables
  addCable: (roomKey, source, target) => send('addCable', { roomKey, source, target }),
  removeCable: (roomKey, cableId) => send('removeCable', { roomKey, cableId }),
}
