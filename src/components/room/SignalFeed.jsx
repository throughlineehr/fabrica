import { color } from '../../styles'
import { useA11yType } from '../../hooks/useA11yType'
import { useTranslation } from '../../i18n/index.jsx'

function formatTime(ts) {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function SignalIcon({ type }) {
  const icons = { metric: '◆', event: '⚡', narrative: '¶', alert: '▲' }
  const colors = {
    metric: color.s4.fill,
    event: color.s1.fill,
    narrative: color.s3.fill,
    alert: color.s2.fill,
  }
  return (
    <span aria-hidden="true" style={{ color: colors[type] || color.muted }}>
      {icons[type] || '●'}
    </span>
  )
}

function signalSummary(signal) {
  if (signal.type === 'metric') {
    return `${signal.content.key}: ${signal.content.value}${signal.content.unit ? ' ' + signal.content.unit : ''}`
  }
  if (signal.type === 'narrative') return signal.content.text
  if (signal.type === 'event') return signal.content.action
  if (signal.type === 'alert') return signal.content.message
  return JSON.stringify(signal.content)
}

// Format a hop key "nodeId:systemKey" for compact display as "S3·a3f2c".
function formatHop(hopKey) {
  const [nodeId, sysKey] = hopKey.split(':')
  return `${(sysKey || '').toUpperCase()}·${(nodeId || '').slice(0, 5)}`
}

export function SignalFeed({ signals, label }) {
  const t = useA11yType()
  const { t: tr } = useTranslation()

  return (
    <div style={{ padding: '24px 32px', flex: 1, display: 'flex', flexDirection: 'column' }}>
      {label && <p style={{ ...t.label, margin: '0 0 16px' }}>{label}</p>}

      {signals.length === 0 ? (
        <p style={t.monoMuted}>{tr('systemPage.noSignalsYet')}</p>
      ) : (
        <div role="log" aria-live="polite" aria-label={label || 'Signal feed'}>
          {signals.map(signal => (
            <div key={signal.id} style={{ padding: '6px 0' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <SignalIcon type={signal.type} />
                <span style={{ ...t.monoMuted, flexShrink: 0 }}>{formatTime(signal.timestamp)}</span>
                <span style={{ ...t.mono, color: color.primary }}>{signalSummary(signal)}</span>
              </div>
              {signal.hops && signal.hops.length > 0 && (
                <div style={{ ...t.monoMuted, paddingLeft: 24, marginTop: 2 }}>
                  <span style={{ marginRight: 6, opacity: 0.6 }}>{tr('systemPage.hops')}</span>
                  {signal.hops.map((h, i) => (
                    <span key={i}>
                      {i > 0 && <span style={{ color: color.borderLight }}> → </span>}
                      {formatHop(h)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
