import { useState } from 'react'
import { color, ui } from '../../styles'
import { SYSTEMS, EXTERNAL_SYSTEMS } from '../../constants'
import { useA11yType } from '../../hooks/useA11yType'
import { useTranslation } from '../../i18n/index.jsx'
import { CableTerminal } from './CableTerminal'
import { buildRoomTerminals, resolveTerminalConnections } from '../../signals/topology'

const DEV_TUNING = false

export function RoomShell({ systemKey, nodeId, nodeName, node, tree, onBack, onNavigate, children }) {
  const t = useA11yType()
  const { t: tr } = useTranslation()
  const terminals = buildRoomTerminals(node, systemKey, tree || node)
  const [activeTerminal, setActiveTerminal] = useState(null)

  // Tuning constants — to re-enable interactive tuning, switch back to useState
  const edgeOffset = { top: 43, bottom: 41, left: 44, right: 39 }
  const tuning = { terminalSize: 29, hollowSize: 15, bend: 22, cableThickness: 23 }

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
          <h1 style={{
            ...t.title, margin: 0, lineHeight: 1,
            borderBottom: `4px solid ${sysColor}`,
            paddingBottom: 6,
            display: 'inline-block',
          }}>{verb}</h1>
          <h2 style={{ ...t.h1, margin: '4px 0 0', color: color.secondary }}>{unitLabel}</h2>
        </div>
        <button onClick={onBack} style={{ ...ui.button, pointerEvents: 'auto' }}>{tr('nav.esc')}</button>
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
            <CableTerminal key={terminal.id} terminal={terminal}
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
            <CableTerminal key={terminal.id} terminal={terminal}
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
            <CableTerminal key={terminal.id} terminal={terminal}
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
            <CableTerminal key={terminal.id} terminal={terminal}
              active={activeTerminal === terminal.id} onClick={setActiveTerminal} tuning={tuning}
              connections={connections[terminal.id]} onNavigate={onNavigate} />
          ))}
        </div>
      )}

      {/* Dev tuning panel — to re-enable, switch edgeOffset/tuning back to useState
         and restore setter functions (setEdgeTop, setTerminalSize, etc.) */}
      {DEV_TUNING && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          background: color.white, border: `1px solid ${color.border}`,
          padding: 20, zIndex: 10,
          display: 'grid', gridTemplateColumns: '120px 200px 50px', gap: '6px 12px',
          fontFamily: 'monospace', fontSize: 12,
        }}>
          {[
            ['Top offset', edgeOffset.top, null, 0, 300],
            ['Bottom offset', edgeOffset.bottom, null, 0, 300],
            ['Left offset', edgeOffset.left, null, 0, 300],
            ['Right offset', edgeOffset.right, null, 0, 300],
            ['Circle size', tuning.terminalSize, null, 6, 60],
            ['Hollow size', tuning.hollowSize, null, 0, 30],
            ['Bend point', tuning.bend, null, 0, 80],
            ['Cable width', tuning.cableThickness, null, 2, 30],
          ].map(([label, value, setter, min, max]) => (
            <label key={label} style={{ display: 'contents' }}>
              <span>{label}</span>
              <input type="range" min={min} max={max} value={value}
                onChange={e => setter?.(Number(e.target.value))} />
              <span>{value}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
