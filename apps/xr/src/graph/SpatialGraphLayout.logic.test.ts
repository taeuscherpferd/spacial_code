import { describe, expect, it } from 'vitest'
import type { GraphNode, ProgramGraph } from '@/connection/protocol'
import { SpatialGraphLayoutLogic } from '@/graph/SpatialGraphLayout.logic'

const node = (id: string, kind: GraphNode['kind'] = 'file'): GraphNode => ({
  id,
  kind,
  name: id,
  path: `${id}.ts`,
  startLine: 1,
  endLine: 1,
  detail: null,
  exported: false,
})

const contains = (source: string, target: string) => ({
  id: `${source}:${target}`,
  source,
  target,
  kind: 'contains' as const,
})

describe('SpatialGraphLayoutLogic', () => {
  it('handles an empty workspace', () => {
    expect(SpatialGraphLayoutLogic.layout({ nodes: [], edges: [] }).size).toBe(
      0,
    )
  })

  it('separates files in depth even in a two-file workspace', () => {
    const positions = SpatialGraphLayoutLogic.layout({
      nodes: [node('a'), node('b')],
      edges: [],
    })
    expect(
      Math.abs(positions.get('a')![2] - positions.get('b')![2]),
    ).toBeGreaterThan(1)
  })

  it('distributes larger workspaces across all three axes', () => {
    const positions = [
      ...SpatialGraphLayoutLogic.layout({
        nodes: Array.from({ length: 27 }, (_, index) => node(`file:${index}`)),
        edges: [],
      }).values(),
    ]
    for (const axis of [0, 1, 2]) {
      expect(
        new Set(positions.map((position) => position[axis])).size,
      ).toBeGreaterThan(2)
    }
    expect(positions.every((position) => position.every(Number.isFinite))).toBe(
      true,
    )
  })

  it('does not let one huge file dictate spacing for unrelated small files', () => {
    const plainFiles = Array.from({ length: 26 }, (_, index) =>
      node(`plain:${index}`),
    )
    const withOutlier: ProgramGraph = {
      nodes: [
        ...plainFiles,
        node('big'),
        ...Array.from({ length: 80 }, (_, index) =>
          node(`big:fn:${index}`, 'function'),
        ),
      ],
      edges: Array.from({ length: 80 }, (_, index) =>
        contains('big', `big:fn:${index}`),
      ),
    }
    const withOutlierPositions = SpatialGraphLayoutLogic.layout(withOutlier)
    const withoutOutlierPositions = SpatialGraphLayoutLogic.layout({
      nodes: plainFiles,
      edges: [],
    })

    // The gap between two plain files' slots should be unaffected by the unrelated huge
    // cluster landing in a different slot elsewhere in the grid.
    const gap = (positions: Map<string, [number, number, number]>) =>
      Math.hypot(
        ...positions
          .get('plain:0')!
          .map((value, axis) => value - positions.get('plain:1')![axis]),
      )
    expect(gap(withOutlierPositions)).toBeCloseTo(
      gap(withoutOutlierPositions),
      5,
    )
  })

  const clustered: ProgramGraph = {
    nodes: [
      node('file'),
      node('class', 'class'),
      node('method', 'function'),
      ...Array.from({ length: 12 }, (_, index) =>
        node(`fn:${index}`, 'function'),
      ),
      node('other'),
      node('module', 'import'),
    ],
    edges: [
      contains('file', 'class'),
      contains('class', 'method'),
      ...Array.from({ length: 12 }, (_, index) =>
        contains('file', `fn:${index}`),
      ),
    ],
  }

  it('gives symbols depth and keeps nested clusters separated', () => {
    const positions = SpatialGraphLayoutLogic.layout(clustered)
    expect(positions.size).toBe(clustered.nodes.length)
    expect(positions.get('method')![2]).not.toBe(positions.get('class')![2])
    const values = [...positions.values()]
    for (let index = 0; index < values.length; index += 1) {
      for (const other of values.slice(index + 1)) {
        expect(
          Math.hypot(
            ...values[index].map((value, axis) => value - other[axis]),
          ),
        ).toBeGreaterThan(0.7)
      }
    }
  })

  it('is independent of incoming node and edge order and does not mutate input', () => {
    const original = structuredClone(clustered)
    expect(SpatialGraphLayoutLogic.layout(clustered)).toEqual(
      SpatialGraphLayoutLogic.layout({
        nodes: [...clustered.nodes].reverse(),
        edges: [...clustered.edges].reverse(),
      }),
    )
    expect(clustered).toEqual(original)
  })

  it('handles duplicate edges, missing endpoints, cycles, and orphan symbols', () => {
    const positions = SpatialGraphLayoutLogic.layout({
      nodes: [node('a'), node('b'), node('orphan', 'function')],
      edges: [
        contains('a', 'b'),
        contains('a', 'b'),
        contains('b', 'a'),
        contains('missing', 'a'),
        contains('a', 'missing'),
        { id: 'call', source: 'orphan', target: 'a', kind: 'calls' },
      ],
    })
    expect([...positions.keys()].sort()).toEqual(['a', 'b', 'orphan'])
  })
})
