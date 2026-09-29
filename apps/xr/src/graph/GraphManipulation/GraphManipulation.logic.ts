import { MathUtils, Vector3 } from 'three'

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
          0.1,
          10,
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
}
