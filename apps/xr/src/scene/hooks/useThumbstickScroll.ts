import { useFrame } from '@react-three/fiber'
import { useXRInputSourceState } from '@react-three/xr'
import { useRef } from 'react'
import {
  ThumbstickScrollLogic,
  type ThumbstickAxis,
} from '@/scene/ThumbstickScroll.logic'

/**
 * XR pointers never send wheel events, so while a controller ray is over the
 * panel this reads the thumbsticks and reports whole scroll steps instead.
 * Spread the returned handlers onto the panel's outer group. `axis` 'x'
 * scrolls sideways, with pushing right as positive.
 */
export const useThumbstickScroll = (
  onScroll: (steps: number) => void,
  stepsPerSecond = 18,
  axis: ThumbstickAxis = 'y',
) => {
  const left = useXRInputSourceState('controller', 'left')
  const right = useXRInputSourceState('controller', 'right')
  const hovered = useRef(0)
  const pending = useRef(0)

  useFrame((_, delta) => {
    const value = ThumbstickScrollLogic.strongest(
      [left, right].map((controller) => {
        const stick = controller?.gamepad['xr-standard-thumbstick']
        return { x: stick?.xAxis ?? 0, y: stick?.yAxis ?? 0 }
      }),
      axis,
    )
    const next = ThumbstickScrollLogic.advance(
      pending.current,
      hovered.current > 0 ? value : 0,
      stepsPerSecond,
      delta,
    )
    pending.current = next.pending
    if (next.steps !== 0) onScroll(next.steps)
  })

  // Counted, because both controller rays can be over the panel at once.
  return {
    onPointerEnter: () => {
      hovered.current += 1
    },
    onPointerLeave: () => {
      hovered.current = Math.max(0, hovered.current - 1)
    },
  }
}
