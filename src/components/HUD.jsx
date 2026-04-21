import { color } from '../styles'
import { Z_INDEX } from '../constants'
import { useA11yType } from '../hooks/useA11yType'
import { useTranslation } from '../i18n/index.jsx'
import { nodeLabel } from '../utils/nodeLabel'
import { Breadcrumb } from './hud/Breadcrumb'
import { DetailPanelCompact, DetailPanelExpanded } from './hud/DetailPanel'
import { Instructions } from './hud/Instructions'

export function HUD({ node, mode, onBack, onRename }) {
  const t = useA11yType()
  const { t: tr, dir } = useTranslation()
  const isPaneMode = mode === 'pane'
  const canGoBack = mode === 'focused' || mode === 'pane'

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
              <p dir={dir} style={{ ...t.title, margin: '4px 0 0' }}>{nodeLabel(node, tr)}</p>
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
          ? <DetailPanelExpanded node={node} onBack={onBack} onRename={onRename} t={t} tr={tr} dir={dir} />
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
