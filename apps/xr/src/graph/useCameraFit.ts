import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { useXR } from '@react-three/xr'
import { Fog, PerspectiveCamera, Vector3 } from 'three'
import type { LayoutBounds } from '@/graph/CodeGraph.logic'

interface ControlsLike {
  target: Vector3
  maxDistance: number
  update: () => void
}

/**
 * Frames the camera and OrbitControls around a layout's actual extent, instead of the fixed
 * starting position/zoom limits, which only suit small graphs. Only refits when the graph's
 * size or centre moves substantially (a different workspace loading, or regrouping), not
 * every minor layout tweak, so it doesn't fight the user's own framing once they've navigated.
 *
 * The fog follows the camera's distance from the orbit target, so the back of the graph
 * always fades a little for depth, and zooming out never fades the whole graph away.
 */
export const useCameraFit = (bounds: LayoutBounds | null): void => {
  const session = useXR((state) => state.session)
  const size = useThree((state) => state.size)
  const fittedSize = useRef('')
  const camera = useThree((state) => state.camera)
  const controls = useThree(
    (state) => state.controls as unknown as ControlsLike | null,
  )
  const scene = useThree((state) => state.scene)
  const fitted = useRef<LayoutBounds | null>(null)

  useFrame(() => {
    const radius = fitted.current?.radius
    if (session || !controls || !radius || !(scene.fog instanceof Fog)) {
      return
    }
    const distance = camera.position.distanceTo(controls.target)
    scene.fog.near = Math.max(1, distance - radius)
    scene.fog.far = distance + radius * 1.2
  })

  useEffect(() => {
    if (session || !bounds || !controls) {
      return
    }
    const previous = fitted.current
    const changedSubstantially =
      previous === null ||
      Math.abs(previous.radius - bounds.radius) >
        previous.radius * 0.25 + 0.5 ||
      Math.hypot(
        previous.center[0] - bounds.center[0],
        previous.center[1] - bounds.center[1],
        previous.center[2] - bounds.center[2],
      ) >
        previous.radius * 0.25 + 0.5
    const viewport = `${size.width}:${size.height}`
    if (!changedSubstantially && fittedSize.current === viewport) {
      return
    }
    fitted.current = bounds
    fittedSize.current = viewport

    const fov = camera instanceof PerspectiveCamera ? camera.fov : 52
    const verticalAngle = (fov * Math.PI) / 360
    const horizontalAngle = Math.atan(
      (Math.tan(verticalAngle) * size.width) / Math.max(size.height, 1),
    )
    const fitDistance =
      bounds.radius / Math.sin(Math.min(verticalAngle, horizontalAngle))
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
    const reach = distance * 4 + bounds.radius * 3
    if (camera instanceof PerspectiveCamera) {
      camera.far = Math.max(1000, reach)
      camera.updateProjectionMatrix()
    }

    controls.target.copy(target)
    // Set rather than raised, so a small project doesn't inherit a big one's limits.
    // Leaves room to pull well back from the graph, not just a little past the fit.
    controls.maxDistance = Math.max(60, distance * 4)
    controls.update()
  }, [bounds, camera, controls, scene, session, size.width, size.height])
}
