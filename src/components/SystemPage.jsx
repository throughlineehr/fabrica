import { useEffect, useMemo, useRef, useState } from 'react'
import { RoomShell } from './room/RoomShell'
import { TerminalDetail } from './room/TerminalDetail'
import { Switchboard } from './room/Switchboard'
import { Rack } from './rack/Rack'
import { getProcessorDef } from '../signals/library'
import { useTranslation } from '../i18n/index.jsx'
import { useA11yType } from '../hooks/useA11yType'
import { color } from '../styles'

const TAB_DEFS = [
  { id: 'switchboard', labelKey: 'systemPage.tabSwitchboard' },
  { id: 'rack',        labelKey: 'systemPage.tabRack' },
]

export function SystemPage({
  nodeId, nodeName, node, tree, systemKey,
  processors,
  cables = [],
  onAddProcessor, onRemoveProcessor, onUpdateProcessor, onOpenProcessor,
  onAddCable, onRemoveCable,
  onBack, onNavigate,
}) {
  const { t: tr } = useTranslation()
  const t = useA11yType()
  const [activeTab, setActiveTab] = useState('switchboard')

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        onBack()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onBack])

  // Build the {instance, def} list for the Rack
  const rackProcessors = useMemo(() => processors.map(inst => ({
    instance: inst,
    def: getProcessorDef(inst.defId),
  })).filter(p => p.def), [processors])

  return (
    <RoomShell systemKey={systemKey} nodeId={nodeId} nodeName={nodeName} node={node} tree={tree} onBack={onBack} onNavigate={onNavigate}>
      {({ activeTerminal, terminals, connections, onNavigate: nav, sysColor }) => {
        const selected = activeTerminal
          ? terminals.find(t => t.id === activeTerminal)
          : null

        if (selected) {
          return <TerminalDetail terminal={selected} connections={connections[selected.id]} onNavigate={nav} />
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <TabBar
              tabs={TAB_DEFS}
              activeTab={activeTab}
              onChange={setActiveTab}
              tr={tr}
              t={t}
              sysColor={sysColor}
            />
            <div
              role="tabpanel"
              id={`tabpanel-${activeTab}`}
              aria-labelledby={`tab-${activeTab}`}
              style={{ flex: 1, minHeight: 0, overflow: 'auto' }}
            >
              {activeTab === 'switchboard' ? (
                <Switchboard
                  systemKey={systemKey}
                  sysColor={sysColor}
                  terminals={terminals}
                  processors={processors}
                  cables={cables}
                  onAddProcessor={onAddProcessor}
                  onRemoveProcessor={onRemoveProcessor}
                  onUpdateProcessor={onUpdateProcessor}
                  onOpenProcessor={onOpenProcessor}
                  onAddCable={onAddCable}
                  onRemoveCable={onRemoveCable}
                />
              ) : (
                <Rack
                  processors={rackProcessors}
                  processorState={{}}
                  cables={cables}
                  onConfigChange={(instanceId, patch) =>
                    onUpdateProcessor?.(instanceId, { config: patch })
                  }
                  onAddCable={onAddCable}
                  onRemoveCable={onRemoveCable}
                  systemColor={systemKey}
                />
              )}
            </div>
          </div>
        )
      }}
    </RoomShell>
  )
}

// --- TabBar ----------------------------------------------------------------
// Standard ARIA tablist: arrow keys move focus between tabs, Enter/Space
// activates focused tab. role=tab + aria-selected + aria-controls.

function TabBar({ tabs, activeTab, onChange, tr, t, sysColor }) {
  const refs = useRef({})

  const onKeyDown = (e) => {
    const idx = tabs.findIndex(tab => tab.id === activeTab)
    let nextIdx = null
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') nextIdx = 0
    else if (e.key === 'End') nextIdx = tabs.length - 1
    if (nextIdx !== null) {
      e.preventDefault()
      const next = tabs[nextIdx].id
      onChange(next)
      requestAnimationFrame(() => refs.current[next]?.focus())
    }
  }

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      style={{
        display: 'flex',
        borderBottom: `1px solid ${color.border}`,
        background: color.white,
      }}
    >
      {tabs.map(tab => {
        const isActive = tab.id === activeTab
        return (
          <button
            key={tab.id}
            ref={(el) => { if (el) refs.current[tab.id] = el; else delete refs.current[tab.id] }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            style={{
              ...t.mono,
              fontSize: 12,
              padding: '8px 16px',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${isActive ? (sysColor || color.primary) : 'transparent'}`,
              color: isActive ? color.primary : color.muted,
              cursor: 'pointer',
              fontWeight: isActive ? 600 : 400,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {tr(tab.labelKey)}
          </button>
        )
      })}
    </div>
  )
}
