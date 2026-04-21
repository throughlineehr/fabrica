import { color } from '../../styles'

export function Instructions({ mode, t, tr }) {
  const hints = {
    default: [
      tr('instructions.hoverToInspect'),
      tr('instructions.arrowKeysNavigate'),
      tr('instructions.enterToActivate'),
      tr('instructions.mForMenu'),
      tr('instructions.scrollToZoom'),
      tr('instructions.dragToOrbit'),
    ],
    hovered: [
      tr('instructions.doubleClickFocus'),
      tr('instructions.arrowKeysNavigate'),
      tr('instructions.mForMenu'),
      tr('instructions.rightClickActions'),
    ],
    focused: [
      tr('instructions.doubleClickDetail'),
      tr('instructions.doubleClickEmpty'),
      tr('instructions.arrowKeysNavigate'),
      tr('instructions.mForMenu'),
      tr('instructions.rightClickActions'),
    ],
    pane: [
      tr('instructions.doubleClickSystem'),
      tr('instructions.doubleClickEmpty'),
      tr('instructions.arrowKeysNavigate'),
    ],
  }

  const lines = hints[mode] || hints.default

  return (
    <div>
      {lines.map((line, i) => (
        <p key={i} style={{ ...t.mono, color: color.muted, margin: '0 0 2px', textAlign: 'end' }}>{line}</p>
      ))}
    </div>
  )
}
