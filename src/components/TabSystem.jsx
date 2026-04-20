import { useState, useEffect, useCallback } from 'react'
import { Eye, EyeOff, Filter, FolderTree, Wrench, Settings, X } from 'lucide-react'
import { color } from '../styles'
import { Z_INDEX } from '../constants'
import { useAccessibility } from '../accessibility'
import { useA11yType } from '../hooks/useA11yType'

const MIN_WIDTH = 240
const DEFAULT_WIDTH = 300
const FILTER_HEIGHT = 48
const ICON_SIZE = 16
const ICON_STROKE = 1.5

const SIDE_TABS = [
  { key: 'S', label: 'Settings', icon: Settings },
  { key: 'E', label: 'Explorer', icon: FolderTree },
  { key: 'T', label: 'Tools', icon: Wrench },
]

function KeyLabel({ children }) {
  const text = String(children)
  const first = text[0]
  const rest = text.slice(1)
  return (
    <span>
      <span style={{ textDecoration: 'underline' }}>{first}</span>{rest}
    </span>
  )
}

function FilterBar({ open, onClose, t }) {
  if (!open) return null
  return (
    <div style={{
      position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)',
      height: FILTER_HEIGHT,
      zIndex: Z_INDEX.hud,
      background: 'rgba(255,255,255,0.95)',
      backdropFilter: 'blur(8px)',
      border: `1px solid ${color.border}`,
      borderRadius: 6,
      display: 'flex', alignItems: 'center',
      padding: '0 16px',
      gap: 16,
    }}>
      <Filter size={ICON_SIZE} strokeWidth={ICON_STROKE} color={color.primary} style={{ marginRight: 4 }} />
      {[
        { label: 'S5', color: color.s5.fill },
        { label: 'S4', color: color.s4.fill },
        { label: 'S3', color: color.s3.fill },
        { label: 'S2', color: color.s2.fill },
        { label: 'S1', color: color.s1.fill },
      ].map((sys) => (
        <label key={sys.label} style={{
          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          ...t.mono, color: color.primary,
        }}>
          <span style={{
            width: 14, height: 14,
            border: `2px solid ${sys.color}`,
            borderRadius: 2,
            background: sys.color,
            opacity: 0.6,
          }} />
          {sys.label}
        </label>
      ))}
      <button
        onClick={onClose}
        style={{
          color: color.muted,
          background: 'none', border: 'none', cursor: 'pointer',
          marginLeft: 8, display: 'flex', alignItems: 'center',
        }}
      ><X size={14} strokeWidth={ICON_STROKE} /></button>
    </div>
  )
}

function Toggle({ label, value, onChange, t }) {
  return (
    <button
      onClick={onChange}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '8px 0',
        background: 'none', border: 'none', cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={{ ...t.mono, color: color.primary }}>{label}</span>
      <span style={{
        width: 32, height: 16, borderRadius: 8,
        background: value ? color.primary : color.border,
        position: 'relative',
        transition: 'background 0.15s',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: value ? 16 : 2,
          width: 12, height: 12, borderRadius: 6,
          background: color.white,
          transition: 'left 0.15s',
        }} />
      </span>
    </button>
  )
}

function Slider({ label, value, onChange, min = 0, max = 1, step = 0.1, t }) {
  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ ...t.mono, color: color.primary }}>{label}</span>
        <span style={{ ...t.mono, color: color.muted }}>{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: color.primary }}
      />
    </div>
  )
}

function SettingsContent({ t }) {
  const { epilepsy, toggleEpilepsy, fontVisibility, setFontVisibility, dyslexia, toggleDyslexia } = useAccessibility()
  return (
    <div style={{ padding: '16px' }}>
      <div style={{ marginBottom: 20 }}>
        <p style={{ ...t.label, margin: '0 0 8px' }}>ACCESSIBILITY</p>
        <Toggle label="Epilepsy mode" value={epilepsy} onChange={toggleEpilepsy} t={t} />
        <div style={{ borderTop: `1px solid ${color.borderLight}` }}>
          <Slider label="Font visibility" value={fontVisibility} onChange={setFontVisibility} t={t} />
        </div>
        <div style={{ borderTop: `1px solid ${color.borderLight}` }}>
          <Toggle label="Dyslexia font" value={dyslexia} onChange={toggleDyslexia} t={t} />
        </div>
        <div style={{ borderTop: `1px solid ${color.borderLight}` }}>
          <Toggle label="Screen reader mode" value={false} onChange={() => {}} t={t} />
        </div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <p style={{ ...t.label, margin: '0 0 8px' }}>DISPLAY</p>
        <p style={{ ...t.mono, color: color.muted, margin: 0 }}>Not yet implemented</p>
      </div>
      <div>
        <p style={{ ...t.label, margin: '0 0 8px' }}>ACCOUNT</p>
        <p style={{ ...t.mono, color: color.muted, margin: 0 }}>Not yet implemented</p>
      </div>
    </div>
  )
}

function StubContent({ sections, t }) {
  return (
    <div style={{ padding: '16px' }}>
      {sections.map((s, i) => (
        <div key={i} style={{ marginBottom: 20 }}>
          <p style={{ ...t.label, margin: '0 0 8px' }}>{s.toUpperCase()}</p>
          <p style={{ ...t.mono, color: color.muted, margin: 0 }}>Not yet implemented</p>
        </div>
      ))}
    </div>
  )
}

function PanelContent({ tabKey, t }) {
  if (tabKey === 'S') return <SettingsContent t={t} />
  const stubs = {
    E: ['Tree'],
    T: ['Node', 'Listen', 'Users'],
  }
  return <StubContent sections={stubs[tabKey] || []} t={t} />
}

export function TabSystem({ visible = true, onPanelWidthChange }) {
  const t = useA11yType()
  const [activeTab, setActiveTab] = useState(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH)
  const [resizing, setResizing] = useState(false)
  const [tabsHidden, setTabsHidden] = useState(false)

  const toggleSide = useCallback((key) => {
    setActiveTab(prev => {
      const next = prev === key ? null : key
      onPanelWidthChange?.(next ? panelWidth : 0)
      return next
    })
  }, [panelWidth, onPanelWidthChange])

  useEffect(() => {
    if (!visible) return
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (tabsHidden) return
      if (e.key === 'Escape') {
        if (activeTab) { toggleSide(activeTab); e.stopImmediatePropagation(); return }
        if (filterOpen) { setFilterOpen(false); e.stopImmediatePropagation(); return }
        return
      }
      const upper = e.key.toUpperCase()
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
  }, [visible, toggleSide, tabsHidden, activeTab, filterOpen])

  useEffect(() => {
    if (!resizing) return
    const handleMove = (e) => {
      const newWidth = window.innerWidth - e.clientX
      const w = Math.max(MIN_WIDTH, Math.min(newWidth, window.innerWidth * 0.5))
      setPanelWidth(w)
      onPanelWidthChange?.(w)
    }
    const handleUp = () => setResizing(false)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [resizing])

  if (!visible) return null

  return (
    <>
      {/* Eye toggle — hidden when a panel is open */}
      {!activeTab && !filterOpen && (
        <button
          onClick={() => { setTabsHidden(h => { if (!h) { setActiveTab(null); setFilterOpen(false); onPanelWidthChange?.(0) } return !h }) }}
          style={{
            position: 'fixed', top: 8, right: 8, zIndex: Z_INDEX.hud + 1,
            color: tabsHidden ? color.muted : color.primary,
            background: 'none', border: 'none',
            cursor: 'pointer', padding: '4px 8px',
            opacity: 0.4,
            transition: 'opacity 0.15s',
            display: 'flex', alignItems: 'center',
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
          onMouseLeave={(e) => e.currentTarget.style.opacity = 0.4}
        >
          {tabsHidden
            ? <EyeOff size={ICON_SIZE} strokeWidth={ICON_STROKE} />
            : <Eye size={ICON_SIZE} strokeWidth={ICON_STROKE} />
          }
        </button>
      )}

      {/* Filter bar (top) */}
      {!tabsHidden && (
        <>
          {!filterOpen && (
            <button
              onClick={() => setFilterOpen(true)}
              style={{
                position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)',
                zIndex: Z_INDEX.hud,
                color: color.muted,
                background: 'none', border: 'none',
                cursor: 'pointer', padding: '4px 8px',
                opacity: 0.5,
                transition: 'opacity 0.15s',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
              onMouseLeave={(e) => e.currentTarget.style.opacity = 0.5}
            >
              <Filter size={ICON_SIZE} strokeWidth={ICON_STROKE} />
              <span style={t.monoBold}><KeyLabel>Filter</KeyLabel></span>
            </button>
          )}
          <FilterBar open={filterOpen} onClose={() => setFilterOpen(false)} t={t} />
        </>
      )}

      {/* Side tab buttons */}
      {!tabsHidden && (
        <div style={{
          position: 'fixed',
          top: filterOpen ? FILTER_HEIGHT + 8 : 32,
          right: activeTab ? panelWidth : 0,
          zIndex: Z_INDEX.hud,
          display: 'flex', flexDirection: 'column',
          transition: activeTab ? 'none' : 'right 0.2s ease',
        }}>
          {SIDE_TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => toggleSide(tab.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  ...t.monoBold,
                  color: isActive ? color.primary : color.muted,
                  background: isActive ? 'rgba(255,255,255,0.95)' : 'none',
                  border: 'none',
                  borderLeft: `2px solid ${isActive ? color.primary : 'transparent'}`,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'color 0.15s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = color.secondary }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = isActive ? color.primary : color.muted }}
              >
                <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                <KeyLabel>{tab.label}</KeyLabel>
              </button>
            )
          })}
        </div>
      )}

      {/* Side panel */}
      {activeTab && !tabsHidden && (
        <div style={{
          position: 'fixed',
          top: filterOpen ? FILTER_HEIGHT : 0,
          right: 0, bottom: 0,
          width: panelWidth,
          zIndex: Z_INDEX.hud,
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(8px)',
          borderLeft: `1px solid ${color.border}`,
          display: 'flex', flexDirection: 'column',
        }}>
          <div
            onMouseDown={() => setResizing(true)}
            style={{
              position: 'absolute', left: -3, top: 0, bottom: 0, width: 6,
              cursor: 'col-resize', zIndex: 1,
            }}
          />
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${color.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {(() => { const Icon = SIDE_TABS.find(s => s.key === activeTab)?.icon; return Icon ? <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} /> : null })()}
              <span style={t.h3}>{SIDE_TABS.find(s => s.key === activeTab)?.label}</span>
            </div>
            <button
              onClick={() => toggleSide(activeTab)}
              style={{
                color: color.muted,
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center',
              }}
            ><X size={14} strokeWidth={ICON_STROKE} /></button>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <PanelContent tabKey={activeTab} t={t} />
          </div>
        </div>
      )}
    </>
  )
}
