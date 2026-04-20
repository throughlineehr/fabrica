import { useEffect } from 'react'
import { color } from '../styles'
import { Z_INDEX, MAX_TREE_DEPTH } from '../constants'
import { useA11yType } from '../hooks/useA11yType'
import { useTranslation } from '../i18n/index.jsx'
import { useAccessibility } from '../accessibility'
import { getPatternDataUrl } from '../hooks/usePatternTexture'

function shortId(id) { return id ? id.slice(0, 5) : '' }

function nodeLabel(node, tr) {
  if (!node) return ''
  return (node.type === 'operation' ? tr('nav.operation') : tr('nav.unit')) + ' ' + shortId(node.id)
}

function nodeLabelShort(node, tr) {
  if (!node) return ''
  return (node.type === 'operation' ? tr('nav.op') : tr('nav.unit')) + ' ' + shortId(node.id)
}

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

function Breadcrumb({ node, mode, onBack, t, tr }) {
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

function DetailPanelCompact({ node, t, tr, dir }) {
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

function DetailPanelExpanded({ node, onBack, t, tr, dir }) {
  const { colorBlind } = useAccessibility()
  if (!node) return null
  return (
    <div dir={dir} style={{ maxWidth: 360 }}>
      <Breadcrumb node={node} mode="pane" onBack={onBack} t={t} tr={tr} />
      <p style={{ ...t.hero, margin: '16px 0 24px' }}>{nodeLabel(node, tr)}</p>

      <div style={{ borderTop: `1px solid ${color.border}`, paddingTop: 16, marginBottom: 20 }}>
        <p style={{ ...t.h3, margin: '0 0 8px' }}>{tr('hud.position')}</p>
        <p style={{ ...t.mono, margin: '0 0 2px' }}>{tr('hud.layer')}: {node.layer}</p>
        <p style={{ ...t.mono, margin: '0 0 2px' }}>{tr('hud.x')}: {node.x?.toFixed(1)}</p>
        <p style={{ ...t.mono, margin: '0 0 2px' }}>{tr('hud.depth')}: {-node.layer}/{MAX_TREE_DEPTH}</p>
      </div>

      <div style={{ borderTop: `1px solid ${color.border}`, paddingTop: 16, marginBottom: 20 }}>
        <p style={{ ...t.h3, margin: '0 0 8px' }}>{tr('hud.structure')}</p>
        <p style={{ ...t.mono, margin: '0 0 2px' }}>{tr('hud.children')}: {node.children.length}</p>
        <p style={{ ...t.mono, margin: '0 0 2px' }}>{tr('hud.subtree')}: {countDescendants(node)}</p>
      </div>

      <div style={{ borderTop: `1px solid ${color.border}`, paddingTop: 16, marginBottom: 20 }}>
        <p style={{ ...t.h3, margin: '0 0 8px' }}>{tr('hud.systems')}</p>
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
        <p style={{ ...t.h3, margin: '0 0 8px' }}>{tr('hud.status')}</p>
        <p style={{ ...t.body, margin: '0 0 2px' }}>{tr('hud.state')}: {tr('hud.nominal')}</p>
        <p style={{ ...t.caption, margin: 0 }}>{tr('hud.lastModified')}: —</p>
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

function Instructions({ mode, t, tr }) {
  const hints = {
    default: [
      tr('instructions.hoverToInspect'),
      tr('instructions.scrollToZoom'),
      tr('instructions.dragToOrbit'),
    ],
    hovered: [
      tr('instructions.doubleClickFocus'),
      tr('instructions.rightClickActions'),
    ],
    focused: [
      tr('instructions.doubleClickDetail'),
      tr('instructions.doubleClickEmpty'),
      tr('instructions.rightClickActions'),
    ],
    pane: [
      tr('instructions.doubleClickSystem'),
      tr('instructions.doubleClickEmpty'),
    ],
  }

  const lines = hints[mode] || hints.default

  return (
    <div>
      {lines.map((line, i) => (
        <p key={i} style={{ ...t.mono, color: color.muted, margin: '0 0 2px', textAlign: 'end' }}>{line}</p>
      ))}
    </div>
  )
}

export function HUD({ node, mode, onBack }) {
  const t = useA11yType()
  const { t: tr, dir } = useTranslation()
  const isPaneMode = mode === 'pane'
  const canGoBack = mode === 'focused' || mode === 'pane'

  useEffect(() => {
    if (!canGoBack || !onBack) return
    const handler = (e) => {
      if (e.key === 'Escape' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        onBack()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [canGoBack, onBack])

  return (
    <>
      {!isPaneMode && (
        <div style={{
          position: 'fixed', top: 24, left: 24, zIndex: Z_INDEX.hud,
          pointerEvents: canGoBack ? 'auto' : 'none',
        }}>
          {(mode === 'default' || mode === 'hovered') && (
            <p dir={dir} style={{ ...t.title, margin: 0 }}>{tr('app.name')}</p>
          )}
          {mode === 'focused' && (
            <div>
              <Breadcrumb node={node} mode={mode} onBack={onBack} t={t} tr={tr} />
              <p style={{ ...t.title, margin: '4px 0 0' }}>{nodeLabel(node, tr)}</p>
            </div>
          )}
        </div>
      )}
      <div style={{
        position: 'fixed',
        bottom: isPaneMode ? 24 : 24,
        top: isPaneMode ? 24 : undefined,
        left: 24,
        zIndex: Z_INDEX.hud,
        pointerEvents: canGoBack ? 'auto' : 'none',
        overflowY: isPaneMode ? 'auto' : undefined,
        maxHeight: isPaneMode ? 'calc(100vh - 48px)' : undefined,
        paddingRight: isPaneMode ? 12 : undefined,
      }}>
        {isPaneMode
          ? <DetailPanelExpanded node={node} onBack={onBack} t={t} tr={tr} dir={dir} />
          : <DetailPanelCompact node={node} t={t} tr={tr} dir={dir} />
        }
      </div>
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: Z_INDEX.hud,
        pointerEvents: 'none',
      }}>
        <Instructions mode={mode} t={t} tr={tr} />
      </div>
    </>
  )
}
