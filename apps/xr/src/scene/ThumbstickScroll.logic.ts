export const thumbstickDeadzone = 0.25

export type ThumbstickAxis = 'x' | 'y'

export interface Thumbstick {
  x: number
  y: number
}

export class ThumbstickScrollLogic {
  /**
   * Picks whichever stick is pushed further along `axis`, so either hand can
   * scroll. A stick only counts when that axis is its main direction, so a
   * diagonal push scrolls one way instead of both.
   */
  static strongest(
    sticks: readonly Thumbstick[],
    axis: ThumbstickAxis,
  ): number {
    const other: ThumbstickAxis = axis === 'x' ? 'y' : 'x'
    return sticks.reduce((strongest, stick) => {
      const value = stick[axis]
      if (Math.abs(value) < Math.abs(stick[other])) return strongest
      return Math.abs(value) > Math.abs(strongest) ? value : strongest
    }, 0)
  }

  /**
   * Adds this frame's push to the fraction left over from earlier frames and
   * splits off the whole steps. Pushing down (toward you) is positive y.
   */
  static advance(
    pending: number,
    axis: number,
    stepsPerSecond: number,
    delta: number,
  ): { steps: number; pending: number } {
    if (Math.abs(axis) < thumbstickDeadzone) return { steps: 0, pending: 0 }
    const total = pending + axis * stepsPerSecond * delta
    const steps = Math.trunc(total)
    return { steps, pending: total - steps }
  }
}
