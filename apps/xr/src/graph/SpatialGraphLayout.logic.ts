import type { GraphNode, ProgramGraph } from '@/connection/protocol'
import type { Position3 } from '@/graph/CodeGraph.logic'

interface Cluster {
  node: GraphNode
  children: Cluster[]
  radius: number
  orbit: number
}

export class SpatialGraphLayoutLogic {
  static layout(graph: ProgramGraph): Map<string, Position3> {
    const nodes = [...graph.nodes].sort((left, right) =>
      left.id.localeCompare(right.id),
    )
    const byId = new Map(nodes.map((node) => [node.id, node]))
    const children = new Map<string, Set<string>>()
    const contained = new Set<string>()
    for (const edge of graph.edges) {
      if (
        edge.kind !== 'contains' ||
        !byId.has(edge.source) ||
        !byId.has(edge.target)
      ) {
        continue
      }
      const siblings = children.get(edge.source) ?? new Set<string>()
      siblings.add(edge.target)
      children.set(edge.source, siblings)
      contained.add(edge.target)
    }

    const visited = new Set<string>()
    const build = (node: GraphNode): Cluster => {
      visited.add(node.id)
      const descendants: Cluster[] = []
      for (const id of [...(children.get(node.id) ?? [])].sort()) {
        if (!visited.has(id)) {
          descendants.push(build(byId.get(id)!))
        }
      }
      const childRadius = Math.max(
        0,
        ...descendants.map((child) => child.radius),
      )
      // Children sit on a sphere around their parent; r * sqrt(n) * 1.2 still leaves ~4r
      // between neighbours, while the old factor of 2 compounded into huge nested clusters.
      // The `childRadius + 0.6` floor keeps a lone child's cluster clear of its parent.
      const orbit = descendants.length
        ? Math.max(
            0.95,
            childRadius + 0.6,
            childRadius * Math.sqrt(descendants.length) * 1.2,
          )
        : 0
      return {
        node,
        children: descendants,
        orbit,
        radius: orbit + Math.max(0.35, childRadius),
      }
    }
    const roots: Cluster[] = []
    for (const node of nodes.filter((node) => !contained.has(node.id))) {
      roots.push(build(node))
    }
    // Preserve orphaned symbols and malformed containment cycles without recursing forever.
    for (const node of nodes) {
      if (!visited.has(node.id)) {
        roots.push(build(node))
      }
    }

    const positions = new Map<string, Position3>()
    if (roots.length === 0) {
      return positions
    }

    const side = Math.ceil(Math.cbrt(roots.length))
    const slots = roots.map((root, index) => ({
      root,
      layer: index % side,
      column: Math.floor(index / side) % side,
      row: Math.floor(index / (side * side)),
    }))
    const rowCount = Math.floor((roots.length - 1) / (side * side)) + 1
    const gap = 0.8
    // At rest only files are shown, so in a large workspace a cell is capped well below a
    // file's full symbol cluster, keeping the whole grid within roughly `targetExtent` per
    // axis. A selected file's symbols may then spill into neighbouring cells. Small
    // workspaces stay under the cap and keep fully separated clusters.
    const targetExtent = 30
    const cellCap = Math.max(0.35, (targetExtent / side - gap) / 2)

    // Each grid line's cell size comes only from the clusters that actually land on it, so
    // one huge file doesn't force wide spacing onto every other (likely much smaller) root.
    const slotRadii = (
      count: number,
      axis: 'layer' | 'column' | 'row',
    ): number[] => {
      const sizes = new Array(count).fill(0.35)
      for (const slot of slots) {
        sizes[slot[axis]] = Math.max(
          sizes[slot[axis]],
          Math.min(slot.root.radius, cellCap),
        )
      }
      return sizes
    }
    const toOffsets = (sizes: number[]): number[] => {
      const offsets: number[] = []
      let total = 0
      for (const size of sizes) {
        offsets.push(total)
        total += size * 2 + gap
      }
      return offsets
    }
    const layerSizes = slotRadii(side, 'layer')
    const columnSizes = slotRadii(side, 'column')
    const rowSizes = slotRadii(rowCount, 'row')
    const layerOffsets = toOffsets(layerSizes)
    const columnOffsets = toOffsets(columnSizes)
    const rowOffsets = toOffsets(rowSizes)

    for (const { root, layer, column, row } of slots) {
      this.place(
        root,
        [
          -2.4 - columnOffsets[column] - columnSizes[column] - layer * 0.35,
          1.4 - rowOffsets[row] - rowSizes[row] - layer * 0.25,
          -layerOffsets[layer] - layerSizes[layer],
        ],
        positions,
      )
    }
    return positions
  }

  private static place(
    cluster: Cluster,
    center: Position3,
    positions: Map<string, Position3>,
  ): void {
    positions.set(cluster.node.id, center)
    cluster.children.forEach((child, index) => {
      const y = 1 - (2 * (index + 0.5)) / cluster.children.length
      const radial = Math.sqrt(1 - y * y)
      const angle = 0.7 + index * Math.PI * (3 - Math.sqrt(5))
      this.place(
        child,
        [
          center[0] + cluster.orbit * radial * Math.cos(angle),
          center[1] + cluster.orbit * y,
          center[2] + cluster.orbit * radial * Math.sin(angle),
        ],
        positions,
      )
    })
  }
}
