// Slack connector — listens to Slack messages via Socket Mode and forwards
// each one to the relay as a JSON payload. Fabrica's websocket-transducer
// (in an S1 room) reads from the same relay path.
//
// Required env:
//   SLACK_BOT_TOKEN          xoxb-...     Bot User OAuth Token
//   SLACK_APP_TOKEN          xapp-...     App-Level Token (connections:write)
//   RELAY_URL                ws://localhost:8888/slack/all   (default)
//   SLACK_INCLUDE_SUBTYPES   1            also forward edits/deletes/joins (default off)
//
// Setup: see connectors/slack/README.md
// Run:   npm run connector:slack

import bolt from '@slack/bolt'
import WebSocket from 'ws'
import { shouldForward, buildPayload } from './transform.js'

const { App } = bolt

const BOT_TOKEN = process.env.SLACK_BOT_TOKEN
const APP_TOKEN = process.env.SLACK_APP_TOKEN
const RELAY_URL = process.env.RELAY_URL || 'ws://localhost:8888/slack/all'
const INCLUDE_SUBTYPES = !!process.env.SLACK_INCLUDE_SUBTYPES

if (!BOT_TOKEN || !APP_TOKEN) {
  console.error('[slack] missing SLACK_BOT_TOKEN or SLACK_APP_TOKEN.')
  console.error('         see connectors/slack/README.md')
  process.exit(1)
}

// --- Relay link with reconnect + small offline buffer -----------------------

let relay = null
const buffered = []
const MAX_BUFFER = 1000

function connectRelay() {
  relay = new WebSocket(RELAY_URL)
  relay.on('open', () => {
    console.error(`[slack] relay connected: ${RELAY_URL}`)
    while (buffered.length > 0 && relay.readyState === 1) {
      relay.send(buffered.shift())
    }
  })
  relay.on('close', () => {
    console.error('[slack] relay disconnected, retrying in 2s')
    relay = null
    setTimeout(connectRelay, 2000)
  })
  relay.on('error', (err) => {
    console.error(`[slack] relay error: ${err.message}`)
  })
}

function send(payload) {
  const data = JSON.stringify(payload)
  if (relay && relay.readyState === 1) {
    relay.send(data)
  } else {
    buffered.push(data)
    if (buffered.length > MAX_BUFFER) buffered.shift()
  }
}

connectRelay()

// --- Slack -----------------------------------------------------------------

const app = new App({
  token: BOT_TOKEN,
  appToken: APP_TOKEN,
  socketMode: true,
})

const channelNameCache = new Map()
const userNameCache = new Map()

async function resolveChannel(client, channelId) {
  if (!channelId) return null
  if (channelNameCache.has(channelId)) return channelNameCache.get(channelId)
  try {
    const res = await client.conversations.info({ channel: channelId })
    const name = res.channel?.name || channelId
    channelNameCache.set(channelId, name)
    return name
  } catch {
    return channelId
  }
}

async function resolveUser(client, userId) {
  if (!userId) return null
  if (userNameCache.has(userId)) return userNameCache.get(userId)
  try {
    const res = await client.users.info({ user: userId })
    const name = res.user?.real_name || res.user?.name || userId
    userNameCache.set(userId, name)
    return name
  } catch {
    return userId
  }
}

app.message(async ({ message, client }) => {
  // Bolt delivers messages with various subtypes (edits, deletes, joins).
  // By default we only forward plain user-said-something messages; flip
  // SLACK_INCLUDE_SUBTYPES=1 to forward everything. Filter logic + payload
  // shape live in ./transform.js so they can be unit-tested.
  if (!shouldForward(message, INCLUDE_SUBTYPES)) return

  const [channelName, userName] = await Promise.all([
    resolveChannel(client, message.channel),
    resolveUser(client, message.user),
  ])

  send(buildPayload(message, channelName, userName))
})

await app.start()
console.error('[slack] connected to Slack via Socket Mode')
console.error(`[slack] forwarding messages to ${RELAY_URL}`)
console.error(`[slack] add the bot to a channel and start chatting`)
