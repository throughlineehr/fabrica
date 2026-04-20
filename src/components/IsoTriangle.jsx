import { useMemo, useRef, useEffect } from 'react'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { SQUARE_SIZE, TRIANGLE_SIZE_RATIO, toWorld } from '../constants'
import { useNodeOpacity } from '../hooks/useNodeOpacity'
import { usePatternTexture } from '../hooks/usePatternTexture'
import { useAccessibility } from '../accessibility'

const S = SQUARE_SIZE * TRIANGLE_SIZE_RATIO
const H = S * Math.sqrt(3) / 2
const TRI_POINTS = [
  [0, H * 0.67, 0],
  [S / 2, -H * 0.33, 0],
  [-S / 2, -H * 0.33, 0],
  [0, H * 0.67, 0],
]

export const TRI_BOTTOM = -H * 0.33

export function IsoTriangle({ color, strokeColor, coords, systemKey = 's2', onContextMenu, onDoubleClick, onClick, onPointerOver, onPointerOut, dimmed, highlighted, scale = 1, offsetY = 0 }) {
  const pos = toWorld(...coords)
  const [fillOp, strokeOp] = useNodeOpacity(dimmed, highlighted)
  const { colorBlind } = useAccessibility()
  const patternTex = usePatternTexture(systemKey, color, strokeColor, colorBlind)
  const matRef = useRef()

  useEffect(() => {
    if (!matRef.current) return
    if (patternTex) {
      matRef.current.map = patternTex
      matRef.current.color.set(0xffffff)
    } else {
      matRef.current.map = null
      matRef.current.color.set(color)
    }
    matRef.current.needsUpdate = true
  }, [patternTex, color])

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
          <meshBasicMaterial ref={matRef} transparent opacity={fillOp} side={2} />
        </mesh>
        <Line
          points={TRI_POINTS}
          color={strokeColor}
          lineWidth={3}
          transparent
          opacity={strokeOp}
        />
      </group>
    </group>
  )
}
