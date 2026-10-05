import type { ThreeEvent } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import type { GraphNode } from '@/connection/protocol'
import {
  CodeGraphLogic,
  nodeColors,
  type Position3,
} from '@/graph/CodeGraph.logic'

interface GraphNodeInstancesProps {
  nodes: readonly GraphNode[]
  positions: ReadonlyMap<string, Position3>
  /** Nodes rendered separately (full mesh + label) and hidden here to avoid drawing twice. */
  detailedIds: ReadonlySet<string>
  onSelect: (node: GraphNode) => void
}

const dummy = new Object3D()
const color = new Color()
// Unit sphere; per-node size comes from the instance scale instead of separate geometry.
const sphereSegments: [radius: number, width: number, height: number] = [
  1, 16, 12,
]

/**
 * Cheap stand-in for every node: one draw call via InstancedMesh instead of a mesh +
 * material + billboard + text per node. Nodes promoted to full detail (see
 * `useNodeDetailLod`) are scaled to zero here so they aren't drawn twice.
 */
export const GraphNodeInstances = ({
  nodes,
  positions,
  detailedIds,
  onSelect,
}: GraphNodeInstancesProps) => {
  const meshRef = useRef<InstancedMesh>(null)
  const placedNodes = useMemo(
    () => nodes.filter((node) => positions.has(node.id)),
    [nodes, positions],
  )

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) {
      return
    }
    placedNodes.forEach((node, index) => {
      const position = positions.get(node.id)!
      const hidden = detailedIds.has(node.id)
      const radius = hidden ? 0 : CodeGraphLogic.nodeRadius(node.kind)
      dummy.position.set(...position)
      dummy.scale.setScalar(radius)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
      mesh.setColorAt(index, color.set(nodeColors[node.kind]))
    })
    mesh.count = placedNodes.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true
    }
  }, [placedNodes, positions, detailedIds])

  const handleClick = (event: ThreeEvent<MouseEvent>): void => {
    event.stopPropagation()
    if (event.instanceId === undefined) {
      return
    }
    const node = placedNodes[event.instanceId]
    if (node) {
      onSelect(node)
    }
  }

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, Math.max(placedNodes.length, 1)]}
      onClick={handleClick}
    >
      <sphereGeometry args={sphereSegments} />
      <meshStandardMaterial roughness={0.9} metalness={0} />
    </instancedMesh>
  )
}
