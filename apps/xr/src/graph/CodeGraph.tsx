import { Line } from '@react-three/drei'
import { useMemo, useState } from 'react'
import { Quaternion, Vector3 } from 'three'
import type { GraphNode, ProgramGraph } from '@/connection/protocol'
import {
  type ArrowPlacement,
  CodeGraphLogic,
  type Position3,
  type ScopeOptions,
  defaultScopeOptions,
} from '@/graph/CodeGraph.logic'
import { GraphNodeView } from '@/graph/GraphNodeView'

interface CodeGraphProps {
  graph: ProgramGraph
  selectedNodeId: string | null
  collapsedNodeIds: ReadonlySet<string>
  focusedNodeId: string | null
  onSelect: (node: GraphNode) => void
  onToggleCollapsed: (id: string) => void
  onFocus: (id: string) => void
  scopeOptions?: ScopeOptions
}

const edgeColors = {
  contains: '#4a557e',
  imports: '#00cbb4',
  calls: '#e5a84b',
} as const

const exportColor = '#ff8a1f'
const exportLift = 0.06

const arrowLength = 0.14
const arrowRadius = 0.05
const up = new Vector3(0, 1, 0)

const EdgeArrow = ({
  position,
  direction,
  color,
}: ArrowPlacement & { color: string }) => {
  const quaternion = useMemo(
    () => new Quaternion().setFromUnitVectors(up, new Vector3(...direction)),
    [direction],
  )
  return (
    <group position={position} quaternion={quaternion}>
      <mesh position={[0, -arrowLength / 2, 0]}>
        <coneGeometry args={[arrowRadius, arrowLength, 24]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  )
}

export const CodeGraph = ({
  graph,
  selectedNodeId,
  collapsedNodeIds,
  focusedNodeId,
  onSelect,
  onToggleCollapsed,
  onFocus,
  scopeOptions = defaultScopeOptions,
}: CodeGraphProps) => {
  const [overrides, setOverrides] = useState<Map<string, Position3>>(new Map())
  const positions = useMemo(
    () =>
      CodeGraphLogic.mergePositions(CodeGraphLogic.layout(graph), overrides),
    [graph, overrides],
  )
  const visible = useMemo(
    () => CodeGraphLogic.visible(graph, collapsedNodeIds, focusedNodeId),
    [collapsedNodeIds, focusedNodeId, graph],
  )
  const nodesById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph],
  )
  const selectedNode = selectedNodeId
    ? (nodesById.get(selectedNodeId) ?? null)
    : null
  const { nodes, edges } = useMemo(
    () => CodeGraphLogic.scoped(visible, selectedNode, scopeOptions),
    [scopeOptions, selectedNode, visible],
  )
  const liftedExports = useMemo(
    () => CodeGraphLogic.overlappingExportEdges(edges, nodesById),
    [edges, nodesById],
  )

  const moveNode = (id: string, position: Position3): void => {
    setOverrides((current) => new Map(current).set(id, position))
  }

  return (
    <group>
      {edges.map((edge) => {
        const source = positions.get(edge.source)
        const target = positions.get(edge.target)
        if (!source || !target) {
          return null
        }
        // Import and call edges run importer -> imported and caller -> callee; the arrow
        // points into the importer / caller.
        const sourceKind = nodesById.get(edge.source)?.kind
        const arrow =
          (edge.kind === 'imports' || edge.kind === 'calls') && sourceKind
            ? CodeGraphLogic.arrowHead(
                source,
                target,
                CodeGraphLogic.nodeRadius(sourceKind) + 0.02,
              )
            : null
        if (CodeGraphLogic.isExportEdge(edge, nodesById)) {
          // Sits just above a solid call line between the same two nodes.
          const lift = liftedExports.has(edge.id) ? exportLift : 0
          return (
            <Line
              key={edge.id}
              points={[
                [source[0], source[1] + lift, source[2]],
                [target[0], target[1] + lift, target[2]],
              ]}
              color={exportColor}
              lineWidth={1.5}
              dashed
              dashSize={0.06}
              gapSize={0.045}
              transparent
              opacity={0.9}
            />
          )
        }
        return (
          <group key={edge.id}>
            <Line
              points={[source, target]}
              color={edgeColors[edge.kind]}
              lineWidth={edge.kind === 'calls' ? 2 : 1}
              transparent
              opacity={edge.kind === 'contains' ? 0.45 : 0.82}
            />
            {arrow && <EdgeArrow {...arrow} color={edgeColors[edge.kind]} />}
          </group>
        )
      })}
      {nodes.map((node) => {
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
