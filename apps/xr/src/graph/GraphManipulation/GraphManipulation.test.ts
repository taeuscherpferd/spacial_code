import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { GraphManipulationLogic as Logic } from '@/graph/GraphManipulation/GraphManipulation.logic'

const left = {}
const right = {}
const grip = (id: object, x: number, y = 0, z = 0) => ({
  id,
  position: new Vector3(x, y, z),
})
const transform = { position: new Vector3(0, 0, -4), scale: 1 }

describe('GraphManipulation', () => {
  it.each([left, right])(
    'translates with either controller in all axes',
    (id) => {
      const gesture = Logic.begin([grip(id, 1)], transform)
      const moved = Logic.update(gesture, [grip(id, 2, 3, -2)])
      expect(moved.position.toArray()).toEqual([1, 3, -6])
      expect(moved.scale).toBe(1)
      expect(transform.position.toArray()).toEqual([0, 0, -4])
    },
  )

  it('scales about the moving midpoint, keeping the grabbed point anchored', () => {
    const gesture = Logic.begin([grip(left, -1), grip(right, 1)], transform)
    const moved = Logic.update(gesture, [grip(left, -1, 1), grip(right, 3, 1)])
    expect(moved.scale).toBe(2)
    expect(moved.position.toArray()).toEqual([1, 1, -8])
    const shrunk = Logic.update(gesture, [grip(left, -0.5), grip(right, 0.5)])
    expect(shrunk.scale).toBe(0.5)
    expect(shrunk.position.z).toBe(-2)
  })

  it('rebases without jumping when switching between one and two grips', () => {
    const initial = [grip(left, 0)]
    const gesture = Logic.begin(initial, transform)
    expect(Logic.matches(gesture, initial)).toBe(true)
    expect(Logic.matches(gesture, [grip(right, 0)])).toBe(false)
    expect(Logic.matches(gesture, [grip(left, 0), grip(right, 1)])).toBe(false)
    const moved = Logic.update(gesture, [grip(left, 2)])
    const both = [grip(left, 2), grip(right, 4)]
    const rebased = Logic.begin(both, moved)
    expect(Logic.update(rebased, both)).toEqual(moved)
    const released = Logic.begin([both[1]], moved)
    expect(
      Logic.update(released, [grip(right, 4, 0, 1)]).position.toArray(),
    ).toEqual([2, 0, -3])
    both[0].position.x = 99
    expect(rebased.grips[0].position.x).toBe(2)
  })

  it('bounds scaling and handles coincident controllers safely', () => {
    const gesture = Logic.begin([grip(left, -1), grip(right, 1)], transform)
    expect(Logic.update(gesture, [grip(left, 0), grip(right, 100)]).scale).toBe(
      10,
    )
    expect(Logic.update(gesture, [grip(left, 0), grip(right, 0)]).scale).toBe(
      0.1,
    )
    const coincident = Logic.begin(
      [grip(left, 0), grip(right, 0.001)],
      transform,
    )
    expect(
      Logic.update(coincident, [grip(left, 0), grip(right, 1)]).scale,
    ).toBe(1)
    expect(Logic.center([]).toArray()).toEqual([0, 0, 0])
  })
})
