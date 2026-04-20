import { useRef, useEffect } from 'react'
import { Line } from '@react-three/drei'
import { SQUARE_SIZE, toWorld } from '../constants'
import { useNodeOpacity } from '../hooks/useNodeOpacity'
import { usePatternTexture } from '../hooks/usePatternTexture'
import { useAccessibility } from '../accessibility'
import * as THREE from 'three'

export function IsoSquare({ color, strokeColor, coords, systemKey, onContextMenu, onDoubleClick, onClick, onPointerOver, onPointerOut, dimmed, highlighted }) {
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

  return (
    <group position={pos} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh onContextMenu={onContextMenu} onDoubleClick={onDoubleClick} onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
        <planeGeometry args={[SQUARE_SIZE, SQUARE_SIZE]} />
        <meshBasicMaterial ref={matRef} transparent opacity={fillOp} side={2} />
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
