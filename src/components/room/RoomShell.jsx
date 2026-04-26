import { useState } from 'react'
import { color, ui } from '../../styles'
import { SYSTEMS, EXTERNAL_SYSTEMS } from '../../constants'
import { useA11yType } from '../../hooks/useA11yType'
import { useTranslation } from '../../i18n/index.jsx'
import { CableTerminal } from './CableTerminal'
import { buildRoomTerminals, resolveTerminalConnections } from '../../signals/topology'

// Terminal layout tuning constants. The earlier dev sliders panel was
// removed once these settled; values are baked in. To revisit:
// promote `edgeOffset` and `tuning` back to useState and restore the
// slider grid (see git history for the panel markup).
const EDGE_OFFSET = { top: 43, bottom: 41, left: 44, right: 39 }
const TUNING = { terminalSize: 29, hollowSize: 15, bend: 22, cableThickness: 23 }

export function RoomShell({ systemKey, nodeId, nodeName, node, tree, onBack, onNavigate, children }) {
  const t = useA11yType()
  const { t: tr } = useTranslation()
  const terminals = buildRoomTerminals(node, systemKey, tree || node)
  const [activeTerminal, setActiveTerminal] = useState(null)

  const edgeOffset = EDGE_OFFSET
  const tuning = TUNING

  const topTerminals = terminals.filter(t => t.wall === 'top')
  const bottomTerminals = terminals.filter(t => t.wall === 'bottom')
  const leftTerminals = terminals.filter(t => t.wall === 'left')
  const rightTerminals = terminals.filter(t => t.wall === 'right')

  // Resolve which nodes each terminal connects to
  const connections = node ? resolveTerminalConnections(node, systemKey, tree || node, tr) : {}

  const verb = tr(`systems.${systemKey}verb`)
  const unitLabel = nodeName || `${tr('nav.unit')} ${nodeId?.slice(0, 5)}`
  const sys = SYSTEMS[systemKey] || EXTERNAL_SYSTEMS[systemKey]
  const sysColor = sys?.color || color.primary

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: color.white,
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Header */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '24px 32px',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        zIndex: 2,
        pointerEvents: 'none',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', pointerEvents: 'auto' }}>
          {/* Sub-page: page-level heading is h2 so document h1 (overview) isn't shadowed.
              Unit label demotes to h3. */}
          <h2 style={{
            ...t.title, margin: 0, lineHeight: 1,
            borderBottom: `4px solid ${sysColor}`,
            paddingBottom: 6,
            display: 'inline-block',
          }}>{verb}</h2>
          <h3 style={{ ...t.h1, margin: '4px 0 0', color: color.secondary }}>{unitLabel}</h3>
        </div>
        <button onClick={onBack} aria-label={tr('nav.back')} style={{ ...ui.button, pointerEvents: 'auto' }}>← {tr('nav.back')}</button>
      </div>

      {/* Content area — centered in viewport */}
      <div style={{
        position: 'absolute',
        top: 140, left: 200, right: 200, bottom: 100,
        overflow: 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
        {typeof children === 'function'
          ? children({ activeTerminal, terminals, connections, onNavigate, sysColor })
          : children}
      </div>

      {/* Fixed terminals — each anchored to its viewport edge */}

      {/* Top wall */}
      {topTerminals.length > 0 && (
        <div style={{
          position: 'fixed',
          top: edgeOffset.top,
          left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 48,
          zIndex: 1,
        }}>
          {topTerminals.map(terminal => (
            <CableTerminal key={terminal.id} terminal={terminal} nodeId={nodeId} systemKey={systemKey}
              active={activeTerminal === terminal.id} onClick={setActiveTerminal} tuning={tuning}
              connections={connections[terminal.id]} onNavigate={onNavigate} />
          ))}
        </div>
      )}

      {/* Bottom wall */}
      {bottomTerminals.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: edgeOffset.bottom,
          left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 48,
          zIndex: 1,
        }}>
          {bottomTerminals.map(terminal => (
            <CableTerminal key={terminal.id} terminal={terminal} nodeId={nodeId} systemKey={systemKey}
              active={activeTerminal === terminal.id} onClick={setActiveTerminal} tuning={tuning}
              connections={connections[terminal.id]} onNavigate={onNavigate} />
          ))}
        </div>
      )}

      {/* Left wall */}
      {leftTerminals.length > 0 && (
        <div style={{
          position: 'fixed',
          left: edgeOffset.left,
          top: '50%', transform: 'translateY(-50%)',
          display: 'flex', flexDirection: 'column', gap: 32,
          zIndex: 1,
        }}>
          {leftTerminals.map(terminal => (
            <CableTerminal key={terminal.id} terminal={terminal} nodeId={nodeId} systemKey={systemKey}
              active={activeTerminal === terminal.id} onClick={setActiveTerminal} tuning={tuning}
              connections={connections[terminal.id]} onNavigate={onNavigate} />
          ))}
        </div>
      )}

      {/* Right wall */}
      {rightTerminals.length > 0 && (
        <div style={{
          position: 'fixed',
          right: edgeOffset.right,
          top: '50%', transform: 'translateY(-50%)',
          display: 'flex', flexDirection: 'column', gap: 32,
          zIndex: 1,
        }}>
          {rightTerminals.map(terminal => (
            <CableTerminal key={terminal.id} terminal={terminal} nodeId={nodeId} systemKey={systemKey}
              active={activeTerminal === terminal.id} onClick={setActiveTerminal} tuning={tuning}
              connections={connections[terminal.id]} onNavigate={onNavigate} />
          ))}
        </div>
      )}

    </div>
  )
}
