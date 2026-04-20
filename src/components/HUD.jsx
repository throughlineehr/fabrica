import { useEffect } from 'react'
import { color } from '../styles'
import { Z_INDEX, MAX_TREE_DEPTH } from '../constants'
import { useA11yType } from '../hooks/useA11yType'

function shortId(id) { return id ? id.slice(0, 5) : '' }

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

function Breadcrumb({ node, mode, onBack, t }) {
  if (mode === 'default' || mode === 'hovered') return null
  const nodeLabel = node ? (node.type === 'operation' ? 'Op' : 'Unit') + ' ' + shortId(node.id) : ''

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <BreadcrumbLink label="Fabrica" onClick={onBack} t={t} />
      {mode === 'focused' && (
        <>
          <span style={{ ...t.mono, color: color.muted }}>/</span>
          <span style={{ ...t.mono, color: color.primary }}>{nodeLabel}</span>
        </>
      )}
      {mode === 'pane' && (
        <>
          <span style={{ ...t.mono, color: color.muted }}>/</span>
          <BreadcrumbLink label={nodeLabel} onClick={onBack} t={t} />
          <span style={{ ...t.mono, color: color.muted }}>/</span>
          <span style={{ ...t.mono, color: color.primary }}>Detail</span>
        </>
      )}
      <span style={{ ...t.caption, color: color.muted, marginLeft: 6 }}>esc</span>
    </div>
  )
}

function DetailPanelCompact({ node, t }) {
  if (!node) return null
  const label = node.type === 'operation' ? 'Operation' : 'Unit'
  return (
    <div>
      <p style={{ ...t.h3, margin: '0 0 4px' }}>{label} {shortId(node.id)}</p>
      <p style={{ ...t.mono, margin: '0 0 2px' }}>layer: {node.layer}</p>
      <p style={{ ...t.mono, margin: '0 0 2px' }}>x: {node.x?.toFixed(1)}</p>
      <p style={{ ...t.mono, margin: '0 0 2px' }}>children: {node.children.length}</p>
      <p style={{ ...t.mono, margin: '0 0 2px' }}>depth: {-node.layer}/{MAX_TREE_DEPTH}</p>
      <p style={{ ...t.mono, margin: '0 0 2px', color: color.muted }}>status: nominal</p>
    </div>
  )
}

function DetailPanelExpanded({ node, onBack, t }) {
  if (!node) return null
  const label = node.type === 'operation' ? 'Operation' : 'Unit'
  return (
    <div style={{ maxWidth: 360 }}>
      <Breadcrumb node={node} mode="pane" onBack={onBack} t={t} />
      <p style={{ ...t.hero, margin: '16px 0 24px' }}>{label} {shortId(node.id)}</p>

      <div style={{ borderTop: `1px solid ${color.border}`, paddingTop: 16, marginBottom: 20 }}>
        <p style={{ ...t.h3, margin: '0 0 8px' }}>Position</p>
        <p style={{ ...t.mono, margin: '0 0 2px' }}>layer: {node.layer}</p>
        <p style={{ ...t.mono, margin: '0 0 2px' }}>x: {node.x?.toFixed(1)}</p>
        <p style={{ ...t.mono, margin: '0 0 2px' }}>depth: {-node.layer}/{MAX_TREE_DEPTH}</p>
      </div>

      <div style={{ borderTop: `1px solid ${color.border}`, paddingTop: 16, marginBottom: 20 }}>
        <p style={{ ...t.h3, margin: '0 0 8px' }}>Structure</p>
        <p style={{ ...t.mono, margin: '0 0 2px' }}>children: {node.children.length}</p>
        <p style={{ ...t.mono, margin: '0 0 2px' }}>subtree: {countDescendants(node)}</p>
      </div>

      <div style={{ borderTop: `1px solid ${color.border}`, paddingTop: 16, marginBottom: 20 }}>
        <p style={{ ...t.h3, margin: '0 0 8px' }}>Systems</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { label: 'S5', c: color.s5.fill },
            { label: 'S4', c: color.s4.fill },
            { label: 'S3', c: color.s3.fill },
            { label: 'S2', c: color.s2.fill },
            { label: 'S1', c: color.s1.fill },
          ].map((sys) => (
            <div key={sys.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, background: sys.c, borderRadius: 1 }} />
              <p style={{ ...t.body, color: color.primary, margin: 0 }}>{sys.label} — active</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${color.border}`, paddingTop: 16 }}>
        <p style={{ ...t.h3, margin: '0 0 8px' }}>Status</p>
        <p style={{ ...t.body, margin: '0 0 2px' }}>state: nominal</p>
        <p style={{ ...t.caption, margin: 0 }}>last modified: —</p>
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

function Instructions({ mode, t }) {
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
      'Double-click empty to go back',
      'Right-click for actions',
    ],
    pane: [
      'Double-click system to open',
      'Double-click empty to go back',
    ],
  }

  const lines = hints[mode] || hints.default

  return (
    <div>
      {lines.map((line, i) => (
        <p key={i} style={{ ...t.mono, color: color.muted, margin: '0 0 2px', textAlign: 'right' }}>{line}</p>
      ))}
    </div>
  )
}

export function HUD({ node, mode, onBack }) {
  const t = useA11yType()
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
            <p style={{ ...t.title, margin: 0 }}>Fabrica</p>
          )}
          {mode === 'focused' && (
            <div>
              <Breadcrumb node={node} mode={mode} onBack={onBack} t={t} />
              <p style={{ ...t.title, margin: '4px 0 0' }}>
                {node ? (node.type === 'operation' ? 'Operation' : 'Unit') + ' ' + shortId(node.id) : ''}
              </p>
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
          ? <DetailPanelExpanded node={node} onBack={onBack} t={t} />
          : <DetailPanelCompact node={node} t={t} />
        }
      </div>
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: Z_INDEX.hud,
        pointerEvents: 'none',
      }}>
        <Instructions mode={mode} t={t} />
      </div>
    </>
  )
}
