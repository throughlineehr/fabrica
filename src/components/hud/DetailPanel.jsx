import { color } from '../../styles'
import { MAX_TREE_DEPTH } from '../../constants'
import { useAccessibility } from '../../accessibility'
import { getPatternDataUrl } from '../../hooks/usePatternTexture'
import { nodeLabel, shortId } from '../../utils/nodeLabel'
import { Breadcrumb } from './Breadcrumb'

function countDescendants(node) {
  let count = node.children.length
  for (const child of node.children) {
    count += countDescendants(child)
  }
  return count
}

export function DetailPanelCompact({ node, t, tr, dir }) {
  if (!node) return null
  return (
    <div dir={dir}>
      <p style={{ ...t.h3, margin: '0 0 4px' }}>{nodeLabel(node, tr)}</p>
      <p style={{ ...t.mono, margin: '0 0 2px' }}>{tr('hud.layer')}: {node.layer}</p>
      <p style={{ ...t.mono, margin: '0 0 2px' }}>{tr('hud.x')}: {node.x?.toFixed(1)}</p>
      <p style={{ ...t.mono, margin: '0 0 2px' }}>{tr('hud.children')}: {node.children.length}</p>
      <p style={{ ...t.mono, margin: '0 0 2px' }}>{tr('hud.depth')}: {-node.layer}/{MAX_TREE_DEPTH}</p>
      <p style={{ ...t.mono, margin: '0 0 2px', color: color.muted }}>{tr('hud.status')}: {tr('hud.nominal')}</p>
    </div>
  )
}

export function DetailPanelExpanded({ node, onBack, t, tr, dir }) {
  const { colorBlind } = useAccessibility()
  if (!node) return null
  return (
    <div dir={dir} style={{ maxWidth: 360 }}>
      <Breadcrumb node={node} mode="pane" onBack={onBack} t={t} tr={tr} />
      <h1 style={{ ...t.hero, margin: '16px 0 24px' }}>{nodeLabel(node, tr)}</h1>

      <div style={{ borderTop: `1px solid ${color.border}`, paddingTop: 16, marginBottom: 20 }}>
        <h3 style={{ ...t.h3, margin: '0 0 8px' }}>{tr('hud.position')}</h3>
        <p style={{ ...t.mono, margin: '0 0 2px' }}>{tr('hud.layer')}: {node.layer}</p>
        <p style={{ ...t.mono, margin: '0 0 2px' }}>{tr('hud.x')}: {node.x?.toFixed(1)}</p>
        <p style={{ ...t.mono, margin: '0 0 2px' }}>{tr('hud.depth')}: {-node.layer}/{MAX_TREE_DEPTH}</p>
      </div>

      <div style={{ borderTop: `1px solid ${color.border}`, paddingTop: 16, marginBottom: 20 }}>
        <h3 style={{ ...t.h3, margin: '0 0 8px' }}>{tr('hud.structure')}</h3>
        <p style={{ ...t.mono, margin: '0 0 2px' }}>{tr('hud.children')}: {node.children.length}</p>
        <p style={{ ...t.mono, margin: '0 0 2px' }}>{tr('hud.subtree')}: {countDescendants(node)}</p>
      </div>

      <div style={{ borderTop: `1px solid ${color.border}`, paddingTop: 16, marginBottom: 20 }}>
        <h3 style={{ ...t.h3, margin: '0 0 8px' }}>{tr('hud.systems')}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {['s5', 's4', 's3', 's2', 's1'].map((key) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 10, height: 10, borderRadius: 1,
                background: colorBlind
                  ? `url(${getPatternDataUrl(key, color[key].fill)})`
                  : color[key].fill,
                backgroundSize: colorBlind ? '6px 6px' : undefined,
              }} />
              <p style={{ ...t.body, color: color.primary, margin: 0 }}>{tr(`systems.${key}`).split(' ').pop()} — {tr('hud.active')}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${color.border}`, paddingTop: 16 }}>
        <h3 style={{ ...t.h3, margin: '0 0 8px' }}>{tr('hud.status')}</h3>
        <p style={{ ...t.body, margin: '0 0 2px' }}>{tr('hud.state')}: {tr('hud.nominal')}</p>
        <p style={{ ...t.caption, margin: 0 }}>{tr('hud.lastModified')}: —</p>
      </div>
    </div>
  )
}
