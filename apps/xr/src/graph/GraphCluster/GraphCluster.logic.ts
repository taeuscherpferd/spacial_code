import type { GraphNode, ProgramGraph } from '@/connection/protocol'
import { GraphFilterLogic } from '@/graph/GraphFilter/GraphFilter.logic'

/**
 * - `connectivity`: files that import and call each other a lot sit together.
 * - `folder`: files sit with the others in their directory.
 * - `none`: the plain grid, ordered by id.
 */
export type GroupMode = 'connectivity' | 'folder' | 'none'

export const groupModeLabels: Record<GroupMode, string> = {
  connectivity: 'Connections',
  folder: 'Folder',
  none: 'Off',
}

/** A set of top-level nodes (files, assets, packages) laid out next to each other. */
export interface GraphGroup {
  id: string
  label: string
  detail: string
  rootIds: string[]
}

type WeightedEdge = [number, number, number]

const packagesGroupId = 'group:packages'

export class GraphClusterLogic {
  static groups(graph: ProgramGraph, mode: GroupMode): GraphGroup[] {
    if (mode === 'none') {
      return []
    }
    const { roots, rootOf } = this.roots(graph)
    const packages = roots.filter((node) => node.kind === 'import')
    const files = roots.filter((node) => node.kind !== 'import')
    const groups =
      mode === 'folder'
        ? this.byFolder(files)
        : this.byConnectivity(graph, files, rootOf)
    if (packages.length) {
      groups.push({
        id: packagesGroupId,
        label: 'Packages',
        detail: this.count(packages.length, 'package'),
        rootIds: packages.map((node) => node.id),
      })
    }
    return groups.sort(
      (left, right) =>
        right.rootIds.length - left.rootIds.length ||
        left.id.localeCompare(right.id),
    )
  }

  /** The directory part of a node's path, with forward slashes; `''` at the workspace root. */
  static folder(node: GraphNode): string {
    const path = GraphFilterLogic.filePath(node) ?? ''
    const slash = path.lastIndexOf('/')
    return slash < 0 ? '' : path.slice(0, slash)
  }

  /** The last two segments of a folder, which is usually enough to tell it apart. */
  static folderLabel(folder: string): string {
    return folder ? `${folder.split('/').slice(-2).join('/')}/` : '(root)'
  }

  /**
   * Louvain community detection over a weighted, undirected graph of `size` nodes. It only
   * ever visits nodes and neighbours in index order, so the same input always gives the same
   * communities and the layout doesn't shuffle between reloads. Returns a community index per
   * node, numbered in order of first appearance.
   */
  static communities(size: number, edges: readonly WeightedEdge[]): number[] {
    let adjacency = Array.from(
      { length: size },
      () => new Map<number, number>(),
    )
    for (const [left, right, weight] of edges) {
      if (left === right) continue
      adjacency[left].set(right, (adjacency[left].get(right) ?? 0) + weight)
      adjacency[right].set(left, (adjacency[right].get(left) ?? 0) + weight)
    }
    // Which community each original node is in, refined every level.
    let membership = Array.from({ length: size }, (_, index) => index)

    for (let level = 0; level < 20; level += 1) {
      const count = adjacency.length
      const degree = adjacency.map((links) =>
        [...links.values()].reduce((sum, weight) => sum + weight, 0),
      )
      const total = degree.reduce((sum, weight) => sum + weight, 0)
      if (total === 0) break
      const community = Array.from({ length: count }, (_, index) => index)
      const communityDegree = [...degree]

      let moved = false
      for (let pass = 0, improved = true; improved && pass < 50; pass += 1) {
        improved = false
        for (let node = 0; node < count; node += 1) {
          const current = community[node]
          const linkWeights = new Map<number, number>()
          for (const [neighbour, weight] of adjacency[node]) {
            if (neighbour === node) continue
            const target = community[neighbour]
            linkWeights.set(target, (linkWeights.get(target) ?? 0) + weight)
          }
          communityDegree[current] -= degree[node]
          // Modularity gain of joining a community, up to a constant factor.
          const gain = (target: number): number =>
            (linkWeights.get(target) ?? 0) -
            (communityDegree[target] * degree[node]) / total
          let best = current
          let bestGain = gain(current)
          for (const target of linkWeights.keys()) {
            const candidate = gain(target)
            if (candidate > bestGain + 1e-9) {
              best = target
              bestGain = candidate
            }
          }
          communityDegree[best] += degree[node]
          if (best !== current) {
            community[node] = best
            improved = true
            moved = true
          }
        }
      }
      if (!moved) break

      const renumbered = new Map<number, number>()
      for (const value of community) {
        if (!renumbered.has(value)) renumbered.set(value, renumbered.size)
      }
      const merged = Array.from(
        { length: renumbered.size },
        () => new Map<number, number>(),
      )
      adjacency.forEach((links, node) => {
        const from = renumbered.get(community[node])!
        for (const [neighbour, weight] of links) {
          const to = renumbered.get(community[neighbour])!
          merged[from].set(to, (merged[from].get(to) ?? 0) + weight)
        }
      })
      membership = membership.map((node) => renumbered.get(community[node])!)
      adjacency = merged
    }

    const order = new Map<number, number>()
    return membership.map((value) => {
      if (!order.has(value)) order.set(value, order.size)
      return order.get(value)!
    })
  }

  /** Top-level nodes (not contained by anything) and the top-level node each node sits under. */
  private static roots(graph: ProgramGraph): {
    roots: GraphNode[]
    rootOf: (id: string) => string | undefined
  } {
    const byId = new Map(graph.nodes.map((node) => [node.id, node]))
    const parent = new Map<string, string>()
    for (const edge of graph.edges) {
      if (
        edge.kind === 'contains' &&
        byId.has(edge.source) &&
        byId.has(edge.target)
      ) {
        parent.set(edge.target, edge.source)
      }
    }
    const rootOf = (id: string): string | undefined => {
      if (!byId.has(id)) return undefined
      const seen = new Set<string>()
      let current = id
      while (parent.has(current) && !seen.has(current)) {
        seen.add(current)
        current = parent.get(current)!
      }
      return current
    }
    const rootIds = new Set(graph.nodes.map((node) => rootOf(node.id)!))
    const roots = graph.nodes
      .filter((node) => rootIds.has(node.id))
      .sort((left, right) => left.id.localeCompare(right.id))
    return { roots, rootOf }
  }

  private static byFolder(files: readonly GraphNode[]): GraphGroup[] {
    const folders = new Map<string, GraphNode[]>()
    for (const node of files) {
      const folder = this.folder(node)
      folders.set(folder, [...(folders.get(folder) ?? []), node])
    }
    return [...folders].map(([folder, members]) => ({
      id: `group:folder:${folder}`,
      label: this.folderLabel(folder),
      detail: this.count(members.length, 'file'),
      rootIds: members.map((node) => node.id),
    }))
  }

  /**
   * Files are linked by every import and call between them (or between their symbols), one
   * unit of weight each. Files that end up alone, usually because they only use packages,
   * fall back to sitting with their folder rather than each forming a group of one.
   */
  private static byConnectivity(
    graph: ProgramGraph,
    files: readonly GraphNode[],
    rootOf: (id: string) => string | undefined,
  ): GraphGroup[] {
    const index = new Map(files.map((node, position) => [node.id, position]))
    const edges: WeightedEdge[] = []
    for (const edge of graph.edges) {
      if (edge.kind === 'contains') continue
      const source = index.get(rootOf(edge.source) ?? '')
      const target = index.get(rootOf(edge.target) ?? '')
      if (source !== undefined && target !== undefined && source !== target) {
        edges.push([source, target, 1])
      }
    }
    const community = this.communities(files.length, edges)
    const degree = new Array<number>(files.length).fill(0)
    for (const [source, target, weight] of edges) {
      if (community[source] === community[target]) {
        degree[source] += weight
        degree[target] += weight
      }
    }

    const members = new Map<number, GraphNode[]>()
    files.forEach((node, position) => {
      const key = community[position]
      members.set(key, [...(members.get(key) ?? []), node])
    })
    const groups: GraphGroup[] = []
    const loners: GraphNode[] = []
    for (const nodes of members.values()) {
      if (nodes.length === 1) {
        loners.push(nodes[0])
        continue
      }
      // The most linked-to file inside the community names it.
      const hub = nodes.reduce((best, node) =>
        degree[index.get(node.id)!] > degree[index.get(best.id)!] ? node : best,
      )
      groups.push({
        id: `group:cluster:${hub.id}`,
        label: this.folderLabel(this.commonFolder(nodes)),
        detail: `${this.count(nodes.length, 'file')} · around ${hub.name}`,
        rootIds: nodes.map((node) => node.id),
      })
    }
    return [...groups, ...this.byFolder(loners)]
  }

  /** The folder most members live in. */
  private static commonFolder(nodes: readonly GraphNode[]): string {
    const counts = new Map<string, number>()
    for (const node of nodes) {
      const folder = this.folder(node)
      counts.set(folder, (counts.get(folder) ?? 0) + 1)
    }
    return [...counts].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )[0][0]
  }

  private static count(count: number, noun: string): string {
    return `${count} ${noun}${count === 1 ? '' : 's'}`
  }
}
