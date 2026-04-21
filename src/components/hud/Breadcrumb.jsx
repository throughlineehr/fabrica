import { color } from '../../styles'
import { nodeLabelShort } from '../../utils/nodeLabel'

function BreadcrumbLink({ label, onClick, t }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...t.mono, color: color.muted,
        background: 'none', border: 'none', cursor: 'pointer',
        padding: 0, textDecoration: 'none',
      }}
      onMouseEnter={(e) => { e.target.style.color = color.primary; e.target.style.textDecoration = 'underline' }}
      onMouseLeave={(e) => { e.target.style.color = color.muted; e.target.style.textDecoration = 'none' }}
    >{label}</button>
  )
}

export function Breadcrumb({ node, mode, onBack, t, tr }) {
  if (mode === 'default' || mode === 'hovered') return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <BreadcrumbLink label={tr('app.name')} onClick={onBack} t={t} />
      {mode === 'focused' && (
        <>
          <span style={{ ...t.mono, color: color.muted }}>/</span>
          <span style={{ ...t.mono, color: color.primary }}>{nodeLabelShort(node, tr)}</span>
        </>
      )}
      {mode === 'pane' && (
        <>
          <span style={{ ...t.mono, color: color.muted }}>/</span>
          <BreadcrumbLink label={nodeLabelShort(node, tr)} onClick={onBack} t={t} />
          <span style={{ ...t.mono, color: color.muted }}>/</span>
          <span style={{ ...t.mono, color: color.primary }}>{tr('nav.detail')}</span>
        </>
      )}
      <span style={{ ...t.caption, color: color.muted, marginLeft: 6 }}>{tr('nav.esc')}</span>
    </div>
  )
}
