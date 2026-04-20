import { type, color, ui } from '../styles'
import { SYSTEMS, EXTERNAL_SYSTEMS } from '../constants'

const systemNames = {
  s5: 'System 5',
  s4: 'System 4',
  s3: 'System 3',
  s2: 'System 2',
  s1: 'System 1',
}

export function SystemPage({ nodeId, systemKey, onBack }) {
  const sys = SYSTEMS[systemKey] || EXTERNAL_SYSTEMS[systemKey]
  const name = systemNames[systemKey]

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: color.white,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Top bar */}
      <div style={{
        padding: '16px 24px',
        borderBottom: `1px solid ${color.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 12, height: 12, background: sys.color, border: `2px solid ${sys.strokeColor}`, borderRadius: 2 }} />
          <span style={type.h3}>{name}</span>
          <span style={type.mono}>Unit {nodeId?.slice(0, 5)}</span>
        </div>
        <button
          onClick={onBack}
          style={ui.button}
          onMouseEnter={(e) => { e.target.style.color = color.secondary; e.target.style.borderLeftColor = color.muted }}
          onMouseLeave={(e) => { e.target.style.color = color.primary; e.target.style.borderLeftColor = color.primary }}
        >
          Back
        </button>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, display: 'flex' }}>
        {/* Left sidebar */}
        <div style={{
          width: 240, borderRight: `1px solid ${color.border}`,
          padding: '24px',
        }}>
          <p style={{ ...type.label, margin: '0 0 12px' }}>CONFIGURATION</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={{ ...type.mono, color: color.primary, margin: 0 }}>Parameters</p>
            <p style={{ ...type.mono, margin: 0 }}>Connections</p>
            <p style={{ ...type.mono, margin: 0 }}>Constraints</p>
            <p style={{ ...type.mono, margin: 0 }}>History</p>
          </div>

          <p style={{ ...type.label, margin: '24px 0 12px' }}>DIAGNOSTICS</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={{ ...type.mono, margin: 0 }}>State</p>
            <p style={{ ...type.mono, margin: 0 }}>Logs</p>
            <p style={{ ...type.mono, margin: 0 }}>Metrics</p>
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, padding: '24px' }}>
          <p style={{ ...type.label, margin: '0 0 8px' }}>PARAMETERS</p>

          <div style={{ borderTop: `1px solid ${color.border}` }}>
            {[
              { key: 'threshold', value: '0.85', unit: '' },
              { key: 'max_iterations', value: '1000', unit: '' },
              { key: 'learning_rate', value: '0.001', unit: '' },
              { key: 'batch_size', value: '32', unit: '' },
              { key: 'dropout', value: '0.2', unit: '' },
            ].map((param) => (
              <div key={param.key} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0',
                borderBottom: `1px solid ${color.borderLight}`,
              }}>
                <span style={{ ...type.mono, color: color.primary }}>{param.key}</span>
                <span style={type.mono}>{param.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
