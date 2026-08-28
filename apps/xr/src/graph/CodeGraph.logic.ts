import type { GraphEdge, GraphNode, ProgramGraph } from '@/connection/protocol'

export type Position3 = [number, number, number]

export interface PositionedNode {
  node: GraphNode
  position: Position3
}

export interface VisibleGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export class CodeGraphLogic {
  static layout(graph: ProgramGraph): Map<string, Position3> {
    const result = new Map<string, Position3>()
    const files = graph.nodes.filter((node) => node.kind === 'file')
    const contains = this.childrenByParent(graph)
    let top = 2.25
    files.forEach((file) => {
      const childCount = contains.get(file.id)?.length ?? 0
      const blockHeight = Math.max(0.64, childCount * 0.54)
      const centerY = top - blockHeight / 2
      result.set(file.id, [-4.25, centerY, 0])
      this.layoutChildren(contains, file.id, result, -4.25, centerY, 0)
      top -= blockHeight + 0.18
    })
    return result
  }

  static visible(
    graph: ProgramGraph,
    collapsedIds: ReadonlySet<string>,
    focusedNodeId: string | null,
  ): VisibleGraph {
    const hidden = this.hiddenDescendants(graph, collapsedIds)
    let allowed: Set<string> | null = null
    if (focusedNodeId) {
      allowed = new Set([focusedNodeId])
      for (const edge of graph.edges) {
        if (edge.source === focusedNodeId) {
          allowed.add(edge.target)
        }
        if (edge.target === focusedNodeId) {
          allowed.add(edge.source)
        }
      }
    }
    const nodes = graph.nodes.filter(
      (node) => !hidden.has(node.id) && (!allowed || allowed.has(node.id)),
    )
    const nodeIds = new Set(nodes.map((node) => node.id))
    const edges = graph.edges.filter(
      (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
    )
    return { nodes, edges }
  }

  static mergePositions(
    layout: Map<string, Position3>,
    overrides: ReadonlyMap<string, Position3>,
  ): Map<string, Position3> {
    const merged = new Map(layout)
    for (const [id, position] of overrides) {
      if (merged.has(id)) {
        merged.set(id, position)
      }
    }
    return merged
  }

  private static childrenByParent(graph: ProgramGraph): Map<string, GraphNode[]> {
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
    const children = new Map<string, GraphNode[]>()
    for (const edge of graph.edges) {
      if (edge.kind !== 'contains') {
        continue
      }
      const child = nodes.get(edge.target)
      if (child) {
        const siblings = children.get(edge.source) ?? []
        siblings.push(child)
        children.set(edge.source, siblings)
      }
    }
    for (const siblings of children.values()) {
      siblings.sort((left, right) => left.startLine - right.startLine)
    }
    return children
  }

  private static layoutChildren(
    children: Map<string, GraphNode[]>,
    parentId: string,
    result: Map<string, Position3>,
    parentX: number,
    centerY: number,
    depth: number,
  ): void {
    const descendants = children.get(parentId) ?? []
    descendants.forEach((child, index) => {
      const offset = ((descendants.length - 1) / 2 - index) * 0.54
      const position: Position3 = [parentX + 1.3, centerY + offset, depth * 0.12]
      result.set(child.id, position)
      this.layoutChildren(children, child.id, result, position[0], position[1], depth + 1)
    })
  }

  private static hiddenDescendants(
    graph: ProgramGraph,
    collapsedIds: ReadonlySet<string>,
  ): Set<string> {
    const children = this.childrenByParent(graph)
    const hidden = new Set<string>()
    const visit = (id: string): void => {
      for (const child of children.get(id) ?? []) {
        hidden.add(child.id)
        visit(child.id)
      }
    }
    for (const collapsedId of collapsedIds) {
      visit(collapsedId)
    }
    return hidden
  }
}
