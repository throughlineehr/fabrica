import { color, ui } from '../styles'
import { SYSTEMS, EXTERNAL_SYSTEMS } from '../constants'
import { useA11yType } from '../hooks/useA11yType'
import { useTranslation } from '../i18n/index.jsx'

export function SystemPage({ nodeId, systemKey, onBack }) {
  const t = useA11yType()
  const { t: tr } = useTranslation()
  const sys = SYSTEMS[systemKey] || EXTERNAL_SYSTEMS[systemKey]
  const name = tr(`systems.${systemKey}`)

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: color.white,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '16px 24px',
        borderBottom: `1px solid ${color.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 12, height: 12, background: sys.color, border: `2px solid ${sys.strokeColor}`, borderRadius: 2 }} />
          <span style={t.h3}>{name}</span>
          <span style={t.mono}>{tr('nav.unit')} {nodeId?.slice(0, 5)}</span>
        </div>
        <button
          onClick={onBack}
          style={ui.button}
          onMouseEnter={(e) => { e.target.style.color = color.secondary; e.target.style.borderLeftColor = color.muted }}
          onMouseLeave={(e) => { e.target.style.color = color.primary; e.target.style.borderLeftColor = color.primary }}
        >
          {tr('nav.esc')}
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex' }}>
        <div style={{
          width: 240, borderRight: `1px solid ${color.border}`,
          padding: '24px',
        }}>
          <p style={{ ...t.label, margin: '0 0 12px' }}>{tr('systemPage.configuration')}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={{ ...t.mono, color: color.primary, margin: 0 }}>{tr('systemPage.parameters')}</p>
            <p style={{ ...t.mono, margin: 0 }}>{tr('systemPage.connections')}</p>
            <p style={{ ...t.mono, margin: 0 }}>{tr('systemPage.constraints')}</p>
            <p style={{ ...t.mono, margin: 0 }}>{tr('systemPage.history')}</p>
          </div>

          <p style={{ ...t.label, margin: '24px 0 12px' }}>{tr('systemPage.diagnostics')}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={{ ...t.mono, margin: 0 }}>{tr('systemPage.statePage')}</p>
            <p style={{ ...t.mono, margin: 0 }}>{tr('systemPage.logs')}</p>
            <p style={{ ...t.mono, margin: 0 }}>{tr('systemPage.metrics')}</p>
          </div>
        </div>

        <div style={{ flex: 1, padding: '24px' }}>
          <p style={{ ...t.label, margin: '0 0 8px' }}>{tr('systemPage.parameters')}</p>

          <div style={{ borderTop: `1px solid ${color.border}` }}>
            {[
              { key: 'threshold', value: '0.85' },
              { key: 'max_iterations', value: '1000' },
              { key: 'learning_rate', value: '0.001' },
              { key: 'batch_size', value: '32' },
              { key: 'dropout', value: '0.2' },
            ].map((param) => (
              <div key={param.key} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0',
                borderBottom: `1px solid ${color.borderLight}`,
              }}>
                <span style={{ ...t.mono, color: color.primary }}>{param.key}</span>
                <span style={t.mono}>{param.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
