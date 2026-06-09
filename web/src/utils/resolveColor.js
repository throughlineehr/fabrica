import { color } from '../styles'

export function resolveColor(colorKey) {
  if (colorKey === 'audit') return color.audit
  if (colorKey === 'algedonic') return color.algedonic
  return color[colorKey] || { fill: color.muted, stroke: color.muted }
}
