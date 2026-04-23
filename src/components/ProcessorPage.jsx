import { useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { color, type, ui } from '../styles'
import { useA11yType } from '../hooks/useA11yType'
import { useTranslation } from '../i18n/index.jsx'
import { useBus } from '../signals/BusContext.jsx'
import { useSignalLog } from '../signals/useSignalLog'
import { getProcessorDef } from '../signals/library'
import { eventsChannel } from '../signals/bus'
import { SignalFeed } from './room/SignalFeed'

// The processor page is a live-state view, not a config surface.
// All wiring/filtering lives in the switchboard row. This page shows the
// processor's description, its operational config (read-only for now), and
// the live log of signals it has handled.

export function ProcessorPage({ instance, nodeId, nodeName, systemKey, onBack }) {
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
            <h3 style={{ ...type.label, margin: 0, marginBottom: 8 }}>{tr('systemPage.configuration')}</h3>
            <pre style={{ ...t.mono, background: color.hoverBg, padding: 12, margin: 0, overflow: 'auto' }}>
              {JSON.stringify(instance.config, null, 2) || '{}'}
            </pre>
          </section>
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
