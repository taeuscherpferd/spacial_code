import type { GraphNode, ProgramGraph } from '@/connection/protocol'
import type { Position3 } from '@/graph/CodeGraph.logic'
import type { GraphGroup } from '@/graph/GraphCluster/GraphCluster.logic'

interface Cluster {
  node: GraphNode
  children: Cluster[]
  radius: number
  orbit: number
}

/** Where a group ended up, for drawing its outline and label. */
export interface GroupRegion {
  id: string
  label: string
  detail: string
  center: Position3
  radius: number
  rootIds: string[]
}

export interface GraphLayout {
  positions: Map<string, Position3>
  regions: GroupRegion[]
}

const gap = 0.8

export class SpatialGraphLayoutLogic {
  static layout(
    graph: ProgramGraph,
    groups: readonly GraphGroup[] = [],
  ): GraphLayout {
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
    const regions: GroupRegion[] = []
    if (roots.length === 0) {
      return { positions, regions }
    }

    // At rest only files are shown, so in a large workspace a cell is capped well below a
    // file's full symbol cluster, keeping the whole grid within roughly `targetExtent` per
    // axis. A selected file's symbols may then spill into neighbouring cells. Small
    // workspaces stay under the cap and keep fully separated clusters.
    const targetExtent = 30
    const cellCap = Math.max(
      0.35,
      (targetExtent / Math.ceil(Math.cbrt(roots.length)) - gap) / 2,
    )
    const origin: Position3 = [-2.4, 1.4, 0]

    if (groups.length === 0) {
      const cells = this.grid(
        roots.map((root) => Math.min(root.radius, cellCap)),
        gap,
      )
      roots.forEach((root, index) =>
        this.place(root, this.add(origin, cells.corners[index]), positions),
      )
      return { positions, regions }
    }

    // Each group packs its own files into a small grid, then the groups are laid out in a
    // grid of their own with wider gaps, so the groups read as separate islands.
    const rootsById = new Map(roots.map((root) => [root.node.id, root]))
    const placed = new Set<string>()
    const members = groups.map((group) =>
      group.rootIds.flatMap((id) => {
        const root = rootsById.get(id)
        if (!root || placed.has(id)) return []
        placed.add(id)
        return [root]
      }),
    )
    // Anything no group claimed still needs a spot.
    const leftovers = roots.filter((root) => !placed.has(root.node.id))
    const islands = [
      ...groups
        .map((group, index) => ({ group, roots: members[index] }))
        .filter((island) => island.roots.length > 0),
      ...leftovers.map((root) => ({ group: null, roots: [root] })),
    ].map((island) => {
      const cells = this.grid(
        island.roots.map((root) => Math.min(root.radius, cellCap)),
        gap,
      )
      return { ...island, cells }
    })
    const outer = this.grid(
      islands.map((island) => island.cells.radius),
      gap * 3,
    )
    islands.forEach((island, index) => {
      const center = this.add(origin, outer.corners[index])
      island.roots.forEach((root, member) =>
        this.place(
          root,
          this.add(center, island.cells.centers[member]),
          positions,
        ),
      )
      if (island.group) {
        regions.push({
          id: island.group.id,
          label: island.group.label,
          detail: island.group.detail,
          center,
          radius: island.cells.radius,
          rootIds: island.roots.map((root) => root.node.id),
        })
      }
    })
    return { positions, regions }
  }

  /**
   * Packs spheres of the given radii into a roughly cubic grid, centred on the origin. Each
   * grid line's cell size comes only from the spheres that land on it, so one huge file
   * doesn't force wide spacing onto every other (likely much smaller) one. Later layers are
   * nudged sideways and down a little so they don't hide straight behind the first.
   */
  private static grid(
    radii: readonly number[],
    gap: number,
  ): { corners: Position3[]; centers: Position3[]; radius: number } {
    const side = Math.ceil(Math.cbrt(radii.length))
    const slots = radii.map((radius, index) => ({
      radius,
      layer: index % side,
      column: Math.floor(index / side) % side,
      row: Math.floor(index / (side * side)),
    }))
    const rowCount = Math.floor((radii.length - 1) / (side * side)) + 1
    const slotRadii = (
      count: number,
      axis: 'layer' | 'column' | 'row',
    ): number[] => {
      const sizes = new Array(count).fill(0.35)
      for (const slot of slots) {
        sizes[slot[axis]] = Math.max(sizes[slot[axis]], slot.radius)
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

    const corners = slots.map(({ layer, column, row }): Position3 => [
      -columnOffsets[column] - columnSizes[column] - layer * 0.35,
      -rowOffsets[row] - rowSizes[row] - layer * 0.25,
      -layerOffsets[layer] - layerSizes[layer],
    ])
    const middle = [0, 1, 2].map((axis) => {
      const values = corners.map((corner) => corner[axis])
      return (Math.min(...values) + Math.max(...values)) / 2
    })
    const centers = corners.map((corner): Position3 => [
      corner[0] - middle[0],
      corner[1] - middle[1],
      corner[2] - middle[2],
    ])
    const radius = Math.max(
      ...centers.map((center, index) => Math.hypot(...center) + radii[index]),
    )
    return { corners, centers, radius }
  }

  private static add(left: Position3, right: Position3): Position3 {
    return [left[0] + right[0], left[1] + right[1], left[2] + right[2]]
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
