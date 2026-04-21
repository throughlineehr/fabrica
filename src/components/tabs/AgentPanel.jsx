import { useState, useRef, useEffect } from 'react'
import { Send, Volume2, VolumeX, Mic, MicOff, CircleStop } from 'lucide-react'
import { color, sizes } from '../../styles'
import { useA11yType } from '../../hooks/useA11yType'
import { useTranslation } from '../../i18n/index.jsx'
import { useAIConfig } from '../../agent/config.jsx'
import { AGENT_DSL } from '../../agent/commands'
import { exportModelCompact, importModel } from '../../tree/serialize'
import { parseShorthand } from '../../tree/shorthand'

export function AgentPanel({ agentAPI }) {
  const t = useA11yType()
  const { t: tr, lang } = useTranslation()
  const [input, setInput] = useState('')
  const [speakEnabled, setSpeakEnabled] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef(null)
  const { apiKey, provider, model, endpoint, isConnected: aiConnected } = useAIConfig()
  const [messages, setMessages] = useState([])
  const conversationRef = useRef([]) // full conversation for AI context
  const bottomRef = useRef()
  const inputRef = useRef()
  const [loading, setLoading] = useState(false)

  // Set intro message when language changes
  useEffect(() => {
    setMessages([{ role: 'agent', text: tr('agent.intro') }])
  }, [lang])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const speak = (text) => {
    if (!speakEnabled || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    utterance.rate = 1.0
    utterance.pitch = 1.0
    window.speechSynthesis.speak(utterance)
  }

  const toggleListening = () => {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const recognition = new SR()
    recognition.lang = lang
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript
      setInput(transcript)
      setListening(false)
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  const executeCommand = (text) => {
    if (!agentAPI) return tr('agent.unknownCommand')
    const lower = text.toLowerCase().trim()

    if (lower === 'list nodes' || lower === 'list' || lower === 'ls') {
      const result = agentAPI.listNodes()
      if (!result.ok) return result.error
      const lines = result.nodes.map(n => `${n.id} ${n.type}${n.children > 0 ? ` (${n.children} ${tr('agent.children')})` : ''}`)
      return `${tr('agent.root')}: ${result.rootId}\n${lines.join('\n')}`
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
      agentAPI.overview()
      return tr('agent.returnedOverview')
    }

    if (lower === 'back') {
      agentAPI.back()
      return tr('agent.wentBack')
    }

    const addMgmtMatch = lower.match(/add\s+management\s+(?:to\s+)?(\S+)/)
    if (addMgmtMatch) {
      const fullId = resolveId(agentAPI, addMgmtMatch[1])
      if (!fullId) return `${tr('agent.nodeNotFound')}: "${addMgmtMatch[1]}"`
      const result = agentAPI.addManagement(fullId)
      return result.ok ? `${tr('agent.managementAdded')}: ${result.nodeId.slice(0, 8)}` : result.error
    }

    const addOpMatch = lower.match(/add\s+operation\s+(?:to\s+)?(\S+)/)
    if (addOpMatch) {
      const fullId = resolveId(agentAPI, addOpMatch[1])
      if (!fullId) return `${tr('agent.nodeNotFound')}: "${addOpMatch[1]}"`
      const result = agentAPI.addOperation(fullId)
      return result.ok ? `${tr('agent.operationAdded')}: ${result.nodeId.slice(0, 8)}` : result.error
    }

    const removeMatch = lower.match(/(?:remove|delete)\s+(\S+)/)
    if (removeMatch) {
      const fullId = resolveId(agentAPI, removeMatch[1])
      if (!fullId) return `${tr('agent.nodeNotFound')}: "${removeMatch[1]}"`
      const result = agentAPI.removeNode(fullId)
      return result.ok ? tr('agent.nodeRemoved') : result.error
    }

    const focusMatch = lower.match(/focus\s+(\S+)/)
    if (focusMatch) {
      const fullId = resolveId(agentAPI, focusMatch[1])
      if (!fullId) return `${tr('agent.nodeNotFound')}: "${focusMatch[1]}"`
      agentAPI.focus(fullId)
      return `${tr('agent.focused')} ${focusMatch[1]}`
    }

    const detailMatch = lower.match(/detail\s+(\S+)/)
    if (detailMatch) {
      const fullId = resolveId(agentAPI, detailMatch[1])
      if (!fullId) return `${tr('agent.nodeNotFound')}: "${detailMatch[1]}"`
      agentAPI.detail(fullId)
      return `${tr('agent.detailView')} ${detailMatch[1]}`
    }

    const sysMatch = lower.match(/open\s+system\s+(s[1-5])\s+(?:on\s+)?(\S+)/)
    if (sysMatch) {
      const fullId = resolveId(agentAPI, sysMatch[2])
      if (!fullId) return `${tr('agent.nodeNotFound')}: "${sysMatch[2]}"`
      agentAPI.openSystem(fullId, sysMatch[1])
      return `${tr('agent.opened')} ${sysMatch[1]} on ${sysMatch[2]}`
    }

    const nodeMatch = lower.match(/(?:node|info|inspect)\s+(\S+)/)
    if (nodeMatch) {
      const fullId = resolveId(agentAPI, nodeMatch[1])
      if (!fullId) return `${tr('agent.nodeNotFound')}: "${nodeMatch[1]}"`
      const result = agentAPI.getNode(fullId)
      if (!result.ok) return result.error
      return `ID: ${result.id.slice(0, 8)}\nType: ${result.type}\nParent: ${result.parentId?.slice(0, 8) || 'none'}\n${tr('agent.children')}: ${result.childIds.length}`
    }

    return tr('agent.unknownCommand')
  }

  const callAI = async (userMsg) => {
    // Build system prompt with current model state
    const modelYaml = agentAPI ? agentAPI.read().yaml : ''
    const stateInfo = agentAPI ? JSON.stringify(agentAPI.getState()) : '{}'
    const nodeList = agentAPI ? agentAPI.listNodes() : { nodes: [] }
    const nodeTable = nodeList.nodes?.map(n => `${n.id} (${n.fullId}) ${n.type} children:${n.children}`).join('\n') || 'empty'
    const rootFullId = nodeList.nodes?.find(n => n.id === nodeList.rootId)?.fullId || ''
    const voiceNote = speakEnabled ? '\n\nVOICE IS ON. Keep responses under 2 sentences. Be extremely concise. No lists. No code blocks. Just do it and confirm briefly.' : ''

    const systemPrompt = `${AGENT_DSL}\n\nROOT NODE ID: ${rootFullId}\n\nALL NODES (use the FULL ID in parentheses for commands):\n${nodeTable}\n\nCURRENT VIEW STATE:\n${stateInfo}${voiceNote}\n\nEXECUTING COMMANDS — TWO MODES:

MODE 1 — BUILD (preferred for creating/modifying trees):
Output a tree between >>>BUILD and BUILD<<<. Uses shorthand: each line is "name: type" where indentation (2 spaces) = depth. Types: m (management), o (operation). This REPLACES the entire model.

>>>BUILD
CEO: m
  Marketing: m
    Social Media: o
    Brand: o
  Engineering: m
    Frontend: m
      UI Team: o
      Design: o
    Backend: m
      API Team: o
      Database: o
  Sales: m
    Enterprise: o
    SMB: o
BUILD<<<

This is compact and efficient. 50 nodes in 50 lines. Always include the full tree from root. Use this for any request that involves building or restructuring.

MODE 2 — SINGLE ACTIONS (for navigation, small edits):
>>>focus("fullUUID")<<<
>>>detail("fullUUID")<<<
>>>openSystem("fullUUID", "s3")<<<
>>>overview()<<<
>>>back()<<<

For Mode 2, use the full UUID from the node list above. The >>> and <<< delimiters are REQUIRED.`

    const aiMessages = [
      { role: 'system', content: systemPrompt },
      ...conversationRef.current,
      { role: 'user', content: userMsg },
    ]

    const req = provider.buildRequest(aiMessages, model, apiKey, endpoint)
    const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body })
    if (!res.ok) throw new Error(`${res.status}: ${await res.text().catch(() => 'Unknown error')}`)
    const data = await res.json()
    return provider.parseResponse(data)
  }

  const executeAICommands = (responseText) => {
    if (!agentAPI) return []
    const results = []

    // Mode 1a: BUILD shorthand (preferred)
    const buildMatch = responseText.match(/>>>BUILD\n([\s\S]*?)BUILD<<</)
    if (buildMatch) {
      try {
        const newModel = parseShorthand(buildMatch[1])
        agentAPI.replaceModel(newModel)
        const nodeCount = Object.keys(newModel.entities).length
        results.push({ cmd: `Built ${nodeCount} nodes`, ok: true })
        return results
      } catch (err) {
        results.push({ cmd: 'BUILD', ok: false, error: err.message })
        return results
      }
    }

    // Mode 1b: YAML state replace (fallback)
    const yamlMatch = responseText.match(/>>>YAML\n([\s\S]*?)YAML<<</)
    if (yamlMatch) {
      try {
        const newModel = importModel(yamlMatch[1])
        agentAPI.replaceModel(newModel)
        results.push({ cmd: 'YAML replace', ok: true })
        return results
      } catch (err) {
        results.push({ cmd: 'YAML replace', ok: false, error: err.message })
        return results
      }
    }

    // Mode 2: Individual commands
    const delimiter = '>>>'
    const endDelimiter = '<<<'
    const cmdRegex = new RegExp(delimiter + '(\\w+)\\(([^)]*)\\)' + endDelimiter, 'g')
    let match
    while ((match = cmdRegex.exec(responseText)) !== null) {
      const fn = match[1]
      const argsRaw = match[2]
      const args = argsRaw.split(',').map(a => a.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
      try {
        let result
        switch (fn) {
          case 'addManagement': result = agentAPI.addManagement(args[0]); break
          case 'addOperation': result = agentAPI.addOperation(args[0]); break
          case 'removeNode': result = agentAPI.removeNode(args[0]); break
          case 'focus': result = agentAPI.focus(args[0]); break
          case 'detail': result = agentAPI.detail(args[0]); break
          case 'openSystem': result = agentAPI.openSystem(args[0], args[1]); break
          case 'overview': result = agentAPI.overview(); break
          case 'back': result = agentAPI.back(); break
          case 'read': result = agentAPI.read(); break
          case 'listNodes': result = agentAPI.listNodes(); break
          case 'getState': result = agentAPI.getState(); break
          case 'getNode': result = agentAPI.getNode(args[0]); break
          case 'setFilter': result = agentAPI.setFilter(args[0], args[1] === 'true'); break
          default: result = { ok: false, error: `Unknown command: ${fn}` }
        }
        results.push({ cmd: `${fn}(${argsRaw})`, ...result })
      } catch (err) {
        results.push({ cmd: `${fn}(${argsRaw})`, ok: false, error: err.message })
      }
    }
    return results
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setInput('')

    if (aiConnected && provider) {
      // Try AI provider
      setLoading(true)
      try {
        const response = await callAI(userMsg)
        conversationRef.current.push({ role: 'user', content: userMsg })

        // Execute any commands in the response
        const cmdResults = executeAICommands(response)

        // Build result summary
        let displayText = response
        let resultSummary = ''
        if (cmdResults.length > 0) {
          const resultLines = cmdResults.map(r => {
            const extra = r.nodeId ? ` (new: ${r.nodeId.slice(0, 8)})` : ''
            return `  ${r.cmd} → ${r.ok ? '✓' + extra : '✗ ' + r.error}`
          })
          resultSummary = resultLines.join('\n')
          displayText += '\n\n' + resultSummary
        }

        // Feed results back into conversation so AI can use new IDs next turn
        const assistantContent = response + (resultSummary ? '\n\n[Command results]\n' + resultSummary : '')
        conversationRef.current.push({ role: 'assistant', content: assistantContent })

        setMessages(prev => [...prev, { role: 'agent', text: displayText }])
        // Strip all command syntax from voice output
        let voiceText = response.replace(/>>>BUILD[\s\S]*?BUILD<<</, '').replace(/>>>YAML[\s\S]*?YAML<<</, '')
        const stripCmd = new RegExp('>>>[^<]+' + '<<<', 'g')
        voiceText = voiceText.replace(stripCmd, '').trim()
        speak(voiceText)
      } catch (err) {
        // Fall back to local commands on error
        const fallback = executeCommand(userMsg)
        setMessages(prev => [...prev, { role: 'agent', text: `[AI error: ${err.message}]\n\n${fallback}` }])
      }
      setLoading(false)
    } else {
      // No AI connected — use local command parser
      const response = executeCommand(userMsg)
      setMessages(prev => [...prev, { role: 'agent', text: response }])
      speak(response)
    }

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
        {loading && (
          <div style={{ ...t.monoMuted, padding: '8px 12px' }}>...</div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{
        display: 'flex', gap: 4, padding: '8px 16px 0',
        borderTop: `1px solid ${color.border}`,
      }}>
        <button
          onClick={() => setSpeakEnabled(s => !s)}
          aria-label={speakEnabled ? 'Disable voice output' : 'Enable voice output'}
          aria-pressed={speakEnabled}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            ...t.monoMuted, padding: '4px 8px',
            background: 'none', border: 'none', cursor: 'pointer',
            color: speakEnabled ? color.primary : color.muted,
          }}
        >
          {speakEnabled ? <Volume2 size={14} strokeWidth={1.5} /> : <VolumeX size={14} strokeWidth={1.5} />}
          {tr('agent.voice')}
        </button>
        <button
          onClick={toggleListening}
          aria-label={listening ? 'Stop listening' : 'Start voice input'}
          aria-pressed={listening}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            ...t.monoMuted, padding: '4px 8px',
            background: 'none', border: 'none', cursor: 'pointer',
            color: listening ? color.s2.fill : color.muted,
          }}
        >
          {listening ? <Mic size={14} strokeWidth={1.5} /> : <MicOff size={14} strokeWidth={1.5} />}
          {listening ? tr('agent.listening') : tr('agent.mic')}
        </button>
        {speakEnabled && (
          <button
            onClick={() => window.speechSynthesis?.cancel()}
            aria-label="Stop speaking"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              ...t.monoMuted, padding: '4px 8px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: color.s2.fill,
            }}
          >
            <CircleStop size={14} strokeWidth={1.5} />
            Stop
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} style={{
        display: 'flex', gap: 8,
        padding: '8px 16px 12px',
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
            color: input.trim() && !loading ? color.primary : color.muted,
          }}
        >
          <Send size={sizes.iconSize} strokeWidth={sizes.iconStroke} />
        </button>
      </form>
    </div>
  )
}

function resolveId(api, shortId) {
  const result = api.listNodes()
  if (!result.ok) return null
  const match = result.nodes.find(n => n.id.startsWith(shortId) || n.fullId.startsWith(shortId) || n.fullId === shortId)
  return match?.fullId || null
}
