import { useFrame, useThree } from '@react-three/fiber'
import { Container, Text } from '@react-three/uikit'
import {
  useXRControllerButtonEvent,
  useXRInputSourceState,
} from '@react-three/xr'
import { useState } from 'react'
import { Quaternion, Vector3 } from 'three'
import { VrButton } from '@/ui/VrButton/VrButton'
import { VrLine } from '@/ui/VrLine/VrLine'
import { VrPanel } from '@/ui/VrPanel/VrPanel'
import { VrTextLogic } from '@/ui/VrText.logic'
import type { WorkspaceBrowserControls } from '@/workspace/WorkspaceBrowser/hooks/useWorkspaceBrowser'
import { WorkspaceBrowserLogic } from '@/workspace/WorkspaceBrowser/WorkspaceBrowser.logic'
import { VrWorkspaceRow } from '@/workspace/VrWorkspaceRow/VrWorkspaceRow'
import { useThumbstickScroll } from '@/scene/hooks/useThumbstickScroll'

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
      ? (controls.listing
          ? WorkspaceBrowserLogic.folderRows(controls.listing)
          : []
        ).map((row) => ({
          ...row,
          label: WorkspaceBrowserLogic.folderLabel(row),
          directory: true,
        }))
      : controls.rows.map((row) => ({
          ...row,
          label: WorkspaceBrowserLogic.label(row),
        }))
  const page = WorkspaceBrowserLogic.page(items, controls.page)
  // The list is paged rather than scrolled, so the stick turns pages, more slowly.
  const thumbstick = useThumbstickScroll(
    (steps) =>
      controls.setPage(
        Math.min(Math.max(page.index + steps, 0), page.count - 1),
      ),
    3,
  )
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
        {...thumbstick}
        position={placement.position}
        rotation={[0, placement.rotation, 0]}
        scale={0.55}
      >
        <VrPanel width={600} height={730}>
          <VrLine
            text={`${controls.workspace?.name ?? 'Workspace'} · ${controls.fileCount} TS`}
            fontSize={21}
          />
          <Container flexDirection="row" gap={18}>
            <VrButton
              label="Choose"
              width={170}
              disabled={controls.disabled}
              onPress={() => {
                setRecent(false)
                controls.browse(controls.workspace?.root ?? '')
              }}
            />
            <VrButton
              label="Files"
              width={170}
              onPress={() => {
                setRecent(false)
                controls.closeBrowser()
              }}
            />
            <VrButton
              label="Recent"
              width={170}
              disabled={controls.disabled}
              onPress={() => {
                setRecent(true)
                controls.setPage(0)
              }}
            />
          </Container>
          <VrLine
            text={
              controls.pendingPath ??
              (recent
                ? 'Recent projects on server computer'
                : controls.browsing
                  ? (controls.listing?.path ?? 'Folders on server computer')
                  : (controls.workspace?.root ?? 'Connecting…'))
            }
            fontSize={12}
          />
          {controls.browsing && !recent && (
            <VrButton
              label="Open folder"
              width={170}
              disabled={controls.disabled || !controls.listing}
              onPress={() =>
                controls.listing && controls.requestOpen(controls.listing.path)
              }
            />
          )}
          <Container flexDirection="column" flexGrow={1} gap={6}>
            {page.rows.map((row) => (
              <VrWorkspaceRow
                key={row.path}
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
            ))}
          </Container>
          <Container flexDirection="row" gap={18} alignItems="center">
            {controls.pendingPath ? (
              <>
                <VrButton
                  label="Keep draft & open"
                  width={170}
                  fontSize={15}
                  disabled={controls.disabled}
                  onPress={controls.confirmOpen}
                />
                <VrButton
                  label="Cancel"
                  width={170}
                  onPress={controls.cancelOpen}
                />
              </>
            ) : (
              <>
                <VrButton
                  label="Previous"
                  width={170}
                  disabled={page.index === 0}
                  onPress={() => controls.setPage(page.index - 1)}
                />
                <Container width={170} justifyContent="center">
                  <Text fontSize={15}>
                    {page.index + 1} / {page.count}
                  </Text>
                </Container>
                <VrButton
                  label="Next"
                  width={170}
                  disabled={page.index + 1 >= page.count}
                  onPress={() => controls.setPage(page.index + 1)}
                />
              </>
            )}
          </Container>
          <Text
            fontSize={13}
            color={
              controls.error || controls.pendingPath ? '#ffbd89' : '#9aaed0'
            }
          >
            {VrTextLogic.ascii(message)}
          </Text>
        </VrPanel>
      </group>
    )
  )
}
