import { OPACITY } from '../constants'
import { useAccessibility } from '../accessibility'

// Returns [fillOpacity, strokeOpacity] based on dimmed/highlighted state and epilepsy mode
export function useNodeOpacity(dimmed, highlighted) {
  const { epilepsy } = useAccessibility()

  if (epilepsy) {
    // Nothing dims. Highlighted item brightens.
    return [
      highlighted ? OPACITY.fillHighlighted : OPACITY.fillNormal,
      highlighted ? OPACITY.strokeHighlighted : OPACITY.strokeNormal,
    ]
  }

  return [
    dimmed ? OPACITY.fillDimmed : OPACITY.fillNormal,
    dimmed ? OPACITY.strokeDimmed : OPACITY.strokeNormal,
  ]
}
