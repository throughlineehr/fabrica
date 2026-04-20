import { useMemo } from 'react'
import * as THREE from 'three'
import { OPACITY, ROUNDED_RECT_STROKE } from '../constants'

function roundedRectShape(w, h, r) {
  const shape = new THREE.Shape()
  const hw = w / 2, hh = h / 2
  r = Math.min(r, hw, hh)
  shape.moveTo(-hw + r, -hh)
  shape.lineTo(hw - r, -hh)
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r)
  shape.lineTo(hw, hh - r)
  shape.quadraticCurveTo(hw, hh, hw - r, hh)
  shape.lineTo(-hw + r, hh)
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r)
  shape.lineTo(-hw, -hh + r)
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh)
  return shape
}

export function RoundedRectFill({ width, height, radius, color = '#fff', dimmed }) {
  const geometry = useMemo(() => {
    const shape = roundedRectShape(width, height, radius)
    return new THREE.ShapeGeometry(shape, 32)
  }, [width, height, radius])

  return (
    <mesh geometry={geometry} position={[0, 0, -0.001]}>
      <meshBasicMaterial color={color} transparent opacity={dimmed ? 0.05 : 1} side={2} />
    </mesh>
  )
}

export function RoundedRectOutline({ width, height, radius, color = '#666', dimmed, strokeWidth = ROUNDED_RECT_STROKE }) {
  const geometry = useMemo(() => {
    const outer = roundedRectShape(width, height, radius)
    const inner = roundedRectShape(width - strokeWidth * 2, height - strokeWidth * 2, Math.max(0, radius - strokeWidth))
    outer.holes.push(inner)
    return new THREE.ShapeGeometry(outer, 32)
  }, [width, height, radius, strokeWidth])

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial color={color} transparent opacity={dimmed ? OPACITY.outlineDimmed : OPACITY.strokeNormal} side={2} depthWrite={false} />
    </mesh>
  )
}
