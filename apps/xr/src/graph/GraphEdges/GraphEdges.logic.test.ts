import { describe, expect, it } from 'vitest'
import type { GraphEdge, GraphNode } from '@/connection/protocol'
import type { Position3 } from '@/graph/CodeGraph.logic'
import { GraphEdgesLogic } from '@/graph/GraphEdges/GraphEdges.logic'

const node = (
  id: string,
  kind: GraphNode['kind'],
  exported = false,
): GraphNode => ({
  id,
  kind,
  name: id,
  path: `${id}.ts`,
  startLine: 1,
  endLine: 1,
  detail: null,
  exported,
})
const edge = (
  id: string,
  kind: GraphEdge['kind'],
  source: string,
  target: string,
): GraphEdge => ({ id, kind, source, target })

const nodes = new Map(
  [
    node('a', 'file'),
    node('b', 'file'),
    node('f', 'function', true),
    node('g', 'function'),
  ].map((entry) => [entry.id, entry]),
)
const positions = new Map<string, Position3>([
  ['a', [0, 0, 0]],
  ['b', [3, 0, 0]],
  ['f', [0, 4, 0]],
  ['g', [0, 0, 2]],
])

describe('GraphEdgesLogic.batches', () => {
  it('splits edges into structure, link and dashed export buffers', () => {
    const batches = GraphEdgesLogic.batches(
      [
        edge('c', 'contains', 'a', 'g'),
        edge('i', 'imports', 'a', 'b'),
        edge('x', 'contains', 'a', 'f'),
        edge('missing', 'imports', 'a', 'nowhere'),
      ],
      positions,
      nodes,
    )
    expect([...batches.structure.positions]).toEqual([0, 0, 0, 0, 0, 2])
    expect([...batches.links.positions]).toEqual([0, 0, 0, 3, 0, 0])
    expect(batches.links.colors).toHaveLength(6)
    expect([...batches.exports.positions]).toEqual([0, 0, 0, 0, 4, 0])
    expect([...batches.exports.distances]).toEqual([0, 4])
  })

  it('adds an arrow for imports and calls but not containment', () => {
    const { arrows } = GraphEdgesLogic.batches(
      [edge('c', 'contains', 'a', 'g'), edge('i', 'imports', 'a', 'b')],
      positions,
      nodes,
    )
    expect(arrows).toHaveLength(1)
    expect(arrows[0].direction).toEqual([-1, 0, 0])
    expect(arrows[0].color).toBe('#00cbb4')
  })

  it('lifts an export line that would overlap a call between the same nodes', () => {
    const { exports } = GraphEdgesLogic.batches(
      [edge('x', 'contains', 'a', 'f'), edge('k', 'calls', 'f', 'a')],
      positions,
      nodes,
    )
    expect(exports.positions[1]).toBeCloseTo(0.06)
  })
})
