import { useState, useRef, useEffect } from 'react'
import { Send } from 'lucide-react'
import { color, sizes } from '../../styles'
import { useA11yType } from '../../hooks/useA11yType'
import { useTranslation } from '../../i18n/index.jsx'

export function AgentPanel({ agentAPI }) {
  const t = useA11yType()
  const { t: tr } = useTranslation()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([
    { role: 'agent', text: 'I can help you build and modify your viable system model. Try commands like:\n• "list nodes"\n• "read model"\n• "add management to [id]"\n• "focus [id]"\n• "what is the current state?"' },
  ])
  const bottomRef = useRef()
  const inputRef = useRef()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const executeCommand = (text) => {
    if (!agentAPI) return 'Agent API not connected'
    const lower = text.toLowerCase().trim()

    // Parse natural-ish commands
    if (lower === 'list nodes' || lower === 'list' || lower === 'ls') {
      const result = agentAPI.listNodes()
      if (!result.ok) return result.error
      const lines = result.nodes.map(n => `${n.id} ${n.type}${n.children > 0 ? ` (${n.children} children)` : ''}`)
      return `Root: ${result.rootId}\n${lines.join('\n')}`
    }

    if (lower === 'read' || lower === 'read model' || lower === 'export') {
      const result = agentAPI.read()
      return result.yaml
    }

    if (lower === 'state' || lower.includes('current state') || lower === 'where am i') {
      const result = agentAPI.getState()
      return `View: ${result.view}\nNodes: ${result.nodeCount}${result.focusedId ? `\nFocused: ${result.focusedId.slice(0, 8)}` : ''}${result.paneId ? `\nPane: ${result.paneId.slice(0, 8)}` : ''}${result.systemView ? `\nSystem: ${result.systemView.systemKey} on ${result.systemView.nodeId.slice(0, 8)}` : ''}`
    }

    if (lower === 'overview' || lower === 'home' || lower === 'zoom out') {
      const result = agentAPI.overview()
      return 'Returned to overview'
    }

    if (lower === 'back') {
      agentAPI.back()
      return 'Went back one level'
    }

    // "add management to abc123"
    const addMgmtMatch = lower.match(/add\s+management\s+(?:to\s+)?(\S+)/)
    if (addMgmtMatch) {
      const shortId = addMgmtMatch[1]
      const fullId = resolveId(agentAPI, shortId)
      if (!fullId) return `Node "${shortId}" not found`
      const result = agentAPI.addManagement(fullId)
      return result.ok ? `Added management: ${result.nodeId.slice(0, 8)}` : result.error
    }

    // "add operation to abc123"
    const addOpMatch = lower.match(/add\s+operation\s+(?:to\s+)?(\S+)/)
    if (addOpMatch) {
      const shortId = addOpMatch[1]
      const fullId = resolveId(agentAPI, shortId)
      if (!fullId) return `Node "${shortId}" not found`
      const result = agentAPI.addOperation(fullId)
      return result.ok ? `Added operation: ${result.nodeId.slice(0, 8)}` : result.error
    }

    // "remove abc123"
    const removeMatch = lower.match(/(?:remove|delete)\s+(\S+)/)
    if (removeMatch) {
      const shortId = removeMatch[1]
      const fullId = resolveId(agentAPI, shortId)
      if (!fullId) return `Node "${shortId}" not found`
      const result = agentAPI.removeNode(fullId)
      return result.ok ? 'Node removed' : result.error
    }

    // "focus abc123"
    const focusMatch = lower.match(/focus\s+(\S+)/)
    if (focusMatch) {
      const fullId = resolveId(agentAPI, focusMatch[1])
      if (!fullId) return `Node "${focusMatch[1]}" not found`
      agentAPI.focus(fullId)
      return `Focused on ${focusMatch[1]}`
    }

    // "detail abc123"
    const detailMatch = lower.match(/detail\s+(\S+)/)
    if (detailMatch) {
      const fullId = resolveId(agentAPI, detailMatch[1])
      if (!fullId) return `Node "${detailMatch[1]}" not found`
      agentAPI.detail(fullId)
      return `Detail view of ${detailMatch[1]}`
    }

    // "open system s3 on abc123"
    const sysMatch = lower.match(/open\s+system\s+(s[1-5])\s+(?:on\s+)?(\S+)/)
    if (sysMatch) {
      const fullId = resolveId(agentAPI, sysMatch[2])
      if (!fullId) return `Node "${sysMatch[2]}" not found`
      agentAPI.openSystem(fullId, sysMatch[1])
      return `Opened ${sysMatch[1]} on ${sysMatch[2]}`
    }

    // "node abc123"
    const nodeMatch = lower.match(/(?:node|info|inspect)\s+(\S+)/)
    if (nodeMatch) {
      const fullId = resolveId(agentAPI, nodeMatch[1])
      if (!fullId) return `Node "${nodeMatch[1]}" not found`
      const result = agentAPI.getNode(fullId)
      if (!result.ok) return result.error
      return `ID: ${result.id.slice(0, 8)}\nType: ${result.type}\nParent: ${result.parentId?.slice(0, 8) || 'none'}\nChildren: ${result.childIds.length}`
    }

    return `Unknown command. Try: list, read, state, add management to [id], add operation to [id], remove [id], focus [id], detail [id], back, overview`
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!input.trim()) return

    const userMsg = input.trim()
    setMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setInput('')

    const response = executeCommand(userMsg)
    setMessages(prev => [...prev, { role: 'agent', text: response }])

    inputRef.current?.focus()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }} role="log" aria-label="Agent conversation" aria-live="polite">
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: 12, display: 'flex', flexDirection: 'column' }}>
            <span style={{ ...t.label, marginBottom: 4 }}>
              {msg.role === 'agent' ? 'AGENT' : 'YOU'}
            </span>
            <pre style={{
              ...(msg.role === 'agent' ? t.mono : t.monoActive),
              margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              padding: '8px 12px',
              background: msg.role === 'agent' ? color.hoverBg : 'transparent',
              borderLeft: msg.role === 'user' ? `2px solid ${color.primary}` : 'none',
              borderRadius: msg.role === 'agent' ? 4 : 0,
            }}>
              {msg.text}
            </pre>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} style={{
        display: 'flex', gap: 8,
        padding: '12px 16px',
        borderTop: `1px solid ${color.border}`,
      }}>
        <label htmlFor="agent-input" className="sr-only">Message the agent</label>
        <input
          id="agent-input"
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="list, read, add management to [id]..."
          style={{
            flex: 1, ...t.mono, color: color.primary,
            padding: '8px 12px',
            border: `1px solid ${color.border}`,
            borderRadius: 4, background: 'none',
            minHeight: sizes.targetDefault,
          }}
        />
        <button
          type="submit" aria-label="Send message"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: sizes.targetDefault, height: sizes.targetDefault,
            background: 'none', border: `1px solid ${color.border}`,
            borderRadius: 4, cursor: 'pointer',
            color: input.trim() ? color.primary : color.muted,
          }}
        >
          <Send size={sizes.iconSize} strokeWidth={sizes.iconStroke} />
        </button>
      </form>
    </div>
  )
}

// Resolve a short ID (first 8 chars) to a full UUID
function resolveId(api, shortId) {
  const result = api.listNodes()
  if (!result.ok) return null
  const match = result.nodes.find(n => n.id.startsWith(shortId) || n.fullId.startsWith(shortId) || n.fullId === shortId)
  return match?.fullId || null
}
