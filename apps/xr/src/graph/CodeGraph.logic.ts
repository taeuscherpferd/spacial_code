import { SpatialGraphLayoutLogic } from '@/graph/SpatialGraphLayout.logic'
import type {
  GraphEdge,
  GraphNode,
  GraphNodeKind,
  ProgramGraph,
} from '@/connection/protocol'

export type Position3 = [number, number, number]

export interface PositionedNode {
  node: GraphNode
  position: Position3
}

export interface VisibleGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/** Display toggles for `CodeGraphLogic.scoped`. */
export interface ScopeOptions {
  /** Show every external module, not just those the selection touches. */
  showModules: boolean
}

export const defaultScopeOptions: ScopeOptions = { showModules: false }

export interface ArrowPlacement {
  position: Position3
  direction: Position3
}

export class CodeGraphLogic {
  static nodeRadius(kind: GraphNodeKind): number {
    return kind === 'file' ? 0.2 : 0.13
  }

  /** Places an arrow tip `inset` short of `tip`, pointing away from `tail`. */
  static arrowHead(
    tip: Position3,
    tail: Position3,
    inset: number,
  ): ArrowPlacement | null {
    const delta = [tip[0] - tail[0], tip[1] - tail[1], tip[2] - tail[2]]
    const length = Math.hypot(delta[0], delta[1], delta[2])
    if (length <= inset * 2) {
      return null
    }
    const direction: Position3 = [
      delta[0] / length,
      delta[1] / length,
      delta[2] / length,
    ]
    return {
      position: [
        tip[0] - direction[0] * inset,
        tip[1] - direction[1] * inset,
        tip[2] - direction[2] * inset,
      ],
      direction,
    }
  }

  static layout(graph: ProgramGraph): Map<string, Position3> {
    return SpatialGraphLayoutLogic.layout(graph)
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

  /**
   * With nothing selected only files and the imports between them are shown. Selecting a
   * file (or anything in it) reveals its contents, plus the symbols in other files it
   * talks to, each hung off its own file. External modules show when selected, when a file
   * using them is selected, or always with `showModules`.
   */
  static scoped(
    visible: VisibleGraph,
    selected: GraphNode | null,
    options: ScopeOptions = defaultScopeOptions,
  ): VisibleGraph {
    // Modules have no path of their own, so selecting one scopes to no file.
    const selectedPath =
      selected && selected.kind !== 'import' ? selected.path : null
    const nodes = new Map(visible.nodes.map((node) => [node.id, node]))
    const parents = new Map(
      visible.edges
        .filter((edge) => edge.kind === 'contains')
        .map((edge) => [edge.target, edge.source]),
    )
    const crossFile = (edge: GraphEdge): boolean =>
      nodes.get(edge.source)?.path !== nodes.get(edge.target)?.path

    const kept = new Set<string>()
    const keep = (id: string): void => {
      for (
        let current: string | undefined = id;
        current && !kept.has(current);
      ) {
        kept.add(current)
        current = parents.get(current)
      }
    }
    const inSelected = (id: string): boolean =>
      selectedPath !== null && nodes.get(id)?.path === selectedPath
    for (const node of visible.nodes) {
      const shownModule =
        node.kind === 'import' &&
        (options.showModules || node.id === selected?.id)
      if (node.kind === 'file' || inSelected(node.id) || shownModule) {
        keep(node.id)
      }
    }
    for (const edge of visible.edges) {
      if (inSelected(edge.source) || inSelected(edge.target)) {
        keep(edge.source)
        keep(edge.target)
      }
    }

    return {
      nodes: visible.nodes.filter((node) => kept.has(node.id)),
      edges: visible.edges.filter(
        (edge) =>
          kept.has(edge.source) &&
          kept.has(edge.target) &&
          (edge.kind === 'contains' ||
            crossFile(edge) ||
            inSelected(edge.source)),
      ),
    }
  }

  /** A file's contains edge to one of its exported symbols. */
  static isExportEdge(
    edge: GraphEdge,
    nodes: ReadonlyMap<string, GraphNode>,
  ): boolean {
    return edge.kind === 'contains' && nodes.get(edge.target)?.exported === true
  }

  /** Export edges that share both endpoints with a visible call, so they must be drawn offset. */
  static overlappingExportEdges(
    edges: readonly GraphEdge[],
    nodes: ReadonlyMap<string, GraphNode>,
  ): Set<string> {
    const pair = (a: string, b: string): string =>
      a < b ? `${a}|${b}` : `${b}|${a}`
    const callPairs = new Set(
      edges
        .filter((edge) => edge.kind === 'calls')
        .map((edge) => pair(edge.source, edge.target)),
    )
    return new Set(
      edges
        .filter(
          (edge) =>
            this.isExportEdge(edge, nodes) &&
            callPairs.has(pair(edge.source, edge.target)),
        )
        .map((edge) => edge.id),
    )
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

  private static childrenByParent(
    graph: ProgramGraph,
  ): Map<string, GraphNode[]> {
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
