import { useMemo } from 'react'
import { type, FONT_DYSLEXIA } from '../styles'
import { FONT_VISIBILITY_SCALE, FONT_VISIBILITY_WEIGHT_BOOST } from '../constants'
import { useAccessibility } from '../accessibility'

// Returns a modified copy of the type tokens with accessibility overrides applied.
export function useA11yType() {
  const { fontVisibility, dyslexia } = useAccessibility()

  return useMemo(() => {
    if (fontVisibility === 0 && !dyslexia) return type

    const modified = {}
    for (const [key, style] of Object.entries(type)) {
      const s = { ...style }

      if (dyslexia) {
        s.fontFamily = FONT_DYSLEXIA
      }

      if (fontVisibility > 0) {
        if (s.fontSize) {
          const base = parseFloat(s.fontSize)
          s.fontSize = `${base * (1 + fontVisibility * FONT_VISIBILITY_SCALE)}px`
        }
        if (s.fontWeight) {
          s.fontWeight = Math.min(s.fontWeight + Math.round(fontVisibility * FONT_VISIBILITY_WEIGHT_BOOST), 900)
        }
      }

      modified[key] = s
    }
    return modified
  }, [fontVisibility, dyslexia])
}
