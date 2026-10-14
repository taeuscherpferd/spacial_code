import type { GraphNode, ProgramGraph } from '@/connection/protocol'
import type { GroupMode } from '@/graph/GraphCluster/GraphCluster.logic'
import { GraphSearchLogic } from '@/graph/GraphFilter/GraphSearch.logic'

/**
 * - `hide`: never show third-party packages.
 * - `related`: show them only for the selection (the default).
 * - `all`: always show every package.
 */
export type ExternalModulesMode = 'hide' | 'related' | 'all'

export interface GraphFilters {
  /** Fuzzy search over file paths and symbol names; empty matches everything. */
  query: string
  hideTests: boolean
  /** Extensions (without the dot, e.g. `scss`, `d.ts`) whose files are hidden. */
  hiddenExtensions: readonly string[]
  externalModules: ExternalModulesMode
  /** How files are gathered in the layout. Not a filter, so it isn't counted or reset. */
  groupBy: GroupMode
  /** Draw each group's bubble and name. Also a display setting, like `groupBy`. */
  showGroups: boolean
}

export const defaultGraphFilters: GraphFilters = {
  query: '',
  hideTests: false,
  hiddenExtensions: [],
  externalModules: 'related',
  groupBy: 'connectivity',
  showGroups: true,
}

export interface ExtensionCount {
  extension: string
  count: number
}

export const externalModulesLabels: Record<ExternalModulesMode, string> = {
  hide: 'Off',
  related: 'With selection',
  all: 'Always',
}

const testFolder =
  /(^|\/)(__tests__|__mocks__|tests?|specs?|e2e|cypress|playwright)\//i
const testFile = /(\.|^)(test|spec|e2e|cy)\.[^/]+$|(^|\/)setupTests\.[^/]+$/i

export class GraphFilterLogic {
  /**
   * The workspace file a node belongs to, or null for third-party packages. Symbols share
   * their file's path; assets keep theirs in `detail`, since they have no file to open.
   */
  static filePath(node: GraphNode): string | null {
    if (node.kind === 'import') {
      return null
    }
    const path = node.kind === 'asset' ? (node.detail ?? '') : node.path
    return path.replaceAll('\\', '/')
  }

  static isTest(path: string): boolean {
    return testFolder.test(path) || testFile.test(path)
  }

  /** The lower-cased extension without its dot; `.d.ts` counts as its own type. */
  static extension(path: string): string {
    const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
    if (name.endsWith('.d.ts')) {
      return 'd.ts'
    }
    const dot = name.lastIndexOf('.')
    return dot > 0 ? name.slice(dot + 1) : ''
  }

  static extensionLabel(extension: string): string {
    return extension ? `.${extension}` : '(none)'
  }

  /** The file types present in the workspace, most common first. */
  static extensions(graph: ProgramGraph): ExtensionCount[] {
    const counts = new Map<string, number>()
    for (const node of graph.nodes) {
      if (node.kind !== 'file' && node.kind !== 'asset') {
        continue
      }
      const extension = this.extension(this.filePath(node) ?? '')
      counts.set(extension, (counts.get(extension) ?? 0) + 1)
    }
    return [...counts]
      .map(([extension, count]) => ({ extension, count }))
      .sort(
        (left, right) =>
          right.count - left.count ||
          left.extension.localeCompare(right.extension),
      )
  }

  /** How many filters differ from the defaults, for a badge on the menu button. */
  static activeCount(filters: GraphFilters): number {
    return (
      Number(filters.query.trim() !== '') +
      Number(filters.hideTests) +
      filters.hiddenExtensions.length +
      Number(filters.externalModules !== defaultGraphFilters.externalModules)
    )
  }

  /**
   * The graph without the filtered-out nodes and any edge touching them. Run this after
   * layout, so toggling a filter never moves the nodes that stay.
   *
   * A search keeps whole files: a file stays when its path or any of its symbols match.
   * Packages and assets stay when they match themselves or link to a file that stayed.
   */
  static apply(graph: ProgramGraph, filters: GraphFilters): ProgramGraph {
    if (this.activeCount(filters) === 0) {
      return graph
    }
    const hiddenExtensions = new Set(filters.hiddenExtensions)
    const excludedPath = (path: string): boolean =>
      (filters.hideTests && this.isTest(path)) ||
      hiddenExtensions.has(this.extension(path))

    const query = filters.query.trim()
    const hits = query
      ? new Set(
          GraphSearchLogic.search(graph.nodes, query).map(
            (result) => result.node.id,
          ),
        )
      : null
    const matchedPaths = new Set<string>()
    if (hits) {
      for (const node of graph.nodes) {
        if (
          hits.has(node.id) &&
          node.kind !== 'import' &&
          node.kind !== 'asset'
        ) {
          matchedPaths.add(node.path)
        }
      }
    }

    const kept = new Set<string>()
    const outside: GraphNode[] = []
    for (const node of graph.nodes) {
      const path = this.filePath(node)
      if (node.kind === 'import') {
        if (filters.externalModules !== 'hide') {
          outside.push(node)
        }
      } else if (node.kind === 'asset') {
        if (!excludedPath(path ?? '')) {
          outside.push(node)
        }
      } else if (
        !excludedPath(path ?? '') &&
        (!hits || matchedPaths.has(node.path))
      ) {
        kept.add(node.id)
      }
    }
    if (hits) {
      const linked = new Set<string>()
      for (const edge of graph.edges) {
        if (kept.has(edge.source)) linked.add(edge.target)
        if (kept.has(edge.target)) linked.add(edge.source)
      }
      for (const node of outside) {
        if (hits.has(node.id) || linked.has(node.id)) kept.add(node.id)
      }
    } else {
      for (const node of outside) kept.add(node.id)
    }

    return {
      nodes: graph.nodes.filter((node) => kept.has(node.id)),
      edges: graph.edges.filter(
        (edge) => kept.has(edge.source) && kept.has(edge.target),
      ),
    }
  }
}
