import { Euler, Quaternion, Vector3 } from 'three'

export class VrEditorLogic {
  static placement(position: Vector3, orientation: Quaternion) {
    const yaw = new Euler().setFromQuaternion(orientation, 'YXZ').y
    const offset = new Vector3(1.5, -0.15, -1.2).applyAxisAngle(
      new Vector3(0, 1, 0),
      yaw,
    )
    return {
      position: position.clone().add(offset),
      rotation: Math.atan2(-offset.x, -offset.z),
    }
  }
}
