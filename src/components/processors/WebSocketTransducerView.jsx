import { useState } from 'react'
import { color, sizes } from '../../styles'
import { useA11yType } from '../../hooks/useA11yType'

// Detail view for the websocket-transducer processor. Edits go through
// onChange, which the host wires to agentAPI.updateProcessorConfig.
//
// Text fields use local draft state and commit onBlur so the processor isn't
// reconnected on every keystroke. Selects and numbers commit immediately.

const fieldStyle = (t) => ({
  ...t.mono, color: color.primary,
  padding: '6px 8px', width: '100%',
  border: `1px solid ${color.border}`,
  borderRadius: 3, background: 'none',
  boxSizing: 'border-box',
})

const labelStyle = (t) => ({
  ...t.label, display: 'block', marginBottom: 4,
})

function TextField({ id, label, value, placeholder, onCommit, t, monospace = true }) {
  const safeValue = value ?? ''
  const [committed, setCommitted] = useState(safeValue)
  const [draft, setDraft] = useState(safeValue)
  if (committed !== safeValue) {
    setCommitted(safeValue)
    setDraft(safeValue)
  }
  return (
    <div>
      <label htmlFor={id} style={labelStyle(t)}>{label}</label>
      <input
        id={id}
        type="text"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== (value ?? '')) onCommit(draft) }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        style={{ ...fieldStyle(t), fontFamily: monospace ? undefined : 'inherit' }}
      />
    </div>
  )
}

function SelectField({ id, label, value, options, onChange, t }) {
  return (
    <div>
      <label htmlFor={id} style={labelStyle(t)}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={fieldStyle(t)}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}

function NumberField({ id, label, value, min, onCommit, t }) {
  const safeValue = String(value ?? '')
  const [committed, setCommitted] = useState(safeValue)
  const [draft, setDraft] = useState(safeValue)
  if (committed !== safeValue) {
    setCommitted(safeValue)
    setDraft(safeValue)
  }
  return (
    <div>
      <label htmlFor={id} style={labelStyle(t)}>{label}</label>
      <input
        id={id}
        type="number"
        min={min}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft)
          if (Number.isFinite(n) && n !== value) onCommit(n)
          else setDraft(String(value ?? ''))
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        style={fieldStyle(t)}
      />
    </div>
  )
}

export function WebSocketTransducerView({ config, onChange }) {
  const t = useA11yType()
  const reconnect = config.reconnect || {}
  const tagsString = (config.tags || []).join(', ')

  const commitTags = (s) => {
    const tags = s.split(',').map(x => x.trim()).filter(Boolean)
    onChange({ tags })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
      <TextField
        id="ws-url"
        label="URL"
        value={config.url || ''}
        placeholder="wss://example.com/feed"
        onCommit={(v) => onChange({ url: v.trim() })}
        t={t}
      />

      <SelectField
        id="ws-parse"
        label="Format"
        value={config.parse || 'text'}
        options={[
          { value: 'text', label: 'Plain text' },
          { value: 'json', label: 'JSON' },
        ]}
        onChange={(v) => onChange({ parse: v })}
        t={t}
      />

      <SelectField
        id="ws-signal-type"
        label="Signal type"
        value={config.signalType || 'event'}
        options={[
          { value: 'metric', label: 'metric' },
          { value: 'event', label: 'event' },
          { value: 'narrative', label: 'narrative' },
          { value: 'alert', label: 'alert' },
        ]}
        onChange={(v) => onChange({ signalType: v })}
        t={t}
      />

      <TextField
        id="ws-tags"
        label="Tags (comma-separated)"
        value={tagsString}
        placeholder="prod, kafka, orders"
        onCommit={commitTags}
        t={t}
      />

      <div style={{ borderTop: `1px solid ${color.borderLight}`, paddingTop: 12 }}>
        <div style={{ ...t.label, marginBottom: 8 }}>Reconnect</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <NumberField
            id="ws-reconnect-max"
            label="Max attempts"
            value={reconnect.maxAttempts ?? 10}
            min={0}
            onCommit={(v) => onChange({ reconnect: { ...reconnect, maxAttempts: v } })}
            t={t}
          />
          <NumberField
            id="ws-reconnect-base"
            label="Base delay (ms)"
            value={reconnect.baseDelayMs ?? 500}
            min={0}
            onCommit={(v) => onChange({ reconnect: { ...reconnect, baseDelayMs: v } })}
            t={t}
          />
          <NumberField
            id="ws-reconnect-max-delay"
            label="Max delay (ms)"
            value={reconnect.maxDelayMs ?? 30000}
            min={0}
            onCommit={(v) => onChange({ reconnect: { ...reconnect, maxDelayMs: v } })}
            t={t}
          />
        </div>
      </div>

      <p style={{ ...t.monoMuted, margin: 0, marginTop: 4, minHeight: sizes.targetMin, lineHeight: 1.5 }}>
        Connection status appears in the live log.
      </p>
    </div>
  )
}
