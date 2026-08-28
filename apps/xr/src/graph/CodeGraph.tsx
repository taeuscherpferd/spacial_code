import { Line } from '@react-three/drei'
import { useMemo, useState } from 'react'
import type { GraphNode, ProgramGraph } from '@/connection/protocol'
import { CodeGraphLogic, type Position3 } from '@/graph/CodeGraph.logic'
import { GraphNodeView } from '@/graph/GraphNodeView'

interface CodeGraphProps {
  graph: ProgramGraph
  selectedNodeId: string | null
  collapsedNodeIds: ReadonlySet<string>
  focusedNodeId: string | null
  onSelect: (node: GraphNode) => void
  onToggleCollapsed: (id: string) => void
  onFocus: (id: string) => void
}

const edgeColors = {
  contains: '#4a557e',
  imports: '#00cbb4',
  calls: '#e5a84b',
} as const

export const CodeGraph = ({
  graph,
  selectedNodeId,
  collapsedNodeIds,
  focusedNodeId,
  onSelect,
  onToggleCollapsed,
  onFocus,
}: CodeGraphProps) => {
  const [overrides, setOverrides] = useState<Map<string, Position3>>(new Map())
  const positions = useMemo(
    () => CodeGraphLogic.mergePositions(CodeGraphLogic.layout(graph), overrides),
    [graph, overrides],
  )
  const visible = useMemo(
    () => CodeGraphLogic.visible(graph, collapsedNodeIds, focusedNodeId),
    [collapsedNodeIds, focusedNodeId, graph],
  )

  const moveNode = (id: string, position: Position3): void => {
    setOverrides((current) => new Map(current).set(id, position))
  }

  return (
    <group>
      {visible.edges.map((edge) => {
        const source = positions.get(edge.source)
        const target = positions.get(edge.target)
        if (!source || !target) {
          return null
        }
        return (
          <Line
            key={edge.id}
            points={[source, target]}
            color={edgeColors[edge.kind]}
            lineWidth={edge.kind === 'calls' ? 2 : 1}
            transparent
            opacity={edge.kind === 'contains' ? 0.45 : 0.82}
          />
        )
      })}
      {visible.nodes.map((node) => {
        const position = positions.get(node.id)
        if (!position) {
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
            onSelect={onSelect}
            onToggleCollapsed={onToggleCollapsed}
            onFocus={onFocus}
          />
        )
      })}
    </group>
  )
}

