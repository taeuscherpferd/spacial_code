import type { GraphNode } from '@/connection/protocol'
import { EditorButton } from '@/editor/EditorButton/EditorButton'
import {
  GraphFilterLogic,
  externalModulesLabels,
} from '@/graph/GraphFilter/GraphFilter.logic'
import type { GraphFilterControls } from '@/graph/GraphFilter/hooks/useGraphFilters'
import {
  VrFilterPanelLogic,
  keyboardRows,
} from '@/graph/GraphFilter/VrFilterPanel/VrFilterPanel.logic'
import { VrWorkspaceRow } from '@/workspace/VrWorkspaceRow/VrWorkspaceRow'
import { WorkspaceBrowserLogic } from '@/workspace/WorkspaceBrowser/WorkspaceBrowser.logic'
import { RoundedBox, Text } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import {
  useXRControllerButtonEvent,
  useXRInputSourceState,
} from '@react-three/xr'
import { useEffect, useState } from 'react'
import { Quaternion, Vector3 } from 'three'

interface VrFilterPanelProps {
  controls: GraphFilterControls
  open: boolean
  onToggle: () => void
  onSelectNode: (node: GraphNode) => void
}

const keyPitch = 0.27
const resultRows = 4
const extensionsPerPage = 8

/** The filters menu for immersive sessions; the left controller's Y button shows and hides it. */
export const VrFilterPanel = ({
  controls,
  open,
  onToggle,
  onSelectNode,
}: VrFilterPanelProps) => {
  const gl = useThree((state) => state.gl)
  const controller = useXRInputSourceState('controller', 'left')
  const [extensionPage, setExtensionPage] = useState(0)
  const [placement, setPlacement] = useState<ReturnType<
    typeof VrFilterPanelLogic.placement
  > | null>(null)

  useXRControllerButtonEvent(controller, 'y-button', (state) => {
    if (state === 'pressed') onToggle()
  })

  useEffect(() => {
    if (!open) {
      setPlacement(null)
      return
    }
    const camera = gl.xr.getCamera()
    setPlacement(
      VrFilterPanelLogic.placement(
        camera.getWorldPosition(new Vector3()),
        camera.getWorldQuaternion(new Quaternion()),
      ),
    )
  }, [gl, open])

  if (!open || !placement) {
    return null
  }
  const { filters } = controls
  const type = (text: string) => controls.setQuery(filters.query + text)
  const extensions = WorkspaceBrowserLogic.page(
    controls.extensions,
    extensionPage,
    extensionsPerPage,
  )
  const hiddenResults = Math.max(0, controls.results.length - resultRows)

  return (
    <group
      position={placement.position}
      rotation={[0, placement.rotation, 0]}
      scale={0.42}
    >
      <RoundedBox
        args={[3, 4.6, 0.08]}
        position={[0, -0.05, 0]}
        radius={0.07}
        smoothness={4}
      >
        <meshBasicMaterial color="#0c1425" />
      </RoundedBox>
      <group position={[0, 0, 0.06]}>
        <Text position={[-1.35, 2.0, 0]} anchorX="left" fontSize={0.105}>
          Filters
          {controls.activeCount > 0 ? ` · ${controls.activeCount} on` : ''}
        </Text>
        <Text
          position={[1.35, 2.0, 0]}
          anchorX="right"
          fontSize={0.062}
          color="#9aaed0"
        >
          Y: hide / show
        </Text>

        <RoundedBox
          args={[2.7, 0.24, 0.02]}
          position={[0, 1.7, 0]}
          radius={0.03}
        >
          <meshBasicMaterial color="#070a12" />
        </RoundedBox>
        <Text
          position={[-1.29, 1.7, 0.02]}
          anchorX="left"
          fontSize={0.08}
          maxWidth={2.58}
          whiteSpace="nowrap"
          clipRect={[-0.01, -0.1, 2.58, 0.1]}
          color={filters.query ? '#f4f6ff' : '#7883a8'}
        >
          {filters.query ? `${filters.query}_` : 'Search files and symbols…'}
        </Text>

        {keyboardRows.map((row, rowIndex) =>
          [...row].map((key, keyIndex) => (
            <group
              key={key}
              position={[
                -1.215 + keyIndex * keyPitch,
                1.38 - rowIndex * 0.28,
                0,
              ]}
            >
              <EditorButton
                label={key}
                width={0.24}
                fontSize={0.09}
                onPress={() => type(key)}
              />
            </group>
          )),
        )}
        <group position={[-0.94, 0.26, 0]}>
          <EditorButton label="Space" width={0.8} onPress={() => type(' ')} />
        </group>
        <group position={[0, 0.26, 0]}>
          <EditorButton
            label="Delete"
            width={0.8}
            disabled={!filters.query}
            onPress={() =>
              controls.setQuery(VrFilterPanelLogic.backspace(filters.query))
            }
          />
        </group>
        <group position={[0.94, 0.26, 0]}>
          <EditorButton
            label="Clear"
            width={0.8}
            disabled={!filters.query}
            onPress={() => controls.setQuery('')}
          />
        </group>

        {controls.results.slice(0, resultRows).map((result, index) => (
          <group key={result.node.id} position={[0, -0.04 - index * 0.25, 0]}>
            <VrWorkspaceRow
              label={`${result.label}  ·  ${result.context}`}
              disabled={false}
              onPress={() => onSelectNode(result.node)}
            />
          </group>
        ))}
        {filters.query && controls.results.length === 0 && (
          <Text
            position={[-1.35, -0.04, 0]}
            anchorX="left"
            fontSize={0.064}
            color="#9aaed0"
          >
            No matches
          </Text>
        )}
        {hiddenResults > 0 && (
          <Text
            position={[1.35, -0.98, 0]}
            anchorX="right"
            fontSize={0.055}
            color="#9aaed0"
          >
            {`+${hiddenResults} more, keep typing to narrow`}
          </Text>
        )}

        <group position={[-0.925, -1.2, 0]}>
          <EditorButton
            label={filters.hideTests ? 'Tests: hidden' : 'Tests: shown'}
            active={filters.hideTests}
            fontSize={0.075}
            onPress={controls.toggleTests}
          />
        </group>
        <group position={[0.17, -1.2, 0]}>
          <EditorButton
            label={`Packages: ${externalModulesLabels[filters.externalModules]}`}
            active={filters.externalModules !== 'related'}
            width={1.25}
            fontSize={0.075}
            onPress={() =>
              controls.setExternalModules(
                VrFilterPanelLogic.nextModulesMode(filters.externalModules),
              )
            }
          />
        </group>
        <group position={[1.075, -1.2, 0]}>
          <EditorButton
            label="Reset"
            width={0.55}
            fontSize={0.075}
            disabled={controls.activeCount === 0}
            onPress={controls.reset}
          />
        </group>

        {extensions.rows.map(({ extension, count }, index) => {
          const hidden = filters.hiddenExtensions.includes(extension)
          return (
            <group
              key={extension}
              position={[
                -1.035 + (index % 4) * 0.69,
                -1.5 - Math.floor(index / 4) * 0.3,
                0,
              ]}
            >
              <EditorButton
                label={`${GraphFilterLogic.extensionLabel(extension)} ${count}`}
                active={!hidden}
                width={0.62}
                fontSize={0.07}
                onPress={() => controls.toggleExtension(extension)}
              />
            </group>
          )
        })}
        {extensions.count > 1 && (
          <>
            <group position={[-0.94, -2.12, 0]}>
              <EditorButton
                label="Previous"
                width={0.6}
                fontSize={0.07}
                disabled={extensions.index === 0}
                onPress={() => setExtensionPage(extensions.index - 1)}
              />
            </group>
            <Text position={[0, -2.12, 0]} fontSize={0.065}>
              {`Types ${extensions.index + 1} / ${extensions.count}`}
            </Text>
            <group position={[0.94, -2.12, 0]}>
              <EditorButton
                label="Next"
                width={0.6}
                fontSize={0.07}
                disabled={extensions.index + 1 >= extensions.count}
                onPress={() => setExtensionPage(extensions.index + 1)}
              />
            </group>
          </>
        )}
      </group>
    </group>
  )
}
