import { describe, expect, it } from 'vitest'
import type { GraphEdge, GraphNode, ProgramGraph } from '@/connection/protocol'
import { GraphClusterLogic } from '@/graph/GraphCluster/GraphCluster.logic'
import { SpatialGraphLayoutLogic } from '@/graph/SpatialGraphLayout.logic'

const node = (
  id: string,
  path: string,
  kind: GraphNode['kind'] = 'file',
): GraphNode => ({
  id,
  kind,
  name: path.split('/').at(-1) ?? id,
  path,
  startLine: 1,
  endLine: 1,
  detail: null,
  exported: false,
})

const edge = (
  source: string,
  target: string,
  kind: GraphEdge['kind'] = 'imports',
): GraphEdge => ({ id: `${source}>${target}:${kind}`, source, target, kind })

// Two tightly knit trios that live in mixed folders, joined by a single import, plus a
// file that only uses a package.
const graph: ProgramGraph = {
  nodes: [
    node('file:a1', 'src/auth/login.ts'),
    node('file:a2', 'src/auth/session.ts'),
    node('file:a3', 'src/ui/LoginForm.tsx'),
    node('fn:a3', 'src/ui/LoginForm.tsx', 'function'),
    node('file:b1', 'src/graph/layout.ts'),
    node('file:b2', 'src/graph/edges.ts'),
    node('file:b3', 'src/ui/GraphView.tsx'),
    node('file:lone', 'src/util/format.ts'),
    node('module:react', '', 'import'),
  ],
  edges: [
    edge('file:a1', 'file:a2'),
    edge('file:a2', 'file:a3'),
    edge('file:a3', 'file:a1'),
    edge('file:a3', 'fn:a3', 'contains'),
    edge('fn:a3', 'file:a1', 'calls'),
    edge('file:b1', 'file:b2'),
    edge('file:b2', 'file:b3'),
    edge('file:b3', 'file:b1'),
    edge('file:b3', 'file:a1'),
    edge('file:lone', 'module:react'),
  ],
}

const membersOf = (groups: ReturnType<typeof GraphClusterLogic.groups>) =>
  groups.map((group) => [...group.rootIds].sort())

describe('GraphClusterLogic', () => {
  it('finds the two communities in a pair of linked triangles', () => {
    const community = GraphClusterLogic.communities(6, [
      [0, 1, 1],
      [1, 2, 1],
      [2, 0, 1],
      [3, 4, 1],
      [4, 5, 1],
      [5, 3, 1],
      [2, 3, 1],
    ])
    expect(community).toEqual([0, 0, 0, 1, 1, 1])
  })

  it('leaves unconnected nodes on their own', () => {
    expect(GraphClusterLogic.communities(3, [])).toEqual([0, 1, 2])
  })

  it('groups files by what they are linked to, across folders', () => {
    const groups = GraphClusterLogic.groups(graph, 'connectivity')
    expect(membersOf(groups)).toEqual(
      expect.arrayContaining([
        ['file:a1', 'file:a2', 'file:a3'],
        ['file:b1', 'file:b2', 'file:b3'],
        ['file:lone'],
        ['module:react'],
      ]),
    )
    const auth = groups.find((group) => group.rootIds.includes('file:a1'))!
    expect(auth.label).toBe('src/auth/')
    expect(auth.detail).toBe('3 files · around login.ts')
  })

  it('groups files by folder when asked', () => {
    expect(membersOf(GraphClusterLogic.groups(graph, 'folder'))).toEqual(
      expect.arrayContaining([
        ['file:a1', 'file:a2'],
        ['file:a3', 'file:b3'],
        ['file:b1', 'file:b2'],
      ]),
    )
  })

  it('makes no groups when grouping is off', () => {
    expect(GraphClusterLogic.groups(graph, 'none')).toEqual([])
  })

  it('gives the same groups whatever order the graph arrives in', () => {
    const reversed = {
      nodes: [...graph.nodes].reverse(),
      edges: [...graph.edges].reverse(),
    }
    expect(GraphClusterLogic.groups(reversed, 'connectivity')).toEqual(
      GraphClusterLogic.groups(graph, 'connectivity'),
    )
  })

  it('lays each group out as its own island', () => {
    const groups = GraphClusterLogic.groups(graph, 'connectivity')
    const { positions, regions } = SpatialGraphLayoutLogic.layout(graph, groups)
    expect(positions.size).toBe(graph.nodes.length)
    expect(regions.map((region) => region.id).sort()).toEqual(
      groups.map((group) => group.id).sort(),
    )
    const distance = (left: string, right: string) =>
      Math.hypot(
        ...positions
          .get(left)!
          .map((value, axis) => value - positions.get(right)![axis]),
      )
    // Neighbours inside a group are closer than any pair split across two groups.
    expect(distance('file:a1', 'file:a2')).toBeLessThan(
      distance('file:a1', 'file:b1'),
    )
    for (const region of regions) {
      for (const id of region.rootIds) {
        const offset = positions
          .get(id)!
          .map((value, axis) => value - region.center[axis])
        expect(Math.hypot(...offset)).toBeLessThanOrEqual(region.radius)
      }
    }
  })
})
