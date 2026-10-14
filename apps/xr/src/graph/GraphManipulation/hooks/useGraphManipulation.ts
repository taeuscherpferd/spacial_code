import { useFrame } from '@react-three/fiber'
import { useXR, useXRStore } from '@react-three/xr'
import { useEffect, useRef, type RefObject } from 'react'
import { Vector3, type Group, type Mesh, type MeshBasicMaterial } from 'three'
import type { GraphNode } from '@/connection/protocol'
import type { Position3 } from '@/graph/CodeGraph.logic'
import {
  GraphManipulationLogic,
  type ControllerGrip,
  type GripGesture,
} from '@/graph/GraphManipulation/GraphManipulation.logic'

/** Radius in metres of the sphere at each controller that picks up nodes. */
export const grabCursorRadius = 0.04

type Hand = 'left' | 'right'

/** What a squeezing controller is holding; decided on the first frame of the squeeze. */
type Hold =
  | { kind: 'pending' }
  | { kind: 'graph' }
  | { kind: 'node'; id: string; offset: Vector3 }

interface NodeGrabOptions {
  nodes: readonly GraphNode[]
  positions: ReadonlyMap<string, Position3>
  onMoveNode: (id: string, position: Position3) => void
}

const isController = (
  source: XRInputSource,
): source is XRInputSource & {
  handedness: Hand
} =>
  !source.hand &&
  (source.handedness === 'left' || source.handedness === 'right')

const showCursor = (
  cursor: Mesh | null,
  position: Vector3 | null,
  touching: boolean,
): void => {
  if (!cursor) return
  cursor.visible = position !== null
  if (!position) return
  cursor.position.copy(position)
  const material = cursor.material as MeshBasicMaterial
  material.color.set(touching ? '#7fd4ff' : '#ffffff')
  material.opacity = touching ? 0.55 : 0.2
}

/**
 * Grip buttons move the graph: one hand drags it, two hands also scale it.
 * A grip pressed while the controller's cursor sphere touches a node picks up
 * that node instead, and it follows the controller until released.
 */
export const useGraphManipulation = (options: NodeGrabOptions) => {
  const groupRef = useRef<Group>(null)
  const cursors: Record<Hand, RefObject<Mesh | null>> = {
    left: useRef<Mesh>(null),
    right: useRef<Mesh>(null),
  }
  const holds = useRef(new Map<XRInputSource, Hold>())
  const gesture = useRef<GripGesture | null>(null)
  const latest = useRef(options)
  latest.current = options
  const store = useXRStore()
  const session = useXR((state) => state.session)

  useEffect(() => {
    if (!session) return
    const reset = (): void => {
      holds.current.clear()
      gesture.current = null
    }
    const start = (event: XRInputSourceEvent): void => {
      const source = event.inputSource
      if (isController(source) && source.gripSpace) {
        holds.current.set(source, { kind: 'pending' })
      }
    }
    const end = (event: XRInputSourceEvent): void => {
      holds.current.delete(event.inputSource)
    }
    const remove = (event: XRInputSourcesChangeEvent): void => {
      for (const source of event.removed) holds.current.delete(source)
    }
    session.addEventListener('squeezestart', start)
    session.addEventListener('squeezeend', end)
    session.addEventListener('inputsourceschange', remove)
    session.addEventListener('visibilitychange', reset)
    session.addEventListener('end', reset)
    return () => {
      session.removeEventListener('squeezestart', start)
      session.removeEventListener('squeezeend', end)
      session.removeEventListener('inputsourceschange', remove)
      session.removeEventListener('visibilitychange', reset)
      session.removeEventListener('end', reset)
      reset()
    }
  }, [session])

  useFrame((_state, _delta, frame) => {
    const group = groupRef.current
    const { origin, originReferenceSpace } = store.getState()
    if (!group || !frame || !originReferenceSpace) {
      gesture.current = null
      showCursor(cursors.left.current, null, false)
      showCursor(cursors.right.current, null, false)
      return
    }
    const { nodes, positions, onMoveNode } = latest.current
    const toWorld = (pose: XRPose | undefined): Vector3 | null => {
      if (!pose) return null
      const position = new Vector3().copy(pose.transform.position)
      return origin ? origin.localToWorld(position) : position
    }
    // The cursors and grips live in the graph's parent space, nodes in the graph's own.
    const toParent = (world: Vector3 | null): Vector3 | null =>
      world && group.parent ? group.parent.worldToLocal(world.clone()) : world
    const reach = grabCursorRadius / group.scale.x
    const seen = new Set<Hand>()
    const grips: ControllerGrip[] = []
    let gripsComplete = true

    for (const source of frame.session.inputSources) {
      if (!isController(source)) continue
      seen.add(source.handedness)
      // The cursor sits at the front of the controller, where the pointer ray starts.
      const tipWorld = toWorld(
        frame.getPose(source.targetRaySpace, originReferenceSpace),
      )
      const tip = toParent(tipWorld)
      const tipLocal = tipWorld ? group.worldToLocal(tipWorld.clone()) : null
      let hold = holds.current.get(source)

      if (hold?.kind === 'pending') {
        const id = tipLocal
          ? GraphManipulationLogic.nearestNode(
              tipLocal,
              nodes,
              positions,
              reach,
            )
          : null
        const position = id ? positions.get(id) : undefined
        hold =
          id && position && tipLocal
            ? {
                kind: 'node',
                id,
                offset: new Vector3(...position).sub(tipLocal),
              }
            : { kind: 'graph' }
        holds.current.set(source, hold)
      }

      if (hold?.kind === 'node') {
        if (tipLocal) {
          const next = tipLocal.add(hold.offset)
          onMoveNode(hold.id, [next.x, next.y, next.z])
        }
        showCursor(cursors[source.handedness].current, tip, true)
        continue
      }

      showCursor(
        cursors[source.handedness].current,
        tip,
        tipLocal !== null &&
          hold === undefined &&
          GraphManipulationLogic.nearestNode(
            tipLocal,
            nodes,
            positions,
            reach,
          ) !== null,
      )

      if (hold?.kind === 'graph' && source.gripSpace) {
        const position = toParent(
          toWorld(frame.getPose(source.gripSpace, originReferenceSpace)),
        )
        if (position) grips.push({ id: source, position })
        else gripsComplete = false
      }
    }
    for (const hand of ['left', 'right'] as const) {
      if (!seen.has(hand)) showCursor(cursors[hand].current, null, false)
    }

    if (!grips.length || !gripsComplete) {
      gesture.current = null
      return
    }
    const transform = { position: group.position, scale: group.scale.x }
    if (
      !gesture.current ||
      !GraphManipulationLogic.matches(gesture.current, grips)
    ) {
      gesture.current = GraphManipulationLogic.begin(grips, transform)
      return
    }
    const next = GraphManipulationLogic.update(gesture.current, grips)
    group.position.copy(next.position)
    group.scale.setScalar(next.scale)
    group.updateMatrixWorld(true)
  })

  return { groupRef, cursors }
}
