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
      const orbit = descendants.length
        ? Math.max(0.95, childRadius * Math.sqrt(descendants.length) * 2)
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
    const radius = Math.max(0.35, ...roots.map((root) => root.radius))
    const spacing = radius * 2 + 0.8
    const side = Math.ceil(Math.cbrt(roots.length))
    roots.forEach((root, index) => {
      const layer = index % side
      const column = Math.floor(index / side) % side
      const row = Math.floor(index / (side * side))
      this.place(
        root,
        [
          -2.4 - radius - column * spacing - layer * 0.35,
          1.4 - row * spacing - layer * 0.25,
          -radius - layer * spacing,
        ],
        positions,
      )
    })
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
