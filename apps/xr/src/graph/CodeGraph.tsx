import type { GraphNode, ProgramGraph } from '@/connection/protocol'
import { CodeGraphLogic, type Position3 } from '@/graph/CodeGraph.logic'
import { GraphEdges } from '@/graph/GraphEdges/GraphEdges'
import {
  GraphFilterLogic,
  type GraphFilters,
} from '@/graph/GraphFilter/GraphFilter.logic'
import { useGraphManipulation } from '@/graph/GraphManipulation/hooks/useGraphManipulation'
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
  const graphRef = useGraphManipulation()
  const [overrides, setOverrides] = useState<Map<string, Position3>>(new Map())
  const layout = useMemo(() => CodeGraphLogic.layout(graph), [graph])
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

  const detailedIds = useNodeDetailLod(
    graphRef,
    nodes,
    positions,
    alwaysDetailed,
  )

  const moveNode = (id: string, position: Position3): void => {
    setOverrides((current) => new Map(current).set(id, position))
  }

  return (
    <group ref={graphRef}>
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
  )
}
