import { useEffect, createElement } from 'react'
import { ArrowLeft } from 'lucide-react'
import { color, type, ui } from '../styles'
import { useA11yType } from '../hooks/useA11yType'
import { useTranslation } from '../i18n/index.jsx'
import { useBus } from '../signals/BusContext.jsx'
import { useSignalLog } from '../signals/useSignalLog'
import { getProcessorDef } from '../signals/library'
import { eventsChannel } from '../signals/bus'
import { SignalFeed } from './room/SignalFeed'
import { getProcessorView } from './processors/registry'

// Detail views (per-defId in components/processors/registry) render the
// configurable surface; processors without one fall back to a JSON read-only
// view. Edits flow through onUpdateInstance → agentAPI.updateProcessorConfig.

function ConfigSurface({ instance, def, onUpdateInstance, t }) {
  const View = getProcessorView(instance.defId)
  if (View) {
    return createElement(View, {
      config: instance.config || def.defaultConfig || {},
      onChange: (patch) => onUpdateInstance?.({ config: patch }),
    })
  }
  return (
    <pre style={{ ...t.mono, background: color.hoverBg, padding: 12, margin: 0, overflow: 'auto' }}>
      {JSON.stringify(instance.config, null, 2) || '{}'}
    </pre>
  )
}

// Drill-in view for compound (sub-patched) processors. Read-only structural
// inspection of the subRack: which inner instances exist, how they're
// cabled, and how the outer ports / config bind to them.
//
// Future: full live-rack render with running inner panels, cables, and
// per-inner signal feeds. Tracked in DEBT.md.
function CompoundInspector({ def, t }) {
  const sr = def.subRack
  if (!sr) return null
  const innerDefName = (defId) => getProcessorDef(defId)?.name || defId

  const Row = ({ label, value }) => (
    <div style={{ display: 'flex', gap: 8, padding: '4px 0', alignItems: 'baseline' }}>
      <span style={{ ...t.label, minWidth: 96, color: color.muted }}>{label}</span>
      <span style={{ ...t.mono, color: color.primary, flex: 1 }}>{value}</span>
    </div>
  )

  const portOf = (instId, portId) => {
    const innerDef = sr.instances.find(i => i.id === instId)
    const name = innerDef ? innerDefName(innerDef.defId) : instId
    return `${name}.${portId}`
  }

  return (
    <section style={{ marginTop: 24 }}>
      <h3 style={{ ...type.label, margin: 0, marginBottom: 12 }}>Composition</h3>
      <p style={{ ...t.body, fontSize: 12, color: color.muted, marginTop: 0, marginBottom: 12 }}>
        Sub-patched processor — composed of {sr.instances?.length || 0} inner instance{(sr.instances?.length || 0) === 1 ? '' : 's'}.
      </p>

      <div style={{ marginBottom: 16 }}>
        <h4 style={{ ...type.label, margin: 0, marginBottom: 6, fontSize: 10 }}>Inner instances</h4>
        {(sr.instances || []).map(inst => (
          <Row key={inst.id} label={inst.id} value={innerDefName(inst.defId)} />
        ))}
      </div>

      {(sr.cables || []).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ ...type.label, margin: 0, marginBottom: 6, fontSize: 10 }}>Inner cables</h4>
          {sr.cables.map((c, i) => (
            <Row
              key={i}
              label="cable"
              value={`${portOf(c.source.instanceId, c.source.portId)} → ${portOf(c.target.instanceId, c.target.portId)}`}
            />
          ))}
        </div>
      )}

      {Object.keys(sr.inputBindings || {}).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ ...type.label, margin: 0, marginBottom: 6, fontSize: 10 }}>Input bindings</h4>
          {Object.entries(sr.inputBindings).map(([outerPort, b]) => (
            <Row key={outerPort} label={outerPort} value={`→ ${portOf(b.instanceId, b.portId)}`} />
          ))}
        </div>
      )}

      {Object.keys(sr.outputBindings || {}).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ ...type.label, margin: 0, marginBottom: 6, fontSize: 10 }}>Output bindings</h4>
          {Object.entries(sr.outputBindings).map(([outerPort, b]) => (
            <Row key={outerPort} label={outerPort} value={`← ${portOf(b.instanceId, b.portId)}`} />
          ))}
        </div>
      )}

      {Object.keys(sr.paramBindings || {}).length > 0 && (
        <div>
          <h4 style={{ ...type.label, margin: 0, marginBottom: 6, fontSize: 10 }}>Parameter bindings</h4>
          {Object.entries(sr.paramBindings).map(([outerKey, b]) => (
            <Row
              key={outerKey}
              label={outerKey}
              value={`→ ${portOf(b.instanceId, '').slice(0, -1)}.config.${b.configKey}`}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export function ProcessorPage({ instance, nodeId, nodeName, systemKey, onBack, onUpdateInstance }) {
  const t = useA11yType()
  const { t: tr } = useTranslation()
  const bus = useBus()

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

  const def = getProcessorDef(instance.defId)
  const eventLog = useSignalLog(bus, eventsChannel(instance.id))
  const unitLabel = nodeName || `${tr('nav.unit')} ${nodeId?.slice(0, 5)}`

  if (!def) {
    return (
      <div style={{ padding: 40 }}>
        <p style={t.mono}>Unknown processor: {instance.defId}</p>
        <button onClick={onBack} style={ui.button}>{tr('nav.esc')}</button>
      </div>
    )
  }

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: color.white, overflow: 'hidden', position: 'relative',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '24px 32px',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        borderBottom: `1px solid ${color.borderLight}`,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <button
            onClick={onBack}
            style={{
              ...t.mono, color: color.secondary,
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 0, marginBottom: 8,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <ArrowLeft size={14} strokeWidth={1.5} />
            {unitLabel} · {systemKey.toUpperCase()}
          </button>
          <h1 style={{ ...type.title, margin: 0 }}>{def.name}</h1>
          <p style={{ ...type.body, margin: '4px 0 0', maxWidth: 720 }}>{def.description}</p>
        </div>
        <button onClick={onBack} style={ui.button}>{tr('nav.esc')}</button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{
          width: 320, flexShrink: 0,
          padding: '24px 32px',
          borderRight: `1px solid ${color.borderLight}`,
          overflow: 'auto',
        }}>
          <section>
            <h3 style={{ ...type.label, margin: 0, marginBottom: 12 }}>{tr('systemPage.configuration')}</h3>
            <ConfigSurface instance={instance} def={def} onUpdateInstance={onUpdateInstance} t={t} />
          </section>
          {def.subRack && <CompoundInspector def={def} t={t} />}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <h3 style={{ ...type.label, margin: 0, padding: '24px 32px 0' }}>{tr('systemPage.liveLog')}</h3>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <SignalFeed signals={eventLog} />
          </div>
        </div>
      </div>
    </div>
  )
}
