// Pure transforms for the Slack connector — extracted so they can be
// tested without bolt or network. Keep this file dependency-free.

/**
 * Decide whether a Slack message should be forwarded to the relay.
 *
 *   - `includeSubtypes: true` forwards every message regardless of
 *     subtype (edits, deletes, channel-joins, bot messages, etc.).
 *   - `includeSubtypes: false` (default) forwards only plain user
 *     messages — except `thread_broadcast`, which is a real reply
 *     just visible in the parent channel.
 */
export function shouldForward(message, includeSubtypes) {
  if (!message) return false
  if (includeSubtypes) return true
  if (!message.subtype) return true
  if (message.subtype === 'thread_broadcast') return true
  return false
}

/**
 * Build the JSON payload sent to the relay. `channelName` / `userName`
 * are resolved separately (Slack API lookups are async and cached).
 */
export function buildPayload(message, channelName, userName) {
  return {
    source: 'slack',
    channel: channelName,
    channelId: message.channel,
    user: userName,
    userId: message.user,
    text: message.text || '',
    ts: message.ts,
    threadTs: message.thread_ts || null,
    subtype: message.subtype || null,
  }
}
