import { color } from '../../styles'
import { useA11yType } from '../../hooks/useA11yType'
import { useTranslation } from '../../i18n/index.jsx'
import { resolveColor } from '../../utils/resolveColor'

function dirLabel(dir, tr) {
  if (dir === 'both') return tr('systemPage.inOut')
  if (dir === 'in') return tr('systemPage.incoming')
  if (dir === 'out') return tr('systemPage.outgoing')
  return ''
}

export function TerminalDetail({ terminal, connections, onNavigate }) {
  const t = useA11yType()
  const { t: tr } = useTranslation()
  const c = resolveColor(terminal.colorKey)
  const dir = dirLabel(terminal.dir, tr)

  return (
    <div style={{ padding: 32 }}>
      {/* Terminal header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div aria-hidden="true" style={{
          width: 16, height: 16, borderRadius: '50%',
          background: c.fill,
        }} />
        <h3 style={{ ...t.h3, margin: 0 }}>{tr(terminal.labelKey)}</h3>
        <span style={t.monoMuted} aria-label={`${tr('systemPage.inOut')}: ${dir}`}>{dir}</span>
      </div>

      {/* Connected nodes — semantic list so screen readers announce the count */}
      {connections && connections.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} aria-label={tr('systemPage.connections')}>
          {connections.map(conn => (
            <li key={conn.id} style={{
              display: 'flex', alignItems: 'baseline', gap: 8,
              padding: '10px 0',
            }}>
              <span style={{ ...t.mono, color: color.primary }}>{conn.verb}</span>
              {onNavigate ? (
                <button
                  type="button"
                  style={{
                    ...t.mono, color: color.secondary, background: 'none', border: 'none',
                    padding: 0, cursor: 'pointer',
                    textDecoration: 'underline', textUnderlineOffset: 2,
                  }}
                  onClick={() => onNavigate(conn.id, conn.systemKey)}
                  aria-label={`${tr('nav.navigate')} ${conn.name}`}
                >{conn.name}</button>
              ) : (
                <span style={t.monoMuted}>{conn.name}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p style={t.monoMuted}>{tr('settings.notImplemented')}</p>
      )}
    </div>
  )
}
