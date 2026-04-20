import { useCallback } from 'react'
import { SQUARE_SIZE, MARGIN, CELL, LAYER_SPACING, SYSTEMS, EXTERNAL_SYSTEMS, ROUNDED_RECT_RADIUS, S2_Y_OFFSET, S2_PANE_X_OFFSET, S2_PANE_SCALE } from '../constants'
import { color } from '../styles'
import { IsoSquare } from './IsoSquare'
import { IsoTriangle, TRI_BOTTOM } from './IsoTriangle'
import { RoundedRectOutline } from './RoundedRectOutline'
import { Connection } from './Connection'

const SYSTEM_KEYS = Object.keys(SYSTEMS)
const SYSTEM_COUNT = SYSTEM_KEYS.length
const s2 = EXTERNAL_SYSTEMS.s2
const S2_PANE_OFFSET_Y = -SQUARE_SIZE / (2 * S2_PANE_SCALE) - TRI_BOTTOM

export function MetaUnit({ x = 0, layer = 0, nodeId, onContextMenu, onDoubleClick, onSystemClick, onHover, dimmed, highlighted, hasS2 = false, isPaneView = false }) {
  const centerY = ((SYSTEM_COUNT - 1) / 2) * CELL
  const rectWidth = SQUARE_SIZE + MARGIN * 2
  const rectHeight = SYSTEM_COUNT * CELL - MARGIN + MARGIN * 2

  const handleContextMenu = useCallback((e) => {
    e.stopPropagation()
    onContextMenu(nodeId, e)
  }, [nodeId, onContextMenu])

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

  const s2Coords = isPaneView
    ? [x + S2_PANE_X_OFFSET, SYSTEMS.s3.yOffset, layer]
    : [x, S2_Y_OFFSET, layer]

  return (
    <group>
      {SYSTEM_KEYS.map((key) => {
        const sys = SYSTEMS[key]
        const handleSystemDoubleClick = onSystemClick ? (e) => {
          e.stopPropagation()
          onSystemClick(nodeId, key)
        } : undefined
        return (
          <IsoSquare
            key={sys.yOffset}
            coords={[x, sys.yOffset, layer]}
            color={sys.color}
            strokeColor={sys.strokeColor}
            onContextMenu={dimmed ? undefined : handleContextMenu}
            onDoubleClick={dimmed ? undefined : (handleSystemDoubleClick || handleDoubleClick)}
            onPointerOver={dimmed ? undefined : handlePointerOver}
            onPointerOut={dimmed ? undefined : handlePointerOut}
            dimmed={dimmed}
            highlighted={highlighted}
          />
        )
      })}
      <group position={[x * CELL, layer * LAYER_SPACING, centerY]} rotation={[-Math.PI / 2, 0, 0]}>
        <RoundedRectOutline width={rectWidth} height={rectHeight} radius={ROUNDED_RECT_RADIUS} color={color.metaUnit} dimmed={dimmed} />
      </group>
      {hasS2 && (
        <group>
          <IsoTriangle
            coords={s2Coords}
            color={s2.color}
            strokeColor={s2.strokeColor}
            scale={isPaneView ? S2_PANE_SCALE : 1}
            offsetY={isPaneView ? S2_PANE_OFFSET_Y : 0}
            onDoubleClick={isPaneView && onSystemClick ? (e) => { e.stopPropagation(); onSystemClick(nodeId, 's2') } : undefined}
            onPointerOver={dimmed ? undefined : handlePointerOver}
            onPointerOut={dimmed ? undefined : handlePointerOut}
            dimmed={dimmed}
          />
          <Connection
            from={[x, SYSTEMS.s3.yOffset, layer]}
            to={s2Coords}
            color={isPaneView ? color.metaUnit : s2.strokeColor}
            dimmed={dimmed}
            style="elbow"
          />
        </group>
      )}
    </group>
  )
}
