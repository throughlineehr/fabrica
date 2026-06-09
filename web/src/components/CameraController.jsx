import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CAMERA_INITIAL, CAMERA_LOOK_INITIAL, CAMERA_LERP_SPEED, CAMERA_SNAP_THRESHOLD } from '../constants'
import { useAccessibility } from '../accessibility'

export function CameraController({ target, controlsRef }) {
  const { camera } = useThree()
  const { epilepsy } = useAccessibility()
  const posRef = useRef(new THREE.Vector3(...CAMERA_INITIAL))
  const lookRef = useRef(new THREE.Vector3(...CAMERA_LOOK_INITIAL))
  const upRef = useRef(new THREE.Vector3(0, 1, 0))
  const animating = useRef(false)

  useEffect(() => {
    if (target) {
      posRef.current.copy(new THREE.Vector3(...target.position))
      lookRef.current.copy(new THREE.Vector3(...target.lookAt))
      upRef.current.copy(new THREE.Vector3(...(target.up || [0, 1, 0])))

      if (target.instant || epilepsy) {
        camera.position.copy(posRef.current)
        camera.up.copy(upRef.current).normalize()
        if (controlsRef.current) {
          controlsRef.current.target.copy(lookRef.current)
          controlsRef.current.update()
        }
        animating.current = false
      } else {
        animating.current = true
      }
    }
  }, [target, camera, epilepsy, controlsRef])

  useEffect(() => {
    const cancel = () => { animating.current = false }
    window.addEventListener('pointerdown', cancel)
    window.addEventListener('wheel', cancel)
    return () => {
      window.removeEventListener('pointerdown', cancel)
      window.removeEventListener('wheel', cancel)
    }
  }, [])

  useFrame(() => {
    if (!animating.current) return

    camera.position.lerp(posRef.current, CAMERA_LERP_SPEED)
    camera.up.lerp(upRef.current, CAMERA_LERP_SPEED).normalize()

    if (controlsRef.current) {
      controlsRef.current.target.lerp(lookRef.current, CAMERA_LERP_SPEED)
      controlsRef.current.update()
    }

    if (camera.position.distanceTo(posRef.current) < CAMERA_SNAP_THRESHOLD) {
      camera.position.copy(posRef.current)
      camera.up.copy(upRef.current).normalize()
      if (controlsRef.current) {
        controlsRef.current.target.copy(lookRef.current)
        controlsRef.current.update()
      }
      animating.current = false
    }
  })

  return null
}
