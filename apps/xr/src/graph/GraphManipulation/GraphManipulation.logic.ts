import type { GraphNode } from '@/connection/protocol'
import { CodeGraphLogic, type Position3 } from '@/graph/CodeGraph.logic'
import { MathUtils, Vector3 } from 'three'

/** How far two-handed scaling can shrink or grow the graph; 0.01 fits a huge workspace in your hands. */
export const minGraphScale = 0.01
export const maxGraphScale = 10

export interface GraphTransform {
  position: Vector3
  scale: number
}

export interface ControllerGrip {
  id: object
  position: Vector3
}

export interface GripGesture {
  grips: readonly ControllerGrip[]
  transform: GraphTransform
}

export class GraphManipulationLogic {
  static begin(
    grips: readonly ControllerGrip[],
    transform: GraphTransform,
  ): GripGesture {
    return {
      grips: grips.map((grip) => ({
        ...grip,
        position: grip.position.clone(),
      })),
      transform: {
        position: transform.position.clone(),
        scale: transform.scale,
      },
    }
  }

  static matches(
    gesture: GripGesture,
    grips: readonly ControllerGrip[],
  ): boolean {
    return (
      gesture.grips.length === grips.length &&
      gesture.grips.every((grip, index) => grip.id === grips[index].id)
    )
  }

  static center(grips: readonly ControllerGrip[]): Vector3 {
    const center = new Vector3()
    for (const grip of grips) center.add(grip.position)
    return center.divideScalar(Math.max(1, grips.length))
  }

  static update(
    gesture: GripGesture,
    grips: readonly ControllerGrip[],
  ): GraphTransform {
    const start = gesture.grips
    let scale = gesture.transform.scale
    if (start.length === 2 && grips.length === 2) {
      const initialDistance = start[0].position.distanceTo(start[1].position)
      if (initialDistance >= 0.02) {
        scale = MathUtils.clamp(
          (gesture.transform.scale *
            grips[0].position.distanceTo(grips[1].position)) /
            initialDistance,
          minGraphScale,
          maxGraphScale,
        )
      }
    }
    return {
      position: gesture.transform.position
        .clone()
        .sub(this.center(start))
        .multiplyScalar(scale / gesture.transform.scale)
        .add(this.center(grips)),
      scale,
    }
  }

  /**
   * The node whose surface is closest to `point`, if any is within `reach`.
   * Everything is in the graph's local space.
   */
  static nearestNode(
    point: Vector3,
    nodes: readonly GraphNode[],
    positions: ReadonlyMap<string, Position3>,
    reach: number,
  ): string | null {
    let nearest: string | null = null
    let closest = reach
    for (const node of nodes) {
      const position = positions.get(node.id)
      if (!position) continue
      const gap =
        Math.hypot(
          position[0] - point.x,
          position[1] - point.y,
          position[2] - point.z,
        ) - CodeGraphLogic.nodeRadius(node.kind)
      if (gap <= closest) {
        closest = gap
        nearest = node.id
      }
    }
    return nearest
  }
}
