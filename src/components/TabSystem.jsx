import { useState, useEffect, useCallback, useRef } from 'react'
import { Eye, EyeOff, Filter, FolderTree, Wrench, Settings, X } from 'lucide-react'
import { color, sizes, panel } from '../styles'
import { Z_INDEX } from '../constants'
import { useAccessibility } from '../accessibility'
import { useA11yType } from '../hooks/useA11yType'
import { useTranslation } from '../i18n/index.jsx'
import { ExplorerTree } from './ExplorerTree'
import { Keycap } from './Keycap'
import { SettingsPanel } from './tabs/SettingsPanel'
import { FilterBar, FILTER_HEIGHT } from './tabs/FilterBar'

const PANEL_Z = Z_INDEX.panel

const SIDE_TABS = [
  { key: 'S', labelKey: 'tabs.settings', icon: Settings },
  { key: 'E', labelKey: 'tabs.explorer', icon: FolderTree },
  { key: 'T', labelKey: 'tabs.tools', icon: Wrench },
]

function KeyLabel({ children, shortcut }) {
  return <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}><span style={{ flex: 1 }}>{children}</span><Keycap>{shortcut}</Keycap></span>
}

function StubContent({ sections, t, tr }) {
  return (
    <div style={{ padding: '16px' }}>
      {sections.map((s, i) => (
        <div key={i} style={{ marginBottom: 20 }}>
          <p style={{ ...t.label, margin: '0 0 8px' }}>{s.toUpperCase()}</p>
          <p style={{ ...t.monoMuted, margin: 0 }}>{tr('settings.notImplemented')}</p>
        </div>
      ))}
    </div>
  )
}

function PanelContent({ tabKey, t, tr, tree, selectedId, paneId, focusedId, onNodeSelect, onNodeActivate, onAddNode, onBack, onAnnounce }) {
  if (tabKey === 'S') return <SettingsPanel t={t} tr={tr} />
  if (tabKey === 'E' && tree) return (
    <ExplorerTree tree={tree} selectedId={selectedId} paneId={paneId} focusedId={focusedId}
      onSelect={onNodeSelect} onActivate={onNodeActivate} onAddNode={onAddNode} onBack={onBack} onAnnounce={onAnnounce} />
  )
  return <StubContent sections={tabKey === 'T' ? ['Node', 'Listen', 'Users'] : []} t={t} tr={tr} />
}

export function TabSystem({ visible = true, onPanelWidthChange, tree, selectedId, paneId, focusedId, onNodeSelect, onNodeActivate, onAddNode, onBack, onAnnounce, onExplorerClose, visibleSystems, onToggleSystem, requestOpenExplorer = false }) {
  const t = useA11yType()
  const { t: tr } = useTranslation()
  const [activeTab, setActiveTab] = useState(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [panelWidth, setPanelWidth] = useState(sizes.panelDefaultWidth)
  const [resizing, setResizing] = useState(false)
  const [tabsHidden, setTabsHidden] = useState(false)

  // Open Explorer when requested externally
  // Only open explorer on rising edge of requestOpenExplorer
  const prevRequested = useRef(false)
  useEffect(() => {
    if (requestOpenExplorer && !prevRequested.current && activeTab !== 'E' && !tabsHidden) {
      setActiveTab('E')
      onPanelWidthChange?.(panelWidth)
    }
    prevRequested.current = requestOpenExplorer
  }, [requestOpenExplorer])

  const toggleSide = useCallback((key) => {
    setActiveTab(prev => {
      const next = prev === key ? null : key
      onPanelWidthChange?.(next ? panelWidth : 0)
      if (prev === 'E' && next !== 'E') onExplorerClose?.()
      return next
    })
  }, [panelWidth, onPanelWidthChange, onExplorerClose])

  // Global keyboard shortcuts (capture phase)
  useEffect(() => {
    if (!visible) return
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (tabsHidden) return
      // Don't intercept navigation keys inside the Explorer tree — but still handle tab-switching keys
      const upper = e.key.toUpperCase()
      const isTabKey = upper === 'F' || SIDE_TABS.some(s => s.key === upper)
      if (e.target.closest('[role="tree"]') && e.key !== 'Escape' && !isTabKey) return

      if (e.key === 'Escape') {
        // If in Explorer with back state, let it through
        if (activeTab === 'E' && (paneId != null || focusedId != null) && e.target.closest('[role="tree"]')) return
        if (activeTab) { toggleSide(activeTab); e.stopImmediatePropagation(); return }
        if (filterOpen) { setFilterOpen(false); e.stopImmediatePropagation(); return }
        return
      }

      if (upper === 'F') {
        e.preventDefault()
        setFilterOpen(prev => !prev)
      } else {
        const tab = SIDE_TABS.find(s => s.key === upper)
        if (tab) {
          e.preventDefault()
          toggleSide(tab.key)
        }
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [visible, toggleSide, tabsHidden, activeTab, filterOpen, paneId, focusedId])

  // Resize handling
  useEffect(() => {
    if (!resizing) return
    const handleMove = (e) => {
      const w = Math.max(sizes.panelMinWidth, Math.min(window.innerWidth - e.clientX, window.innerWidth * 0.5))
      setPanelWidth(w)
      onPanelWidthChange?.(w)
    }
    const handleUp = () => setResizing(false)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp) }
  }, [resizing])

  if (!visible) return null

  return (
    <>
      {/* Eye toggle */}
      {!activeTab && !filterOpen && (
        <button
          onClick={() => setTabsHidden(h => { if (!h) { setActiveTab(null); setFilterOpen(false); onPanelWidthChange?.(0) } return !h })}
          style={{
            position: 'fixed', top: 8, right: 8, zIndex: PANEL_Z + 1,
            color: tabsHidden ? color.muted : color.primary,
            background: 'none', border: 'none',
            cursor: 'pointer', padding: '4px 8px',
            transition: 'color 0.15s',
            display: 'flex', alignItems: 'center',
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = color.primary}
          onMouseLeave={(e) => e.currentTarget.style.color = tabsHidden ? color.muted : color.primary}
        >
          {tabsHidden ? <EyeOff size={sizes.iconSize} strokeWidth={sizes.iconStroke} /> : <Eye size={sizes.iconSize} strokeWidth={sizes.iconStroke} />}
        </button>
      )}

      {/* Filter */}
      {!tabsHidden && (
        <>
          {!filterOpen && (
            <button
              onClick={() => setFilterOpen(true)}
              style={{
                position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)',
                zIndex: PANEL_Z, color: color.muted,
                background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
                transition: 'color 0.15s',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = color.primary}
              onMouseLeave={(e) => e.currentTarget.style.color = color.muted}
            >
              <Filter size={sizes.iconSize} strokeWidth={sizes.iconStroke} />
              <span style={t.monoBold}><KeyLabel shortcut="F">{tr('tabs.filter')}</KeyLabel></span>
            </button>
          )}
          <FilterBar open={filterOpen} onClose={() => setFilterOpen(false)} t={t} tr={tr} visibleSystems={visibleSystems} onToggleSystem={onToggleSystem} />
        </>
      )}

      {/* Tab buttons */}
      {!tabsHidden && (
        <div style={{
          position: 'fixed',
          top: filterOpen ? FILTER_HEIGHT + 8 : 32,
          right: activeTab ? panelWidth : 0,
          zIndex: PANEL_Z,
          display: 'flex', flexDirection: 'column',
          transition: activeTab ? 'none' : 'right 0.2s ease',
        }}>
          {SIDE_TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                aria-pressed={isActive}
                aria-label={tr(tab.labelKey)}
                onClick={() => toggleSide(tab.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  ...t.monoBold,
                  color: isActive ? color.primary : color.muted,
                  background: isActive ? panel.background : 'none',
                  border: 'none',
                  borderLeft: `2px solid ${isActive ? color.primary : 'transparent'}`,
                  padding: '8px 12px', minHeight: sizes.targetDefault,
                  width: '100%',
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'color 0.15s', whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = color.secondary }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = color.muted }}
              >
                <Icon size={sizes.iconSize} strokeWidth={sizes.iconStroke} />
                <KeyLabel shortcut={tab.key}>{tr(tab.labelKey)}</KeyLabel>
              </button>
            )
          })}
        </div>
      )}

      {/* Panel */}
      {activeTab && !tabsHidden && (
        <div style={{
          position: 'fixed',
          top: filterOpen ? FILTER_HEIGHT : 0,
          right: 0, bottom: 0,
          width: panelWidth,
          zIndex: PANEL_Z,
          background: panel.background,
          backdropFilter: panel.backdropFilter,
          borderLeft: `1px solid ${color.border}`,
          display: 'flex', flexDirection: 'column',
        }}>
          <div onMouseDown={() => setResizing(true)}
            style={{ position: 'absolute', left: -3, top: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 1 }} />
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${color.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {(() => { const Icon = SIDE_TABS.find(s => s.key === activeTab)?.icon; return Icon ? <Icon size={sizes.iconSize} strokeWidth={sizes.iconStroke} /> : null })()}
              <h2 style={{ ...t.h3, margin: 0 }}>{tr(SIDE_TABS.find(s => s.key === activeTab)?.labelKey)}</h2>
            </div>
            <button onClick={() => toggleSide(activeTab)}
              style={{ color: color.muted, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <X size={14} strokeWidth={sizes.iconStroke} />
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <PanelContent tabKey={activeTab} t={t} tr={tr} tree={tree} selectedId={selectedId}
              paneId={paneId} focusedId={focusedId}
              onNodeSelect={onNodeSelect} onNodeActivate={onNodeActivate}
              onAddNode={onAddNode} onBack={onBack} onAnnounce={onAnnounce} />
          </div>
        </div>
      )}
    </>
  )
}
