import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { color, sizes } from '../../styles'
import { useAccessibility } from '../../accessibility'
import { useTranslation, LANGUAGES } from '../../i18n/index.jsx'
import { useAIConfig } from '../../agent/config.jsx'
import { PROVIDERS } from '../../agent/providers'

let _sliderId = 0
let _accordionId = 0

function Toggle({ label, value, onChange, t }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      aria-label={label}
      onClick={onChange}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '8px 0',
        minHeight: sizes.targetDefault,
        background: 'none', border: 'none', cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={t.monoActive}>{label}</span>
      <span aria-hidden="true" style={{
        width: 32, height: 16, borderRadius: 8,
        background: value ? color.primary : color.border,
        position: 'relative', transition: 'background 0.15s',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: value ? 16 : 2,
          width: 12, height: 12, borderRadius: 6,
          background: color.white, transition: 'left 0.15s',
        }} />
      </span>
    </button>
  )
}

function Slider({ label, value, onChange, min = 0, max = 1, step = 0.1, t }) {
  const id = useState(() => `slider-${_sliderId++}`)[0]
  return (
    <div style={{ padding: '8px 0', minHeight: sizes.targetDefault }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <label htmlFor={id} style={t.monoActive}>{label}</label>
        <span aria-hidden="true" style={t.monoMuted}>{Math.round(value * 100)}%</span>
      </div>
      <input
        id={id} type="range" min={min} max={max} step={step} value={value}
        aria-valuenow={value} aria-valuemin={min} aria-valuemax={max}
        aria-valuetext={`${Math.round(value * 100)}%`}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: color.primary }}
      />
    </div>
  )
}

function AccordionSection({ label, children, t, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const ids = useState(() => { const n = _accordionId++; return { btn: `acc-btn-${n}`, panel: `acc-panel-${n}` } })[0]
  const Icon = open ? ChevronDown : ChevronRight
  return (
    <div style={{ marginBottom: 4 }}>
      <button
        id={ids.btn} aria-expanded={open} aria-controls={ids.panel}
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          ...t.label, padding: '8px 0', minHeight: sizes.targetDefault,
          background: 'none', border: 'none', borderBottom: `1px solid ${color.borderLight}`,
          cursor: 'pointer', textAlign: 'start',
        }}
      >
        <Icon size={12} strokeWidth={1.5} aria-hidden="true" />
        {label}
      </button>
      {open && <div id={ids.panel} role="region" aria-labelledby={ids.btn} style={{ padding: '8px 0 12px' }}>{children}</div>}
    </div>
  )
}

export function SettingsPanel({ t, tr }) {
  const { epilepsy, toggleEpilepsy, fontVisibility, setFontVisibility, dyslexia, toggleDyslexia, colorBlind, toggleColorBlind } = useAccessibility()
  const { lang, setLang } = useTranslation()
  return (
    <div style={{ padding: '16px' }}>
      <AccordionSection label={tr('settings.language')} t={t}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              aria-current={lang === l.code ? 'true' : undefined}
              style={{
                ...(lang === l.code ? t.monoActive : t.monoMuted),
                background: 'none', border: 'none',
                borderLeft: `2px solid ${lang === l.code ? color.primary : 'transparent'}`,
                paddingLeft: 8, paddingBlock: 4,
                cursor: 'pointer', textAlign: 'start',
                display: 'flex', alignItems: 'center', gap: 8,
                minHeight: sizes.targetMin,
              }}
            >
              <span aria-hidden="true">{l.flag}</span>
              {l.label}
            </button>
          ))}
        </div>
      </AccordionSection>

      <AccordionSection label={tr('settings.accessibility')} t={t}>
        <Toggle label={tr('settings.epilepsyMode')} value={epilepsy} onChange={toggleEpilepsy} t={t} />
        <div style={{ borderTop: `1px solid ${color.borderLight}` }}>
          <Slider label={tr('settings.fontVisibility')} value={fontVisibility} onChange={setFontVisibility} t={t} />
        </div>
        <div style={{ borderTop: `1px solid ${color.borderLight}` }}>
          <Toggle label={tr('settings.dyslexiaFont')} value={dyslexia} onChange={toggleDyslexia} t={t} />
        </div>
        <div style={{ borderTop: `1px solid ${color.borderLight}` }}>
          <Toggle label={tr('settings.colorBlindMode')} value={colorBlind} onChange={toggleColorBlind} t={t} />
        </div>
        <div style={{ borderTop: `1px solid ${color.borderLight}` }}>
          <Toggle label={`${tr('settings.screenReader')} (${tr('settings.notImplemented')})`} value={false} onChange={() => {}} t={t} />
        </div>
      </AccordionSection>

      <AccordionSection label={tr('settings.display')} t={t}>
        <p style={{ ...t.mono, color: color.muted, margin: 0 }}>{tr('settings.notImplemented')}</p>
      </AccordionSection>

      <AccordionSection label={tr('settings.account')} t={t}>
        <p style={{ ...t.mono, color: color.muted, margin: 0 }}>{tr('settings.notImplemented')}</p>
      </AccordionSection>

      <AccordionSection label={`${tr('tools.agent')} ${tr('agent.apiKey')}`} t={t}>
        <AIKeyConfig t={t} tr={tr} />
      </AccordionSection>
    </div>
  )
}

function AIKeyConfig({ t, tr }) {
  const { apiKey, provider, model, setApiKey, setModel, isConnected } = useAIConfig()
  const [inputKey, setInputKey] = useState(apiKey ? '••••••••' + apiKey.slice(-4) : '')
  const [editing, setEditing] = useState(!apiKey)

  const handleSave = () => {
    if (inputKey && !inputKey.startsWith('••')) {
      setApiKey(inputKey)
      setInputKey('••••••••' + inputKey.slice(-4))
      setEditing(false)
    }
  }

  const handleClear = () => {
    setApiKey('')
    setInputKey('')
    setEditing(true)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: isConnected ? color.s1.fill : color.muted,
        }} />
        <span style={isConnected ? t.monoActive : t.monoMuted}>
          {isConnected ? `${tr('agent.connected')}: ${provider.name}` : tr('agent.notConnected')}
        </span>
      </div>

      {/* API Key input */}
      <div>
        <label htmlFor="ai-key-input" style={{ ...t.label, display: 'block', marginBottom: 4 }}>
          {tr('agent.apiKey')}
        </label>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            id="ai-key-input"
            type={editing ? 'text' : 'password'}
            value={editing ? inputKey : (apiKey ? '••••••••' + apiKey.slice(-4) : '')}
            onChange={(e) => { setInputKey(e.target.value); setEditing(true) }}
            placeholder={tr('agent.apiKeyPlaceholder')}
            style={{
              flex: 1, ...t.mono, color: color.primary,
              padding: '6px 8px',
              border: `1px solid ${color.border}`,
              borderRadius: 3, background: 'none',
            }}
          />
          {editing && inputKey && !inputKey.startsWith('••') && (
            <button onClick={handleSave} style={{
              ...t.monoActive, padding: '6px 10px',
              background: 'none', border: `1px solid ${color.border}`,
              borderRadius: 3, cursor: 'pointer',
            }}>{tr('agent.saved').split(' ')[0] || 'Save'}</button>
          )}
          {apiKey && !editing && (
            <button onClick={handleClear} style={{
              ...t.monoMuted, padding: '6px 10px',
              background: 'none', border: `1px solid ${color.border}`,
              borderRadius: 3, cursor: 'pointer',
            }}>{tr('agent.cleared').split(' ')[0] || 'Clear'}</button>
          )}
        </div>
      </div>

      {/* Model selector */}
      {isConnected && (
        <div>
          <label htmlFor="ai-model-select" style={{ ...t.label, display: 'block', marginBottom: 4 }}>
            {tr('agent.model')}
          </label>
          <select
            id="ai-model-select"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{
              ...t.mono, color: color.primary,
              padding: '6px 8px', width: '100%',
              border: `1px solid ${color.border}`,
              borderRadius: 3, background: 'none',
            }}
          >
            {provider.models.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
