import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { OPACITY, CONNECTION_DOT_RADIUS, toWorld } from '../constants'

function StraightConnection({ start, end, color, dimmed }) {
  return <Line points={[start, end]} color={color} lineWidth={1.5} transparent opacity={dimmed ? OPACITY.connectionDimmed : 1} />
}

function CurvedConnection({ start, end, color, dimmed }) {
  const points = useMemo(() => {
    const midY = (start[1] + end[1]) / 2
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(...start),
      new THREE.Vector3(start[0], midY, start[2]),
      new THREE.Vector3(end[0], midY, end[2]),
      new THREE.Vector3(...end),
    )
    return curve.getPoints(24).map(p => [p.x, p.y, p.z])
  }, [start, end])
  return <Line points={points} color={color} lineWidth={1.5} transparent opacity={dimmed ? OPACITY.connectionDimmed : 1} />
}

function DashedConnection({ start, end, color, dimmed }) {
  return <Line points={[start, end]} color={color} lineWidth={1} transparent opacity={dimmed ? OPACITY.connectionDimmed : 0.6} dashed dashSize={0.08} gapSize={0.06} />
}

function ElbowConnection({ start, end, color: c, dimmed }) {
  const midY = (start[1] + end[1]) / 2
  const points = [
    start,
    [start[0], midY, start[2]],
    [end[0], midY, end[2]],
    end,
  ]
  const op = dimmed ? OPACITY.connectionDimmed : 1
  return (
    <group>
      <Line points={points} color={c} lineWidth={1.5} transparent opacity={op} />
      <mesh position={start}>
        <sphereGeometry args={[CONNECTION_DOT_RADIUS, 8, 8]} />
        <meshBasicMaterial color={c} transparent opacity={op} />
      </mesh>
      <mesh position={end}>
        <sphereGeometry args={[CONNECTION_DOT_RADIUS, 8, 8]} />
        <meshBasicMaterial color={c} transparent opacity={op} />
      </mesh>
    </group>
  )
}

// Adds a zigzag attenuator symbol at the midpoint of a segment
function zigzagBetween(a, b, perpX, perpY, perpZ) {
  const mx = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2
  const mz = (a[2] + b[2]) / 2
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (len < 0.01) return [a, b]

  const ux = dx / len, uy = dy / len, uz = dz / len
  const zigSize = 0.06
  const zigLen = 0.04
  const teeth = 3
  const halfSpan = teeth * zigLen

  const pts = [a]
  pts.push([mx - ux * halfSpan, my - uy * halfSpan, mz - uz * halfSpan])

  for (let i = 0; i < teeth; i++) {
    const side = i % 2 === 0 ? 1 : -1
    const t1 = -halfSpan + (i * 2 + 0.5) * zigLen
    const t2 = -halfSpan + (i * 2 + 1.5) * zigLen
    pts.push([
      mx + ux * t1 + perpX * zigSize * side,
      my + uy * t1 + perpY * zigSize * side,
      mz + uz * t1 + perpZ * zigSize * side,
    ])
    pts.push([
      mx + ux * t2 - perpX * zigSize * side,
      my + uy * t2 - perpY * zigSize * side,
      mz + uz * t2 - perpZ * zigSize * side,
    ])
  }

  pts.push([mx + ux * halfSpan, my + uy * halfSpan, mz + uz * halfSpan])
  pts.push(b)
  return pts
}

// Elbow routing with zigzag attenuator on the horizontal segment
function AttenuatorConnection({ start, end, color: c, dimmed }) {
  const op = dimmed ? OPACITY.connectionDimmed : 1
  const points = useMemo(() => {
    const midY = (start[1] + end[1]) / 2
    const corner1 = [start[0], midY, start[2]]
    const corner2 = [end[0], midY, end[2]]

    // Perpendicular to the horizontal segment (pointing in Y)
    const horizontal = zigzagBetween(corner1, corner2, 0, 1, 0)

    return [
      start,
      ...horizontal,
      end,
    ]
  }, [start, end])

  return (
    <group>
      <Line points={points} color={c} lineWidth={1.5} transparent opacity={op} />
      <mesh position={start}>
        <sphereGeometry args={[CONNECTION_DOT_RADIUS, 8, 8]} />
        <meshBasicMaterial color={c} transparent opacity={op} />
      </mesh>
      <mesh position={end}>
        <sphereGeometry args={[CONNECTION_DOT_RADIUS, 8, 8]} />
        <meshBasicMaterial color={c} transparent opacity={op} />
      </mesh>
    </group>
  )
}

const STYLES = {
  straight: StraightConnection,
  curved: CurvedConnection,
  dashed: DashedConnection,
  elbow: ElbowConnection,
  attenuator: AttenuatorConnection,
}

export function Connection({ from, to, color, dimmed, style = 'straight' }) {
  const start = toWorld(...from)
  const end = toWorld(...to)
  const Component = STYLES[style] || StraightConnection
  return <Component start={start} end={end} color={color} dimmed={dimmed} />
}
