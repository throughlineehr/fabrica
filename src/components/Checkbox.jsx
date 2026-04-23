import { color as colorTokens, ui } from '../styles'
import { useA11yType } from '../hooks/useA11yType'
import { useAccessibility } from '../accessibility'

// Reusable checkbox. Hidden native <input> handles keyboard/AT; visible
// square carries the state. Token values come from styles.js → ui.checkbox.
//
// Props:
//   checked, onChange(next: boolean) — controlled state
//   label               — shown to the right. Optional.
//   srLabel             — screen-reader-only override when the visible label is terse (e.g. "M")
//   fillColor           — fill when checked. Defaults to primary.
//   strokeColor         — border when unchecked. Defaults to border.
//   pattern             — optional CSS background-image (for colorBlind + system variant)
//   disabled

export function Checkbox({
  checked, onChange, label, srLabel,
  fillColor = colorTokens.primary,
  strokeColor = colorTokens.border,
  pattern = null,
  disabled = false,
}) {
  const t = useA11yType()
  const { colorBlind } = useAccessibility()
  const size = colorBlind ? ui.checkbox.sizeColorBlind : ui.checkbox.size

  return (
    <label style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.4 : 1,
      ...(checked ? t.monoActive : t.monoMuted),
    }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => { e.stopPropagation(); onChange?.(e.target.checked) }}
        aria-label={srLabel || label}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
      />
      <span aria-hidden="true" style={{
        width: size, height: size,
        border: `${ui.checkbox.borderWidth}px solid ${checked ? fillColor : strokeColor}`,
        borderRadius: ui.checkbox.borderRadius,
        background: checked ? (pattern || fillColor) : 'transparent',
        backgroundSize: colorBlind && pattern ? '8px 8px' : undefined,
        opacity: checked ? ui.checkbox.opacityChecked : ui.checkbox.opacityUnchecked,
        flexShrink: 0,
        transition: 'opacity 0.1s, background 0.1s',
      }} />
      {label != null && <span>{label}</span>}
    </label>
  )
}
