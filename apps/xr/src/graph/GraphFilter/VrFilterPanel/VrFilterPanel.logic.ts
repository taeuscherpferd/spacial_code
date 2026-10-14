import type { ExternalModulesMode } from '@/graph/GraphFilter/GraphFilter.logic'
import { Euler, Quaternion, Vector3 } from 'three'

export const keyboardRows = [
  '1234567890',
  'qwertyuiop',
  'asdfghjkl.',
  'zxcvbnm/-_',
] as const

const moduleModes: readonly ExternalModulesMode[] = ['related', 'all', 'hide']

export class VrFilterPanelLogic {
  static placement(position: Vector3, orientation: Quaternion) {
    const yaw = new Euler().setFromQuaternion(orientation, 'YXZ').y
    const offset = new Vector3(0, -0.35, -1.25).applyAxisAngle(
      new Vector3(0, 1, 0),
      yaw,
    )
    return {
      position: position.clone().add(offset),
      rotation: Math.atan2(-offset.x, -offset.z),
    }
  }

  static nextModulesMode(mode: ExternalModulesMode): ExternalModulesMode {
    return moduleModes[(moduleModes.indexOf(mode) + 1) % moduleModes.length]
  }

  static backspace(query: string): string {
    return query.slice(0, -1)
  }
}
