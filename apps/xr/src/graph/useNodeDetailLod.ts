import { useFrame } from '@react-three/fiber'
import { useRef, useState, type RefObject } from 'react'
import { Frustum, Matrix4, Vector3, type Group } from 'three'
import type { Position3 } from '@/graph/CodeGraph.logic'

/** Nodes farther than this (in graph-local units) stay at low detail regardless of frustum. */
const maxDetailDistance = 6
const updateIntervalMs = 150

const setsEqual = (
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean => {
  if (left.size !== right.size) {
    return false
  }
  for (const id of left) {
    if (!right.has(id)) {
      return false
    }
  }
  return true
}

/**
 * Picks which nodes are worth the full mesh + billboard + text treatment: anything in
 * `alwaysDetailed` (selection, focus), plus nodes that are both close to the camera and
 * inside its view frustum. Recomputed on a timer rather than every frame since it only
 * needs to track camera movement, not render smoothly.
 */
export const useNodeDetailLod = (
  groupRef: RefObject<Group | null>,
  positions: ReadonlyMap<string, Position3>,
  alwaysDetailed: ReadonlySet<string>,
): ReadonlySet<string> => {
  const [detailed, setDetailed] = useState<ReadonlySet<string>>(new Set())
  const lastUpdate = useRef(0)
  const frustum = useRef(new Frustum())
  const viewProjection = useRef(new Matrix4())
  const cameraLocal = useRef(new Vector3())
  const scratch = useRef(new Vector3())

  useFrame((state) => {
    const now = state.clock.elapsedTime * 1000
    if (now - lastUpdate.current < updateIntervalMs) {
      return
    }
    lastUpdate.current = now
    const group = groupRef.current
    if (!group) {
      return
    }

    const { camera } = state
    viewProjection.current.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    )
    frustum.current.setFromProjectionMatrix(viewProjection.current)
    camera.getWorldPosition(cameraLocal.current)
    group.worldToLocal(cameraLocal.current)

    const next = new Set<string>(alwaysDetailed)
    const maxDistanceSq = maxDetailDistance * maxDetailDistance
    for (const [id, position] of positions) {
      if (next.has(id)) {
        continue
      }
      const dx = position[0] - cameraLocal.current.x
      const dy = position[1] - cameraLocal.current.y
      const dz = position[2] - cameraLocal.current.z
      if (dx * dx + dy * dy + dz * dz > maxDistanceSq) {
        continue
      }
      scratch.current.set(position[0], position[1], position[2])
      group.localToWorld(scratch.current)
      if (frustum.current.containsPoint(scratch.current)) {
        next.add(id)
      }
    }

    if (!setsEqual(detailed, next)) {
      setDetailed(next)
    }
  })

  return detailed
}
