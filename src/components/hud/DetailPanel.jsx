import { useState, useRef } from 'react'
import { Pencil } from 'lucide-react'
import { color, sizes } from '../../styles'
import { MAX_TREE_DEPTH } from '../../constants'
import { useAccessibility } from '../../accessibility'
import { getPatternDataUrl } from '../../hooks/usePatternTexture'
import { nodeLabel } from '../../utils/nodeLabel'
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
      <p style={{ ...t.monoMuted, margin: '0 0 2px' }}>{tr('hud.status')}: {tr('hud.nominal')}</p>
    </div>
  )
}

function EditableName({ node, t, tr, onRename }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef()

  const startEdit = () => {
    setValue(node.name || '')
    setEditing(true)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }

  const commit = () => {
    if (onRename) onRename(node.id, value)
    setEditing(false)
  }

  if (editing) {
    return (
      <div style={{ margin: '16px 0 24px' }}>
        <label htmlFor="detail-rename" className="sr-only">{tr('menu.rename')}</label>
        <input
          id="detail-rename"
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
          }}
          onBlur={commit}
          placeholder={tr('menu.unnamed')}
          style={{
            ...t.hero, margin: 0, width: '100%',
            border: 'none', borderBottom: `2px solid ${color.focus}`,
            background: 'none', padding: '0 0 4px',
          }}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '16px 0 24px' }}>
      <h1
        onDoubleClick={startEdit}
        style={{ ...t.hero, margin: 0, cursor: 'text' }}
      >
        {nodeLabel(node, tr)}
      </h1>
      <button
        onClick={startEdit}
        aria-label={tr('menu.rename')}
        style={{
          display: 'flex', alignItems: 'center',
          background: 'none', border: 'none', cursor: 'pointer',
          color: color.muted, padding: 4, flexShrink: 0,
        }}
      >
        <Pencil size={sizes.iconSize} strokeWidth={sizes.iconStroke} />
      </button>
    </div>
  )
}

export function DetailPanelExpanded({ node, onBack, onRename, t, tr, dir }) {
  const { colorBlind } = useAccessibility()
  if (!node) return null
  return (
    <div dir={dir} style={{ maxWidth: 360 }}>
      <Breadcrumb node={node} mode="pane" onBack={onBack} t={t} tr={tr} />
      <EditableName node={node} t={t} tr={tr} onRename={onRename} />

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
              <p style={{ ...t.bodyStrong, margin: 0 }}>{tr(`systems.${key}`).split(' ').pop()} — {tr('hud.active')}</p>
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
