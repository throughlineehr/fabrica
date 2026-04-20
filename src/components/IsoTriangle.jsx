import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { SQUARE_SIZE, OPACITY, toWorld } from '../constants'

// Equilateral triangle pointing up
const S = SQUARE_SIZE * 0.55
const H = S * Math.sqrt(3) / 2
const TRI_POINTS = [
  [0, H * 0.67, 0],
  [S / 2, -H * 0.33, 0],
  [-S / 2, -H * 0.33, 0],
  [0, H * 0.67, 0],
]

// Bottom of triangle in local space
export const TRI_BOTTOM = -H * 0.33

export function IsoTriangle({ color, strokeColor, coords, onContextMenu, onDoubleClick, onClick, onPointerOver, onPointerOut, dimmed, scale = 1, offsetY = 0 }) {
  const pos = toWorld(...coords)

  const geometry = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(TRI_POINTS[0][0], TRI_POINTS[0][1])
    shape.lineTo(TRI_POINTS[1][0], TRI_POINTS[1][1])
    shape.lineTo(TRI_POINTS[2][0], TRI_POINTS[2][1])
    shape.closePath()
    return new THREE.ShapeGeometry(shape)
  }, [])

  return (
    <group position={pos} rotation={[-Math.PI / 2, 0, 0]}>
      <group position={[0, offsetY, 0]} scale={[scale, scale, 1]}>
      <mesh geometry={geometry} onContextMenu={onContextMenu} onDoubleClick={onDoubleClick} onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
        <meshBasicMaterial color={color} transparent opacity={dimmed ? OPACITY.fillDimmed : OPACITY.fillNormal} side={2} />
      </mesh>
      <Line
        points={TRI_POINTS}
        color={strokeColor}
        lineWidth={3}
        transparent
        opacity={dimmed ? OPACITY.strokeDimmed : OPACITY.strokeNormal}
      />
      </group>
    </group>
  )
}
