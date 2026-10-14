import { useThree } from '@react-three/fiber'
import {
  useXRControllerButtonEvent,
  useXRInputSourceState,
} from '@react-three/xr'
import { useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { Quaternion, Vector3 } from 'three'
import { CodeEditor } from '@/editor/CodeEditor'
import { VrEditorLogic } from '@/editor/VrEditor/VrEditor.logic'

type VrEditorProps = ComponentProps<typeof CodeEditor> & {
  /** Panels that follow the editor and hide with it: the toolbar and terminal. */
  children?: ReactNode
}

export const VrEditor = ({ children, ...props }: VrEditorProps) => {
  const gl = useThree((state) => state.gl)
  const controller = useXRInputSourceState('controller', 'right')
  const visible = useRef(false)
  const [placement, setPlacement] = useState<ReturnType<
    typeof VrEditorLogic.placement
  > | null>(null)

  useXRControllerButtonEvent(controller, 'a-button', (state) => {
    if (state !== 'pressed') return
    visible.current = !visible.current
    if (!visible.current) {
      setPlacement(null)
      props.onInteractionChange(false)
      return
    }
    const camera = gl.xr.getCamera()
    setPlacement(
      VrEditorLogic.placement(
        camera.getWorldPosition(new Vector3()),
        camera.getWorldQuaternion(new Quaternion()),
      ),
    )
    props.onActivate()
  })

  return (
    placement && (
      <group
        position={placement.position}
        rotation={[0, placement.rotation, 0]}
        scale={0.45}
      >
        <CodeEditor {...props} />
        {/* The terminal and toolbar were laid out around the editor at (2.4, 0.65). */}
        <group position={[-2.4, -0.65, 0]}>{children}</group>
      </group>
    )
  )
}
