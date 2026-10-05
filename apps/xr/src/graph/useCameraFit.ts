import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Fog, PerspectiveCamera, Vector3 } from 'three'
import type { LayoutBounds } from '@/graph/CodeGraph.logic'

interface ControlsLike {
  target: Vector3
  maxDistance: number
  update: () => void
}

/**
 * Frames the camera and OrbitControls around a layout's actual extent, instead of the fixed
 * starting position/zoom limits, which only suit small graphs. Only refits on a substantial
 * change in size (a different workspace loading), not every minor layout tweak, so it doesn't
 * fight the user's own framing once they've navigated.
 */
export const useCameraFit = (bounds: LayoutBounds | null): void => {
  const camera = useThree((state) => state.camera)
  const controls = useThree(
    (state) => state.controls as unknown as ControlsLike | null,
  )
  const scene = useThree((state) => state.scene)
  const fittedRadius = useRef<number | null>(null)

  useEffect(() => {
    if (!bounds || !controls) {
      return
    }
    const previous = fittedRadius.current
    const changedSubstantially =
      previous === null ||
      Math.abs(previous - bounds.radius) > previous * 0.25 + 0.5
    if (!changedSubstantially) {
      return
    }
    fittedRadius.current = bounds.radius

    const fov = camera instanceof PerspectiveCamera ? camera.fov : 52
    const fitDistance = bounds.radius / Math.sin((fov * Math.PI) / 360)
    const distance = Math.max(fitDistance * 1.15, 4)

    const target = new Vector3(...bounds.center)
    const direction = camera.position.clone().sub(target)
    if (direction.lengthSq() < 1e-6) {
      direction.set(0, 0.3, 1)
    }
    direction.normalize().multiplyScalar(distance)
    camera.position.copy(target).add(direction)
    // Without this, anything past the default far plane (1000) is clipped outright,
    // including the editor and terminal panels.
    const reach = distance * 1.5 + bounds.radius * 3
    if (camera instanceof PerspectiveCamera) {
      camera.far = Math.max(camera.far, reach)
      camera.updateProjectionMatrix()
    }

    controls.target.copy(target)
    controls.maxDistance = Math.max(controls.maxDistance, distance * 1.5)
    controls.update()

    // The near side of the bounding sphere should start clear and the far side stay inside
    // the fog's range, or the graph fades to background before the zoom limit.
    if (scene.fog instanceof Fog) {
      scene.fog.near = Math.max(scene.fog.near, distance - bounds.radius)
      scene.fog.far = Math.max(scene.fog.far, distance + bounds.radius * 1.2)
    }
  }, [bounds, camera, controls, scene])
}
