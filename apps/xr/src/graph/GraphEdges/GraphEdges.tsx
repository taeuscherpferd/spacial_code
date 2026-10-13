import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  InstancedMesh,
  Object3D,
  Vector3,
} from 'three'
import type { GraphEdge, GraphNode } from '@/connection/protocol'
import type { Position3 } from '@/graph/CodeGraph.logic'
import {
  type EdgeArrow,
  GraphEdgesLogic,
  exportColor,
} from '@/graph/GraphEdges/GraphEdges.logic'

interface GraphEdgesProps {
  edges: readonly GraphEdge[]
  positions: ReadonlyMap<string, Position3>
  nodes: ReadonlyMap<string, GraphNode>
}

const arrowLength = 0.14
const arrowRadius = 0.05
const up = new Vector3(0, 1, 0)
const dummy = new Object3D()
const direction = new Vector3()
const color = new Color()

/** A geometry holding the given attributes, disposed when it's replaced or unmounted. */
const useGeometry = (
  attributes: Record<string, Float32Array>,
): BufferGeometry => {
  const geometry = useMemo(() => {
    const next = new BufferGeometry()
    for (const [name, values] of Object.entries(attributes)) {
      next.setAttribute(
        name,
        new BufferAttribute(values, name === 'lineDistance' ? 1 : 3),
      )
    }
    return next
  }, [attributes])
  useEffect(() => () => geometry.dispose(), [geometry])
  return geometry
}

const EdgeArrows = ({ arrows }: { arrows: readonly EdgeArrow[] }) => {
  const meshRef = useRef<InstancedMesh>(null)
  // Cone tip at the origin, pointing up, so each instance only needs a position and rotation.
  const cone = useMemo(
    () =>
      new ConeGeometry(arrowRadius, arrowLength, 12).translate(
        0,
        -arrowLength / 2,
        0,
      ),
    [],
  )
  useEffect(() => () => cone.dispose(), [cone])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) {
      return
    }
    arrows.forEach((arrow, index) => {
      dummy.position.set(...arrow.position)
      dummy.quaternion.setFromUnitVectors(up, direction.set(...arrow.direction))
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
      mesh.setColorAt(index, color.set(arrow.color))
    })
    mesh.count = arrows.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true
    }
  }, [arrows])

  return (
    <instancedMesh
      ref={meshRef}
      args={[cone, undefined, Math.max(arrows.length, 1)]}
      frustumCulled={false}
    >
      <meshBasicMaterial />
    </instancedMesh>
  )
}

/**
 * Every edge in a handful of draw calls: one line batch per style plus one instanced mesh
 * for all arrow heads. Memoised so camera-driven re-renders of the graph (detail level
 * changes) don't rebuild the buffers.
 */
export const GraphEdges = memo(
  ({ edges, positions, nodes }: GraphEdgesProps) => {
    const batches = useMemo(
      () => GraphEdgesLogic.batches(edges, positions, nodes),
      [edges, positions, nodes],
    )
    const structure = useGeometry(
      useMemo(
        () => ({
          position: batches.structure.positions,
          color: batches.structure.colors,
        }),
        [batches],
      ),
    )
    const links = useGeometry(
      useMemo(
        () => ({
          position: batches.links.positions,
          color: batches.links.colors,
        }),
        [batches],
      ),
    )
    const exports = useGeometry(
      useMemo(
        () => ({
          position: batches.exports.positions,
          lineDistance: batches.exports.distances,
        }),
        [batches],
      ),
    )

    return (
      <>
        <lineSegments geometry={structure} frustumCulled={false}>
          <lineBasicMaterial vertexColors transparent opacity={0.45} />
        </lineSegments>
        <lineSegments geometry={links} frustumCulled={false}>
          <lineBasicMaterial vertexColors transparent opacity={0.82} />
        </lineSegments>
        <lineSegments geometry={exports} frustumCulled={false}>
          <lineDashedMaterial
            color={exportColor}
            dashSize={0.06}
            gapSize={0.045}
            transparent
            opacity={0.9}
          />
        </lineSegments>
        <EdgeArrows arrows={batches.arrows} />
      </>
    )
  },
)
GraphEdges.displayName = 'GraphEdges'
