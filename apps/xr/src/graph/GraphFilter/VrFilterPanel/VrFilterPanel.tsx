import type { GraphNode } from '@/connection/protocol'
import { groupModeLabels } from '@/graph/GraphCluster/GraphCluster.logic'
import {
  GraphFilterLogic,
  externalModulesLabels,
} from '@/graph/GraphFilter/GraphFilter.logic'
import type { GraphFilterControls } from '@/graph/GraphFilter/hooks/useGraphFilters'
import {
  VrFilterPanelLogic,
  keyboardRows,
} from '@/graph/GraphFilter/VrFilterPanel/VrFilterPanel.logic'
import { VrButton } from '@/ui/VrButton/VrButton'
import { VrLine } from '@/ui/VrLine/VrLine'
import { VrPanel } from '@/ui/VrPanel/VrPanel'
import { VrWorkspaceRow } from '@/workspace/VrWorkspaceRow/VrWorkspaceRow'
import { WorkspaceBrowserLogic } from '@/workspace/WorkspaceBrowser/WorkspaceBrowser.logic'
import { useThree } from '@react-three/fiber'
import { Container, Input, Text } from '@react-three/uikit'
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
      <VrPanel width={600} height={1020}>
        <Container flexDirection="row" alignItems="center" gap={10}>
          <VrLine
            text={`Filters${controls.activeCount > 0 ? ` · ${controls.activeCount} on` : ''}`}
            fontSize={21}
          />
          <Text fontSize={12} color="#9aaed0">
            Y: hide / show
          </Text>
        </Container>

        <Input
          value={filters.query}
          onValueChange={controls.setQuery}
          placeholder="Search files and symbols..."
          height={48}
          flexShrink={0}
          paddingX={12}
          borderRadius={6}
          fontSize={16}
          backgroundColor="#070a12"
          color="#f4f6ff"
          caretColor="#f4f6ff"
          placeholderStyle={{ color: '#7883a8' }}
        />

        <Container flexDirection="column" gap={4}>
          {keyboardRows.map((row) => (
            <Container key={row} flexDirection="row" gap={6}>
              {[...row].map((key) => (
                <VrButton
                  key={key}
                  label={key}
                  width={48}
                  fontSize={18}
                  onPress={() => type(key)}
                />
              ))}
            </Container>
          ))}
        </Container>
        <Container flexDirection="row" gap={28}>
          <VrButton label="Space" width={160} onPress={() => type(' ')} />
          <VrButton
            label="Delete"
            width={160}
            disabled={!filters.query}
            onPress={() =>
              controls.setQuery(VrFilterPanelLogic.backspace(filters.query))
            }
          />
          <VrButton
            label="Clear"
            width={160}
            disabled={!filters.query}
            onPress={() => controls.setQuery('')}
          />
        </Container>

        <Container
          flexDirection="column"
          height={resultRows * 50 + 16}
          flexShrink={0}
          gap={6}
        >
          {controls.results.slice(0, resultRows).map((result) => (
            <VrWorkspaceRow
              key={result.node.id}
              label={`${result.label}  ·  ${result.context}`}
              disabled={false}
              onPress={() => onSelectNode(result.node)}
            />
          ))}
          {filters.query && controls.results.length === 0 && (
            <Text fontSize={13} color="#9aaed0">
              No matches
            </Text>
          )}
          {hiddenResults > 0 && (
            <Text width="100%" textAlign="right" fontSize={11} color="#9aaed0">
              {`+${hiddenResults} more, keep typing to narrow`}
            </Text>
          )}
        </Container>

        <Container flexDirection="row" gap={10}>
          <VrButton
            label={filters.hideTests ? 'Tests: hidden' : 'Tests: shown'}
            active={filters.hideTests}
            width={170}
            fontSize={15}
            onPress={controls.toggleTests}
          />
          <VrButton
            label={`Packages: ${externalModulesLabels[filters.externalModules]}`}
            active={filters.externalModules !== 'related'}
            width={250}
            fontSize={15}
            onPress={() =>
              controls.setExternalModules(
                VrFilterPanelLogic.nextModulesMode(filters.externalModules),
              )
            }
          />
          <VrButton
            label="Reset"
            width={100}
            fontSize={15}
            disabled={controls.activeCount === 0}
            onPress={controls.reset}
          />
        </Container>
        <Container flexDirection="row" gap={20}>
          <VrButton
            label={`Group by: ${groupModeLabels[filters.groupBy]}`}
            active={filters.groupBy !== 'connectivity'}
            width={280}
            fontSize={15}
            onPress={() =>
              controls.setGroupBy(
                VrFilterPanelLogic.nextGroupMode(filters.groupBy),
              )
            }
          />
          <VrButton
            label={filters.showGroups ? 'Names: shown' : 'Names: hidden'}
            active={!filters.showGroups}
            width={240}
            fontSize={15}
            disabled={filters.groupBy === 'none'}
            onPress={controls.toggleShowGroups}
          />
        </Container>

        <Container flexDirection="row" flexWrap="wrap" gap={14}>
          {extensions.rows.map(({ extension, count }) => (
            <VrButton
              key={extension}
              label={`${GraphFilterLogic.extensionLabel(extension)} ${count}`}
              active={!filters.hiddenExtensions.includes(extension)}
              width={124}
              fontSize={14}
              onPress={() => controls.toggleExtension(extension)}
            />
          ))}
        </Container>
        {extensions.count > 1 && (
          <Container
            flexDirection="row"
            alignItems="center"
            justifyContent="space-between"
          >
            <VrButton
              label="Previous"
              width={120}
              fontSize={14}
              disabled={extensions.index === 0}
              onPress={() => setExtensionPage(extensions.index - 1)}
            />
            <Text fontSize={13}>
              {`Types ${extensions.index + 1} / ${extensions.count}`}
            </Text>
            <VrButton
              label="Next"
              width={120}
              fontSize={14}
              disabled={extensions.index + 1 >= extensions.count}
              onPress={() => setExtensionPage(extensions.index + 1)}
            />
          </Container>
        )}
      </VrPanel>
    </group>
  )
}
