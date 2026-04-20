import { Line } from '@react-three/drei'
import { SQUARE_SIZE, OPACITY, toWorld } from '../constants'

export function IsoSquare({ color, strokeColor, coords, onContextMenu, onDoubleClick, onClick, onPointerOver, onPointerOut, dimmed }) {
  const pos = toWorld(...coords)
  return (
    <group position={pos} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh onContextMenu={onContextMenu} onDoubleClick={onDoubleClick} onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
        <planeGeometry args={[SQUARE_SIZE, SQUARE_SIZE]} />
        <meshBasicMaterial color={color} transparent opacity={dimmed ? OPACITY.fillDimmed : OPACITY.fillNormal} side={2} />
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
        opacity={dimmed ? OPACITY.strokeDimmed : OPACITY.strokeNormal}
      />
    </group>
  )
}
