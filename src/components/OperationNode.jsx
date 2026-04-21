import { useCallback, useMemo } from 'react'
import { Line } from '@react-three/drei'
import { EXTERNAL_SYSTEMS, SYSTEMS, ELLIPSE_RADIUS, toWorld } from '../constants'
import { color as styleColor } from '../styles'
import { IsoEllipse } from './IsoEllipse'

const s1 = EXTERNAL_SYSTEMS.s1
const FOCUS_RING_RADIUS = ELLIPSE_RADIUS + 0.06
const FOCUS_SEGMENTS = 32

export function OperationNode({ x = 0, layer = 0, nodeId, onDoubleClick, onSystemClick, onHover, dimmed, highlighted, keySelected, keySelectedSystem, isPaneView = false, visibleSystems = {} }) {
  const handleDoubleClick = useCallback((e) => {
    e.stopPropagation()
    onDoubleClick(nodeId)
  }, [nodeId, onDoubleClick])

  const handlePointerOver = useCallback((e) => {
    e.stopPropagation()
    onHover(nodeId)
  }, [nodeId, onHover])

  const handlePointerOut = useCallback((e) => {
    e.stopPropagation()
    onHover(null)
  }, [onHover])

  const handleS1DoubleClick = isPaneView && onSystemClick ? (e) => {
    e.stopPropagation()
    onSystemClick(nodeId, 's1')
  } : (dimmed ? undefined : handleDoubleClick)

  const focusRingPoints = useMemo(() => {
    const pts = []
    for (let i = 0; i <= FOCUS_SEGMENTS; i++) {
      const a = (i / FOCUS_SEGMENTS) * Math.PI * 2
      pts.push([Math.cos(a) * FOCUS_RING_RADIUS, Math.sin(a) * FOCUS_RING_RADIUS, 0])
    }
    return pts
  }, [])

  const pos = toWorld(x, SYSTEMS.s3.yOffset, layer)

  return (
    <group>
      {visibleSystems.s1 !== false && (
        <IsoEllipse
          coords={[x, SYSTEMS.s3.yOffset, layer]}
          color={s1.color}
          strokeColor={s1.strokeColor}
          onDoubleClick={dimmed ? undefined : handleS1DoubleClick}
          onPointerOver={dimmed ? undefined : handlePointerOver}
          onPointerOut={dimmed ? undefined : handlePointerOut}
          dimmed={dimmed}
          highlighted={highlighted}
        />
      )}
      {(keySelected || keySelectedSystem === 's1') && visibleSystems.s1 !== false && (
        <group position={pos} rotation={[-Math.PI / 2, 0, 0]}>
          <Line points={focusRingPoints} color={styleColor.focus} lineWidth={2} />
        </group>
      )}
    </group>
  )
}
