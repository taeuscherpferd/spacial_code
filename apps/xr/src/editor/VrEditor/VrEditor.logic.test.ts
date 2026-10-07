import { describe, expect, it } from 'vitest'
import { Euler, Quaternion, Vector3 } from 'three'
import { VrEditorLogic } from '@/editor/VrEditor/VrEditor.logic'

describe('VrEditorLogic', () => {
  it('places the editor right and forward of the viewer, facing them', () => {
    const viewer = new Vector3(4, 1.7, 8)
    const placement = VrEditorLogic.placement(viewer, new Quaternion())
    expect(placement.position.toArray()).toEqual([5.5, 1.55, 6.8])
    const facing = new Vector3(0, 0, 1).applyAxisAngle(
      new Vector3(0, 1, 0),
      placement.rotation,
    )
    const towardViewer = viewer
      .clone()
      .sub(placement.position)
      .setY(0)
      .normalize()
    expect(facing.distanceTo(towardViewer)).toBeLessThan(0.00001)
  })

  it('uses current heading and position without tilting with the headset', () => {
    const viewer = new Vector3(-3, 2, 5)
    const orientation = new Quaternion().setFromEuler(
      new Euler(0.4, Math.PI / 2, 0.2, 'YXZ'),
    )
    const placement = VrEditorLogic.placement(viewer, orientation)
    expect(placement.position.x).toBeCloseTo(-4.2)
    expect(placement.position.y).toBeCloseTo(1.85)
    expect(placement.position.z).toBeCloseTo(3.5)
    expect(viewer.toArray()).toEqual([-3, 2, 5])
  })
})
