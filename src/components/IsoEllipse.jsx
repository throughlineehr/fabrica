import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { ELLIPSE_RADIUS, toWorld } from '../constants'
import { useNodeOpacity } from '../hooks/useNodeOpacity'

const SEGMENTS = 32

function ellipsePoints(r, segments) {
  const pts = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    pts.push([Math.cos(a) * r, Math.sin(a) * r, 0])
  }
  return pts
}

export function IsoEllipse({ color, strokeColor, coords, onContextMenu, onDoubleClick, onClick, onPointerOver, onPointerOut, dimmed, highlighted }) {
  const pos = toWorld(...coords)
  const [fillOp, strokeOp] = useNodeOpacity(dimmed, highlighted)

  const geometry = useMemo(() => {
    const shape = new THREE.Shape()
    for (let i = 0; i <= SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2
      const x = Math.cos(a) * ELLIPSE_RADIUS
      const y = Math.sin(a) * ELLIPSE_RADIUS
      if (i === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    }
    return new THREE.ShapeGeometry(shape, SEGMENTS)
  }, [])

  const outlinePoints = useMemo(() => ellipsePoints(ELLIPSE_RADIUS, SEGMENTS), [])

  return (
    <group position={pos} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh geometry={geometry} onContextMenu={onContextMenu} onDoubleClick={onDoubleClick} onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
        <meshBasicMaterial color={color} transparent opacity={fillOp} side={2} />
      </mesh>
      <Line
        points={outlinePoints}
        color={strokeColor}
        lineWidth={3}
        transparent
        opacity={strokeOp}
      />
    </group>
  )
}
