import type { GraphNode, ProgramGraph } from '@/connection/protocol'
import { CodeGraphLogic, type Position3 } from '@/graph/CodeGraph.logic'
import { GraphClusterLogic } from '@/graph/GraphCluster/GraphCluster.logic'
import { GraphGroupRegions } from '@/graph/GraphCluster/GraphGroupRegions'
import { GraphEdges } from '@/graph/GraphEdges/GraphEdges'
import {
  GraphFilterLogic,
  type GraphFilters,
} from '@/graph/GraphFilter/GraphFilter.logic'
import {
  grabCursorRadius,
  useGraphManipulation,
} from '@/graph/GraphManipulation/hooks/useGraphManipulation'
import { GraphNodeInstances } from '@/graph/GraphNodeInstances'
import { GraphNodeView } from '@/graph/GraphNodeView'
import { useCameraFit } from '@/graph/useCameraFit'
import { useNodeDetailLod } from '@/graph/useNodeDetailLod'
import { useMemo, useState } from 'react'

interface CodeGraphProps {
  graph: ProgramGraph
  selectedNodeId: string | null
  collapsedNodeIds: ReadonlySet<string>
  focusedNodeId: string | null
  onDraggingChange: (dragging: boolean) => void
  onSelect: (node: GraphNode) => void
  onToggleCollapsed: (id: string) => void
  onFocus: (id: string) => void
  filters: GraphFilters
}

export const CodeGraph = ({
  graph,
  selectedNodeId,
  collapsedNodeIds,
  focusedNodeId,
  onSelect,
  onDraggingChange,
  onToggleCollapsed,
  onFocus,
  filters,
}: CodeGraphProps) => {
  const [overrides, setOverrides] = useState<Map<string, Position3>>(new Map())
  const { groupBy } = filters
  // Regrouping moves every node, so earlier drags no longer make sense where they were.
  const [overridesGroupBy, setOverridesGroupBy] = useState(groupBy)
  if (overridesGroupBy !== groupBy) {
    setOverridesGroupBy(groupBy)
    setOverrides(new Map())
  }
  const groups = useMemo(
    () => GraphClusterLogic.groups(graph, groupBy),
    [graph, groupBy],
  )
  const { positions: layout, regions } = useMemo(
    () => CodeGraphLogic.layout(graph, groups),
    [graph, groups],
  )
  const positions = useMemo(
    () => CodeGraphLogic.mergePositions(layout, overrides),
    [layout, overrides],
  )
  // Frame the files, which is what's shown at rest; symbol clusters only appear on selection.
  const bounds = useMemo(() => {
    const files = new Map(
      graph.nodes
        .filter((node) => node.kind === 'file' && layout.has(node.id))
        .map((node) => [node.id, layout.get(node.id)!]),
    )
    return CodeGraphLogic.bounds(files.size ? files : layout)
  }, [graph, layout])
  useCameraFit(bounds)
  const filtered = useMemo(
    () => GraphFilterLogic.apply(graph, filters),
    [filters, graph],
  )
  const visible = useMemo(
    () => CodeGraphLogic.visible(filtered, collapsedNodeIds, focusedNodeId),
    [collapsedNodeIds, filtered, focusedNodeId],
  )
  const nodesById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph],
  )
  const selectedNode = selectedNodeId
    ? (nodesById.get(selectedNodeId) ?? null)
    : null
  const showModules = filters.externalModules === 'all'
  const { nodes, edges } = useMemo(
    () => CodeGraphLogic.scoped(visible, selectedNode, { showModules }),
    [showModules, selectedNode, visible],
  )
  const visibleIds = useMemo(
    () => new Set(nodes.map((node) => node.id)),
    [nodes],
  )
  const alwaysDetailed = useMemo(() => {
    const ids = new Set<string>()
    if (selectedNodeId) {
      ids.add(selectedNodeId)
    }
    if (focusedNodeId) {
      ids.add(focusedNodeId)
    }
    return ids
  }, [selectedNodeId, focusedNodeId])

  const moveNode = (id: string, position: Position3): void => {
    setOverrides((current) => new Map(current).set(id, position))
  }
  const { groupRef: graphRef, cursors } = useGraphManipulation({
    nodes,
    positions,
    onMoveNode: moveNode,
  })

  const detailedIds = useNodeDetailLod(
    graphRef,
    nodes,
    positions,
    alwaysDetailed,
  )

  return (
    <>
      <group ref={graphRef}>
        {filters.showGroups && (
          <GraphGroupRegions regions={regions} visibleIds={visibleIds} />
        )}
        <GraphEdges edges={edges} positions={positions} nodes={nodesById} />
        <GraphNodeInstances
          nodes={nodes}
          positions={positions}
          detailedIds={detailedIds}
          onSelect={onSelect}
        />
        {nodes.map((node) => {
          const position = positions.get(node.id)
          if (!position || !detailedIds.has(node.id)) {
            return null
          }
          return (
            <GraphNodeView
              key={node.id}
              node={node}
              position={position}
              selected={node.id === selectedNodeId}
              collapsed={collapsedNodeIds.has(node.id)}
              onMove={moveNode}
              onDraggingChange={onDraggingChange}
              onSelect={onSelect}
              onToggleCollapsed={onToggleCollapsed}
              onFocus={onFocus}
            />
          )
        })}
      </group>
      {/* Outside the graph, so the cursors keep their size when it's scaled. */}
      {(['left', 'right'] as const).map((hand) => (
        <mesh
          key={hand}
          ref={cursors[hand]}
          visible={false}
          raycast={() => undefined}
        >
          <sphereGeometry args={[grabCursorRadius, 24, 16]} />
          <meshBasicMaterial transparent depthWrite={false} />
        </mesh>
      ))}
    </>
  )
}
