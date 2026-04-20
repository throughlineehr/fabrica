import { Line } from '@react-three/drei'
import { SQUARE_SIZE, toWorld } from '../constants'
import { useNodeOpacity } from '../hooks/useNodeOpacity'

export function IsoSquare({ color, strokeColor, coords, onContextMenu, onDoubleClick, onClick, onPointerOver, onPointerOut, dimmed, highlighted }) {
  const pos = toWorld(...coords)
  const [fillOp, strokeOp] = useNodeOpacity(dimmed, highlighted)

  return (
    <group position={pos} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh onContextMenu={onContextMenu} onDoubleClick={onDoubleClick} onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
        <planeGeometry args={[SQUARE_SIZE, SQUARE_SIZE]} />
        <meshBasicMaterial color={color} transparent opacity={fillOp} side={2} />
      </mesh>
      <Line
        points={[
          [-0.5, -0.5, 0],
          [ 0.5, -0.5, 0],
          [ 0.5,  0.5, 0],
          [-0.5,  0.5, 0],
          [-0.5, -0.5, 0],
        ]}
        color={strokeColor}
        lineWidth={3}
        transparent
        opacity={strokeOp}
      />
    </group>
  )
}
