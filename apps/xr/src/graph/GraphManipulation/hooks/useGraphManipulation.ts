import { useFrame } from '@react-three/fiber'
import { useXR, useXRStore } from '@react-three/xr'
import { useEffect, useRef } from 'react'
import { Vector3, type Group } from 'three'
import {
  GraphManipulationLogic,
  type ControllerGrip,
  type GripGesture,
} from '@/graph/GraphManipulation/GraphManipulation.logic'

export const useGraphManipulation = () => {
  const groupRef = useRef<Group>(null)
  const pressed = useRef(new Set<XRInputSource>())
  const gesture = useRef<GripGesture | null>(null)
  const store = useXRStore()
  const session = useXR((state) => state.session)

  useEffect(() => {
    if (!session) return
    const reset = (): void => {
      pressed.current.clear()
      gesture.current = null
    }
    const start = (event: XRInputSourceEvent): void => {
      const source = event.inputSource
      if (
        !source.hand &&
        source.gripSpace &&
        (source.handedness === 'left' || source.handedness === 'right')
      ) {
        pressed.current.add(source)
      }
    }
    const end = (event: XRInputSourceEvent): void => {
      pressed.current.delete(event.inputSource)
    }
    const remove = (event: XRInputSourcesChangeEvent): void => {
      for (const source of event.removed) pressed.current.delete(source)
    }
    session.addEventListener('squeezestart', start)
    session.addEventListener('squeezeend', end)
    session.addEventListener('inputsourceschange', remove)
    session.addEventListener('visibilitychange', reset)
    session.addEventListener('end', reset)
    return () => {
      session.removeEventListener('squeezestart', start)
      session.removeEventListener('squeezeend', end)
      session.removeEventListener('inputsourceschange', remove)
      session.removeEventListener('visibilitychange', reset)
      session.removeEventListener('end', reset)
      reset()
    }
  }, [session])

  useFrame((_state, _delta, frame) => {
    const group = groupRef.current
    const { origin, originReferenceSpace } = store.getState()
    if (!group || !frame || !originReferenceSpace || !pressed.current.size) {
      gesture.current = null
      return
    }
    const grips: ControllerGrip[] = []
    for (const source of pressed.current) {
      if (!source.gripSpace) continue
      const pose = frame.getPose(source.gripSpace, originReferenceSpace)
      if (!pose) {
        gesture.current = null
        return
      }
      const position = new Vector3().copy(pose.transform.position)
      origin?.localToWorld(position)
      group.parent?.worldToLocal(position)
      grips.push({ id: source, position })
    }
    const transform = { position: group.position, scale: group.scale.x }
    if (
      !gesture.current ||
      !GraphManipulationLogic.matches(gesture.current, grips)
    ) {
      gesture.current = GraphManipulationLogic.begin(grips, transform)
      return
    }
    const next = GraphManipulationLogic.update(gesture.current, grips)
    group.position.copy(next.position)
    group.scale.setScalar(next.scale)
    group.updateMatrixWorld(true)
  })

  return groupRef
}
