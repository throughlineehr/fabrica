import { type, color } from '../styles'
import { Z_INDEX } from '../constants'

function shortId(id) { return id ? id.slice(0, 5) : '' }

function DetailPanelCompact({ node }) {
  if (!node) return null
  const label = node.type === 'operation' ? 'Operation' : 'Unit'
  return (
    <div>
      <p style={{ ...type.h3, margin: '0 0 4px' }}>{label} {shortId(node.id)}</p>
      <p style={{ ...type.mono, margin: '0 0 2px' }}>layer: {node.layer}</p>
      <p style={{ ...type.mono, margin: '0 0 2px' }}>x: {node.x?.toFixed(1)}</p>
      <p style={{ ...type.mono, margin: '0 0 2px' }}>children: {node.children.length}</p>
      <p style={{ ...type.mono, margin: '0 0 2px' }}>depth: {-node.layer}/20</p>
      <p style={{ ...type.mono, margin: '0 0 2px', color: color.muted }}>status: nominal</p>
    </div>
  )
}

function DetailPanelExpanded({ node }) {
  if (!node) return null
  const label = node.type === 'operation' ? 'Operation' : 'Unit'
  const categoryLabel = node.type === 'operation' ? 'OPERATION' : 'META UNIT'
  return (
    <div style={{ maxWidth: 360 }}>
      <p style={{ ...type.label, margin: '0 0 8px' }}>{categoryLabel}</p>
      <p style={{ ...type.hero, margin: '0 0 24px' }}>{label} {shortId(node.id)}</p>

      <div style={{ borderTop: `1px solid ${color.border}`, paddingTop: 16, marginBottom: 20 }}>
        <p style={{ ...type.h3, margin: '0 0 8px' }}>Position</p>
        <p style={{ ...type.mono, margin: '0 0 2px' }}>layer: {node.layer}</p>
        <p style={{ ...type.mono, margin: '0 0 2px' }}>x: {node.x?.toFixed(1)}</p>
        <p style={{ ...type.mono, margin: '0 0 2px' }}>depth: {-node.layer}/20</p>
      </div>

      <div style={{ borderTop: `1px solid ${color.border}`, paddingTop: 16, marginBottom: 20 }}>
        <p style={{ ...type.h3, margin: '0 0 8px' }}>Structure</p>
        <p style={{ ...type.mono, margin: '0 0 2px' }}>children: {node.children.length}</p>
        <p style={{ ...type.mono, margin: '0 0 2px' }}>subtree: {countDescendants(node)}</p>
      </div>

      <div style={{ borderTop: `1px solid ${color.border}`, paddingTop: 16, marginBottom: 20 }}>
        <p style={{ ...type.h3, margin: '0 0 8px' }}>Systems</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, background: color.s5.fill, borderRadius: 1 }} />
            <p style={{ ...type.body, color: color.primary, margin: 0 }}>S5 — active</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, background: color.s4.fill, borderRadius: 1 }} />
            <p style={{ ...type.body, color: color.primary, margin: 0 }}>S4 — active</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, background: color.s3.fill, borderRadius: 1 }} />
            <p style={{ ...type.body, color: color.primary, margin: 0 }}>S3 — active</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, background: color.s2.fill, borderRadius: 1 }} />
            <p style={{ ...type.body, color: color.primary, margin: 0 }}>S2 — active</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, background: color.s1.fill, borderRadius: 1 }} />
            <p style={{ ...type.body, color: color.primary, margin: 0 }}>S1 — active</p>
          </div>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${color.border}`, paddingTop: 16 }}>
        <p style={{ ...type.h3, margin: '0 0 8px' }}>Status</p>
        <p style={{ ...type.body, margin: '0 0 2px' }}>state: nominal</p>
        <p style={{ ...type.caption, margin: 0 }}>last modified: —</p>
      </div>
    </div>
  )
}

function countDescendants(node) {
  let count = node.children.length
  for (const child of node.children) {
    count += countDescendants(child)
  }
  return count
}

function Instructions({ mode }) {
  const hints = {
    default: [
      'Hover to inspect',
      'Scroll to zoom',
      'Drag to orbit',
    ],
    hovered: [
      'Double-click to focus',
      'Right-click for actions',
    ],
    focused: [
      'Double-click for detail view',
      'Right-click for actions',
      'Back to return',
    ],
    pane: [
      'Double-click system to open',
      'Back to return',
    ],
  }

  const lines = hints[mode] || hints.default

  return (
    <div>
      {lines.map((line, i) => (
        <p key={i} style={{ ...type.mono, color: color.muted, margin: '0 0 2px', textAlign: 'right' }}>{line}</p>
      ))}
    </div>
  )
}

export function HUD({ node, mode }) {
  const isPaneMode = mode === 'pane'

  const showOrgTitle = mode === 'default' || mode === 'hovered'
  const showUnitTitle = mode === 'focused'

  return (
    <>
      <div style={{
        position: 'fixed', top: 24, left: 24, zIndex: Z_INDEX.hud,
        pointerEvents: 'none',
      }}>
        {showOrgTitle && <p style={{ ...type.title, margin: 0 }}>Fabrica</p>}
        {showUnitTitle && node && <p style={{ ...type.title, margin: 0 }}>{node.type === 'operation' ? 'Operation' : 'Unit'} {shortId(node.id)}</p>}
      </div>
      <div style={{
        position: 'fixed',
        bottom: isPaneMode ? undefined : 24,
        top: isPaneMode ? 24 : undefined,
        left: 24,
        zIndex: Z_INDEX.hud,
        pointerEvents: 'none',
      }}>
        {isPaneMode
          ? <DetailPanelExpanded node={node} />
          : <DetailPanelCompact node={node} />
        }
      </div>
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: Z_INDEX.hud,
        pointerEvents: 'none',
      }}>
        <Instructions mode={mode} />
      </div>
    </>
  )
}
