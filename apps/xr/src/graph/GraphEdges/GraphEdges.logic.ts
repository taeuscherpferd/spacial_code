import { Color } from 'three'
import type { GraphEdge, GraphNode } from '@/connection/protocol'
import {
  type ArrowPlacement,
  CodeGraphLogic,
  type Position3,
} from '@/graph/CodeGraph.logic'

export const edgeColors = {
  contains: '#4a557e',
  imports: '#00cbb4',
  calls: '#e5a84b',
} as const

export const exportColor = '#ff8a1f'
const exportLift = 0.06

/** Line segments drawn in one call: two vertices (xyz) and two colours (rgb) per edge. */
export interface SegmentBatch {
  positions: Float32Array
  colors: Float32Array
}

/** Dashed segments; `distances` is each vertex's distance along its own segment. */
export interface DashedBatch {
  positions: Float32Array
  distances: Float32Array
}

export interface EdgeArrow extends ArrowPlacement {
  color: string
}

export interface EdgeBatches {
  /** Faint `contains` lines. */
  structure: SegmentBatch
  /** Import and call lines. */
  links: SegmentBatch
  /** Dashed export lines. */
  exports: DashedBatch
  arrows: EdgeArrow[]
}

const color = new Color()

const toBatch = (positions: number[], colors: number[]): SegmentBatch => ({
  positions: new Float32Array(positions),
  colors: new Float32Array(colors),
})

const pushSegment = (
  positions: number[],
  colors: number[],
  source: Position3,
  target: Position3,
  hex: string,
): void => {
  positions.push(...source, ...target)
  color.set(hex)
  colors.push(color.r, color.g, color.b, color.r, color.g, color.b)
}

export class GraphEdgesLogic {
  /**
   * Packs every drawable edge into a few flat buffers, so the whole graph's edges cost a
   * handful of draw calls rather than one mesh (and one arrow mesh) per edge.
   */
  static batches(
    edges: readonly GraphEdge[],
    positions: ReadonlyMap<string, Position3>,
    nodes: ReadonlyMap<string, GraphNode>,
  ): EdgeBatches {
    const lifted = CodeGraphLogic.overlappingExportEdges(edges, nodes)
    const structure = { positions: [] as number[], colors: [] as number[] }
    const links = { positions: [] as number[], colors: [] as number[] }
    const exportPositions: number[] = []
    const exportDistances: number[] = []
    const arrows: EdgeArrow[] = []

    for (const edge of edges) {
      const source = positions.get(edge.source)
      const target = positions.get(edge.target)
      if (!source || !target) {
        continue
      }
      if (CodeGraphLogic.isExportEdge(edge, nodes)) {
        // Sits just above a solid call line between the same two nodes.
        const lift = lifted.has(edge.id) ? exportLift : 0
        exportPositions.push(
          source[0],
          source[1] + lift,
          source[2],
          target[0],
          target[1] + lift,
          target[2],
        )
        exportDistances.push(
          0,
          Math.hypot(
            target[0] - source[0],
            target[1] - source[1],
            target[2] - source[2],
          ),
        )
        continue
      }
      const hex = edgeColors[edge.kind]
      const batch = edge.kind === 'contains' ? structure : links
      pushSegment(batch.positions, batch.colors, source, target, hex)
      // Import and call edges run importer -> imported and caller -> callee; the arrow
      // points into the importer / caller.
      const sourceKind = nodes.get(edge.source)?.kind
      if (edge.kind !== 'contains' && sourceKind) {
        const arrow = CodeGraphLogic.arrowHead(
          source,
          target,
          CodeGraphLogic.nodeRadius(sourceKind) + 0.02,
        )
        if (arrow) {
          arrows.push({ ...arrow, color: hex })
        }
      }
    }

    return {
      structure: toBatch(structure.positions, structure.colors),
      links: toBatch(links.positions, links.colors),
      exports: {
        positions: new Float32Array(exportPositions),
        distances: new Float32Array(exportDistances),
      },
      arrows,
    }
  }
}
