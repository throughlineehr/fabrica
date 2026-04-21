import { useState, useRef, useEffect } from 'react'
import { Send } from 'lucide-react'
import { color, sizes } from '../../styles'
import { useA11yType } from '../../hooks/useA11yType'
import { useTranslation } from '../../i18n/index.jsx'

export function AgentPanel({ model, onCommand }) {
  const t = useA11yType()
  const { t: tr } = useTranslation()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([
    { role: 'agent', text: 'I can help you build and modify your viable system model. Try asking me to add nodes, describe the structure, or export the model.' },
  ])
  const bottomRef = useRef()
  const inputRef = useRef()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!input.trim()) return

    const userMsg = input.trim()
    setMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setInput('')

    // Stub: echo back with a placeholder response
    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: 'agent',
        text: `I understood: "${userMsg}". Agent integration is not yet connected. When ready, I'll be able to read and modify the model using the YAML DSL.`,
      }])
    }, 300)

    inputRef.current?.focus()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }} role="log" aria-label="Agent conversation" aria-live="polite">
        {messages.map((msg, i) => (
          <div key={i} style={{
            marginBottom: 12,
            display: 'flex', flexDirection: 'column',
          }}>
            <span style={{
              ...t.label,
              marginBottom: 4,
            }}>
              {msg.role === 'agent' ? 'AGENT' : 'YOU'}
            </span>
            <p style={{
              ...(msg.role === 'agent' ? t.mono : t.monoActive),
              margin: 0,
              padding: '8px 12px',
              background: msg.role === 'agent' ? color.hoverBg : 'transparent',
              borderLeft: msg.role === 'user' ? `2px solid ${color.primary}` : 'none',
              borderRadius: msg.role === 'agent' ? 4 : 0,
            }}>
              {msg.text}
            </p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
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
          placeholder="Ask the agent..."
          style={{
            flex: 1,
            ...t.mono,
            color: color.primary,
            padding: '8px 12px',
            border: `1px solid ${color.border}`,
            borderRadius: 4,
            background: 'none',
            minHeight: sizes.targetDefault,
          }}
        />
        <button
          type="submit"
          aria-label="Send message"
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
