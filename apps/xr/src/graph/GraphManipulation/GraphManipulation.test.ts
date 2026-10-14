import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import type { GraphNode } from '@/connection/protocol'
import {
  GraphManipulationLogic as Logic,
  maxGraphScale,
  minGraphScale,
} from '@/graph/GraphManipulation/GraphManipulation.logic'

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
      maxGraphScale,
    )
    expect(Logic.update(gesture, [grip(left, 0), grip(right, 0)]).scale).toBe(
      minGraphScale,
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

  it('finds the node whose surface is nearest, within reach', () => {
    const nodes = [
      { id: 'file', kind: 'file' },
      { id: 'symbol', kind: 'function' },
    ] as GraphNode[]
    const positions = new Map<string, [number, number, number]>([
      ['file', [0, 0, 0]],
      ['symbol', [0.5, 0, 0]],
    ])
    // 0.25 from both centres, but the file sphere is larger, so its surface is closer.
    expect(
      Logic.nearestNode(new Vector3(0.25, 0, 0), nodes, positions, 0.1),
    ).toBe('file')
    expect(
      Logic.nearestNode(new Vector3(0.7, 0, 0), nodes, positions, 0.1),
    ).toBe('symbol')
    expect(
      Logic.nearestNode(new Vector3(2, 0, 0), nodes, positions, 0.1),
    ).toBeNull()
  })
})
