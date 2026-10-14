import type { GraphNode } from '@/connection/protocol'
import type { Position3 } from '@/graph/CodeGraph.logic'
import { useFrame } from '@react-three/fiber'
import { useRef, useState, type RefObject } from 'react'
import { Frustum, Matrix4, Vector3, type Group } from 'three'

const maxDetailDistance = 10
const maxDetailedNodes = 60
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

export const useNodeDetailLod = (
  groupRef: RefObject<Group | null>,
  nodes: readonly GraphNode[],
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

    const maxDistanceSq = maxDetailDistance * maxDetailDistance
    const candidates: { id: string; distanceSq: number }[] = []
    for (const node of nodes) {
      const position = positions.get(node.id)
      if (!position || alwaysDetailed.has(node.id)) {
        continue
      }
      const dx = position[0] - cameraLocal.current.x
      const dy = position[1] - cameraLocal.current.y
      const dz = position[2] - cameraLocal.current.z
      const distanceSq = dx * dx + dy * dy + dz * dz
      if (distanceSq > maxDistanceSq) {
        continue
      }
      scratch.current.set(position[0], position[1], position[2])
      group.localToWorld(scratch.current)
      if (frustum.current.containsPoint(scratch.current)) {
        candidates.push({ id: node.id, distanceSq })
      }
    }
    candidates.sort((left, right) => left.distanceSq - right.distanceSq)
    const next = new Set<string>(alwaysDetailed)
    for (const { id } of candidates.slice(0, maxDetailedNodes)) {
      next.add(id)
    }

    if (!setsEqual(detailed, next)) {
      setDetailed(next)
    }
  })

  return detailed
}
