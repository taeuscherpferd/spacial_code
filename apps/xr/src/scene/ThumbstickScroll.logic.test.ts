import { describe, expect, it } from 'vitest'
import { ThumbstickScrollLogic } from '@/scene/ThumbstickScroll.logic'

describe('ThumbstickScrollLogic', () => {
  it('ignores small pushes and clears what was pending', () => {
    expect(ThumbstickScrollLogic.advance(0.8, 0.1, 18, 0.1)).toEqual({
      steps: 0,
      pending: 0,
    })
  })

  it('carries partial steps over to later frames', () => {
    let state = ThumbstickScrollLogic.advance(0, 1, 10, 0.06)
    expect(state.steps).toBe(0)
    state = ThumbstickScrollLogic.advance(state.pending, 1, 10, 0.06)
    expect(state.steps).toBe(1)
    expect(state.pending).toBeCloseTo(0.2)
  })

  it('scrolls up when the stick is pushed away', () => {
    expect(ThumbstickScrollLogic.advance(0, -1, 18, 0.25).steps).toBe(-4)
  })

  it('uses whichever stick is pushed further', () => {
    expect(
      ThumbstickScrollLogic.strongest(
        [
          { x: 0, y: 0.3 },
          { x: 0, y: -0.7 },
        ],
        'y',
      ),
    ).toBe(-0.7)
    expect(ThumbstickScrollLogic.strongest([], 'y')).toBe(0)
  })

  it('only scrolls along the direction the stick is mainly pushed', () => {
    const diagonal = [{ x: 0.8, y: 0.5 }]
    expect(ThumbstickScrollLogic.strongest(diagonal, 'x')).toBe(0.8)
    expect(ThumbstickScrollLogic.strongest(diagonal, 'y')).toBe(0)
  })
})
