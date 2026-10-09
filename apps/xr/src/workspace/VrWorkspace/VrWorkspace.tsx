import { RoundedBox, Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import {
  useXRControllerButtonEvent,
  useXRInputSourceState,
} from '@react-three/xr'
import { useState } from 'react'
import { Quaternion, Vector3 } from 'three'
import { EditorButton } from '@/editor/EditorButton/EditorButton'
import type { WorkspaceBrowserControls } from '@/workspace/WorkspaceBrowser/hooks/useWorkspaceBrowser'
import { WorkspaceBrowserLogic } from '@/workspace/WorkspaceBrowser/WorkspaceBrowser.logic'
import { VrWorkspaceRow } from '@/workspace/VrWorkspaceRow/VrWorkspaceRow'

interface VrWorkspaceProps {
  controls: WorkspaceBrowserControls
}

export const VrWorkspace = ({ controls }: VrWorkspaceProps) => {
  const gl = useThree((state) => state.gl)
  const controller = useXRInputSourceState('controller', 'left')
  const [visible, setVisible] = useState(true)
  const [recent, setRecent] = useState(false)
  const place = () => {
    const camera = gl.xr.getCamera()
    return WorkspaceBrowserLogic.placement(
      camera.getWorldPosition(new Vector3()),
      camera.getWorldQuaternion(new Quaternion()),
    )
  }
  const [placement, setPlacement] = useState<ReturnType<
    typeof WorkspaceBrowserLogic.placement
  > | null>(null)
  useFrame(() => {
    if (visible && !placement) setPlacement(place())
  })
  useXRControllerButtonEvent(controller, 'x-button', (state) => {
    if (state !== 'pressed') return
    if (!visible) setPlacement(place())
    setVisible(!visible)
  })

  const items = recent
    ? controls.recentWorkspaces.map((path) => ({
        path,
        label: path,
        directory: false,
      }))
    : controls.browsing
      ? (controls.listing?.directories ?? []).map((entry) => ({
          ...entry,
          label: `▸ ${entry.name}`,
          directory: true,
        }))
      : controls.rows.map((row) => ({
          ...row,
          label: WorkspaceBrowserLogic.label(row),
        }))
  const page = WorkspaceBrowserLogic.page(items, controls.page)
  const message = controls.switching
    ? 'Opening project…'
    : controls.error
      ? controls.error
      : controls.pendingPath
        ? 'Keep unsaved changes as a draft and switch projects?'
        : controls.browsing && !controls.listing && !recent
          ? 'Loading folders…'
          : items.length === 0
            ? controls.browsing
              ? 'No subfolders. Open this folder to select it.'
              : 'No TypeScript files.'
            : 'X: hide / show beside you · trigger: select'

  return (
    visible &&
    placement && (
      <group
        position={placement.position}
        rotation={[0, placement.rotation, 0]}
        scale={0.55}
      >
        <RoundedBox args={[3, 3.65, 0.08]} radius={0.07} smoothness={4}>
          <meshBasicMaterial color="#0c1425" />
        </RoundedBox>
        <group position={[0, 0, 0.06]}>
          <Text
            position={[-1.35, 1.58, 0]}
            anchorX="left"
            fontSize={0.105}
            maxWidth={2.7}
            whiteSpace="nowrap"
            clipRect={[-0.01, -0.1, 2.7, 0.1]}
          >
            {controls.workspace?.name ?? 'Workspace'} · {controls.fileCount} TS
          </Text>
          <group position={[-0.94, 1.24, 0]}>
            <EditorButton
              label="Choose"
              disabled={controls.disabled}
              onPress={() => {
                setRecent(false)
                controls.browse(controls.workspace?.root ?? '')
              }}
            />
          </group>
          <group position={[0, 1.24, 0]}>
            <EditorButton
              label="Files"
              onPress={() => {
                setRecent(false)
                controls.closeBrowser()
              }}
            />
          </group>
          <group position={[0.94, 1.24, 0]}>
            <EditorButton
              label="Recent"
              disabled={controls.disabled}
              onPress={() => {
                setRecent(true)
                controls.setPage(0)
              }}
            />
          </group>
          <Text
            position={[-1.35, 0.97, 0]}
            fontSize={0.058}
            anchorX="left"
            maxWidth={2.7}
            clipRect={[-0.01, -0.11, 2.7, 0.1]}
          >
            {controls.pendingPath ??
              (recent
                ? 'Recent projects on server computer'
                : controls.browsing
                  ? (controls.listing?.path ?? 'Folders on server computer')
                  : (controls.workspace?.root ?? 'Connecting…'))}
          </Text>
          {controls.browsing && !recent && (
            <>
              <group position={[-0.94, 0.68, 0]}>
                <EditorButton
                  label="Up"
                  disabled={controls.disabled || !controls.listing?.parent}
                  onPress={() =>
                    controls.listing?.parent &&
                    controls.browse(controls.listing.parent)
                  }
                />
              </group>
              <group position={[0, 0.68, 0]}>
                <EditorButton
                  label="Open folder"
                  disabled={controls.disabled || !controls.listing}
                  onPress={() =>
                    controls.listing &&
                    controls.requestOpen(controls.listing.path)
                  }
                />
              </group>
            </>
          )}
          {page.rows.map((row, index) => (
            <group key={row.path} position={[0, 0.36 - index * 0.25, 0]}>
              <VrWorkspaceRow
                label={row.label}
                selected={
                  controls.selectedPath === row.path ||
                  controls.workspace?.root === row.path
                }
                disabled={controls.disabled || controls.pendingPath !== null}
                onPress={() =>
                  recent
                    ? controls.requestOpen(row.path)
                    : controls.browsing
                      ? controls.browse(row.path)
                      : controls.selectRow(row.path, row.directory)
                }
              />
            </group>
          ))}
          {controls.pendingPath ? (
            <>
              <group position={[-0.94, -1.37, 0]}>
                <EditorButton
                  label="Keep draft & open"
                  disabled={controls.disabled}
                  onPress={controls.confirmOpen}
                />
              </group>
              <group position={[0, -1.37, 0]}>
                <EditorButton label="Cancel" onPress={controls.cancelOpen} />
              </group>
            </>
          ) : (
            <>
              <group position={[-0.94, -1.37, 0]}>
                <EditorButton
                  label="Previous"
                  disabled={page.index === 0}
                  onPress={() => controls.setPage(page.index - 1)}
                />
              </group>
              <Text position={[0, -1.37, 0]} fontSize={0.075}>
                {page.index + 1} / {page.count}
              </Text>
              <group position={[0.94, -1.37, 0]}>
                <EditorButton
                  label="Next"
                  disabled={page.index + 1 >= page.count}
                  onPress={() => controls.setPage(page.index + 1)}
                />
              </group>
            </>
          )}
          <Text
            position={[-1.35, -1.63, 0]}
            fontSize={0.064}
            anchorX="left"
            maxWidth={2.7}
            color={
              controls.error || controls.pendingPath ? '#ffbd89' : '#9aaed0'
            }
          >
            {message}
          </Text>
        </group>
      </group>
    )
  )
}
