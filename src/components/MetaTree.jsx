import { SYSTEMS, EXTERNAL_SYSTEMS, S2_Y_OFFSET } from '../constants'
import { containsNode, nodeHasS2 } from '../tree/index'
import { useAccessibility } from '../accessibility'
import { MetaUnit } from './MetaUnit'
import { OperationNode } from './OperationNode'
import { Connection } from './Connection'

export function MetaTree({ node, onContextMenu, onDoubleClick, onSystemClick, onHover, highlightId, keySelectedId, keySelectedSystem, paneId, connectionStyle = 'straight' }) {
  const isPane = paneId != null
  const isPaneTarget = paneId === node.id
  const onPanePath = isPane && containsNode(node, paneId)
  const { epilepsy } = useAccessibility()
  const dimmed = !epilepsy && !isPane && highlightId != null && highlightId !== node.id
  const isOperation = node.type === 'operation'
  const directOperation = node.children.find(c => c.type === 'operation')
  const hasS2 = !isOperation && nodeHasS2(node)
  const highlighted = highlightId != null && highlightId === node.id
  const keySelected = keySelectedId === node.id

  // Children that have their own S2s (management with S2s, NOT direct operations — those share parent's S2)
  const s2Children = node.children.filter(c => c.type !== 'operation' && nodeHasS2(c))
  const rightmostS2Child = s2Children.length > 0
    ? s2Children.reduce((a, b) => a.x > b.x ? a : b)
    : null

  return (
    <group>
      {(!isPane || isPaneTarget) && (
        isOperation
          ? <OperationNode x={node.x} layer={node.layer} nodeId={node.id} onDoubleClick={onDoubleClick} onSystemClick={isPaneTarget ? onSystemClick : undefined} onHover={onHover} dimmed={dimmed} highlighted={highlighted} keySelected={keySelected} keySelectedSystem={isPaneTarget ? keySelectedSystem : null} isPaneView={isPaneTarget} />
          : <MetaUnit x={node.x} layer={node.layer} nodeId={node.id} onContextMenu={onContextMenu} onDoubleClick={onDoubleClick} onSystemClick={isPaneTarget ? onSystemClick : undefined} onHover={onHover} dimmed={dimmed} highlighted={highlighted} keySelected={keySelected} keySelectedSystem={isPaneTarget ? keySelectedSystem : null} hasS2={hasS2} isPaneView={isPaneTarget} />
      )}

      {/* Operation connects up to its management's S2 */}
      {!isPane && directOperation && (
        <Connection
          from={[directOperation.x, SYSTEMS.s3.yOffset, directOperation.layer]}
          to={[node.x, S2_Y_OFFSET, node.layer]}
          color={EXTERNAL_SYSTEMS.s2.strokeColor}
          dimmed={highlightId != null}
          style={connectionStyle}
        />
      )}

      {/* Connect rightmost S2 child up to this node's S2 */}
      {!isPane && hasS2 && rightmostS2Child && (
        <Connection
          from={[rightmostS2Child.x, S2_Y_OFFSET, rightmostS2Child.layer]}
          to={[node.x, S2_Y_OFFSET, node.layer]}
          color={EXTERNAL_SYSTEMS.s2.strokeColor}
          dimmed={highlightId != null}
          style="attenuator"
        />
      )}

      {/* Chain S2s of siblings that have S2s */}
      {!isPane && s2Children.length > 1 && s2Children.slice(0, -1).map((child, i) => {
        const next = s2Children[i + 1]
        return (
          <Connection
            key={`s2-chain-${child.id}-${next.id}`}
            from={[child.x, S2_Y_OFFSET, child.layer]}
            to={[next.x, S2_Y_OFFSET, next.layer]}
            color={EXTERNAL_SYSTEMS.s2.strokeColor}
            dimmed={highlightId != null}
            style="attenuator"
          />
        )
      })}

      {(!isPane || (onPanePath && !isPaneTarget)) && node.children.map((child) => {
        const childIsOperation = child.type === 'operation'
        return (
          <group key={child.id}>
            {!isPane && (
              childIsOperation
                ? <Connection
                    from={[node.x, SYSTEMS.s3.yOffset, node.layer]}
                    to={[child.x, SYSTEMS.s3.yOffset, child.layer]}
                    color={EXTERNAL_SYSTEMS.s1.strokeColor}
                    dimmed={highlightId != null}
                    style={connectionStyle}
                  />
                : Object.values(SYSTEMS).map((sys) => (
                    <Connection
                      key={sys.yOffset}
                      from={[node.x, sys.yOffset, node.layer]}
                      to={[child.x, sys.yOffset, child.layer]}
                      color={sys.strokeColor}
                      dimmed={highlightId != null}
                      style={connectionStyle}
                    />
                  ))
            )}
            <MetaTree node={child} onContextMenu={onContextMenu} onDoubleClick={onDoubleClick} onSystemClick={onSystemClick} onHover={onHover} highlightId={highlightId} keySelectedId={keySelectedId} keySelectedSystem={keySelectedSystem} paneId={paneId} connectionStyle={connectionStyle} />
          </group>
        )
      })}
    </group>
  )
}
