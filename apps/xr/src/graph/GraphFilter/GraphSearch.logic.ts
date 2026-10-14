import type { GraphNode } from '@/connection/protocol'

export interface SearchResult {
  node: GraphNode
  score: number
  /** The main line to show, e.g. a file's name or a symbol's name. */
  label: string
  /** Where it lives, e.g. a file's folder or a symbol's file and line. */
  context: string
}

const boundary = /[/\\._\-\s]/
const lowerOrDigit = /[a-z0-9]/
/** How many occurrences of the first query character to try as a starting point. */
const maxStarts = 8

const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

const folder = (path: string): string =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''

/**
 * Fuzzy matching in the style of VS Code's Ctrl+P: the query's characters must appear in
 * order, and runs of consecutive characters and matches at word starts score higher.
 */
export class GraphSearchLogic {
  /** The score for `query` against `text`, or null if it doesn't match at all. */
  static score(query: string, text: string): number | null {
    const needle = query.replace(/\s+/g, '').toLowerCase()
    if (!needle) {
      return 0
    }
    const lower = text.toLowerCase()
    let best: number | null = null
    let start = lower.indexOf(needle[0])
    for (let tries = 0; start !== -1 && tries < maxStarts; tries++) {
      const score = this.scoreFrom(needle, text, lower, start)
      if (score !== null && (best === null || score > best)) {
        best = score
      }
      start = lower.indexOf(needle[0], start + 1)
    }
    return best
  }

  /** The text a node is searched by: its path for files, its own name for everything else. */
  static searchText(node: GraphNode): string {
    switch (node.kind) {
      case 'file':
        return node.path
      case 'import':
      case 'asset':
        return node.detail ?? node.name
      default:
        return node.name
    }
  }

  static result(node: GraphNode, score: number): SearchResult {
    switch (node.kind) {
      case 'file':
        return {
          node,
          score,
          label: basename(node.path),
          context: folder(node.path),
        }
      case 'import':
        return {
          node,
          score,
          label: node.detail ?? node.name,
          context: 'package',
        }
      case 'asset':
        return {
          node,
          score,
          label: basename(node.detail ?? node.name),
          context: folder(node.detail ?? ''),
        }
      default:
        return {
          node,
          score,
          label: node.name,
          context: `${node.path}:${node.startLine}`,
        }
    }
  }

  /** Every node matching `query`, best first. */
  static search(
    nodes: readonly GraphNode[],
    query: string,
    limit = Infinity,
  ): SearchResult[] {
    if (!query.trim()) {
      return []
    }
    const results: SearchResult[] = []
    for (const node of nodes) {
      const text = this.searchText(node)
      const full = this.score(query, text)
      // A hit inside the file name beats one spread across folders.
      const name =
        node.kind === 'file' ? this.score(query, basename(text)) : null
      const score = Math.max(
        full ?? -Infinity,
        name === null ? -Infinity : name + 10,
      )
      if (score > -Infinity) {
        results.push(this.result(node, score))
      }
    }
    results.sort(
      (left, right) =>
        right.score - left.score ||
        left.label.length - right.label.length ||
        left.node.id.localeCompare(right.node.id),
    )
    return results.slice(0, limit)
  }

  private static scoreFrom(
    needle: string,
    text: string,
    lower: string,
    start: number,
  ): number | null {
    let score = 0
    let previous = start - 2
    let from = start
    for (const char of needle) {
      const index = lower.indexOf(char, from)
      if (index === -1) {
        return null
      }
      score += 1
      if (index === previous + 1) {
        score += 5
      }
      const before = text[index - 1]
      const camel =
        before !== undefined &&
        lowerOrDigit.test(before) &&
        text[index] !== lower[index]
      if (
        index === 0 ||
        camel ||
        (before !== undefined && boundary.test(before))
      ) {
        score += 4
      }
      // Small penalty for skipped characters, so tight matches win ties.
      score -= Math.min(index - from, 10) * 0.1
      previous = index
      from = index + 1
    }
    return score
  }
}
