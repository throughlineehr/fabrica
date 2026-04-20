import { useCallback } from 'react'
import { EXTERNAL_SYSTEMS, SYSTEMS } from '../constants'
import { IsoEllipse } from './IsoEllipse'

const s1 = EXTERNAL_SYSTEMS.s1

export function OperationNode({ x = 0, layer = 0, nodeId, onDoubleClick, onSystemClick, onHover, dimmed, isPaneView = false }) {
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

  return (
    <IsoEllipse
      coords={[x, SYSTEMS.s3.yOffset, layer]}
      color={s1.color}
      strokeColor={s1.strokeColor}
      onDoubleClick={dimmed ? undefined : handleS1DoubleClick}
      onPointerOver={dimmed ? undefined : handlePointerOver}
      onPointerOut={dimmed ? undefined : handlePointerOut}
      dimmed={dimmed}
    />
  )
}
