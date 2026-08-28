import { describe, expect, it } from 'vitest'
import type { ProgramGraph } from '@/connection/protocol'
import { CodeGraphLogic } from '@/graph/CodeGraph.logic'

const graph: ProgramGraph = {
  nodes: [
    {
      id: 'file:index',
      kind: 'file',
      name: 'index.ts',
      path: 'index.ts',
      startLine: 1,
      endLine: 4,
      detail: null,
    },
    {
      id: 'function:main',
      kind: 'function',
      name: 'main',
      path: 'index.ts',
      startLine: 2,
      endLine: 4,
      detail: null,
    },
  ],
  edges: [
    {
      id: 'contains',
      source: 'file:index',
      target: 'function:main',
      kind: 'contains',
    },
  ],
}

describe('CodeGraphLogic', () => {
  it('lays out symbols to the right of their files', () => {
    const layout = CodeGraphLogic.layout(graph)
    expect(layout.get('function:main')?.[0]).toBeGreaterThan(
      layout.get('file:index')?.[0] ?? 0,
    )
  })

  it('hides descendants of collapsed nodes', () => {
    const visible = CodeGraphLogic.visible(graph, new Set(['file:index']), null)
    expect(visible.nodes.map((node) => node.id)).toEqual(['file:index'])
  })

  it('merges persisted drag positions', () => {
    const merged = CodeGraphLogic.mergePositions(
      CodeGraphLogic.layout(graph),
      new Map([['file:index', [3, 2, 1] as [number, number, number]]]),
    )
    expect(merged.get('file:index')).toEqual([3, 2, 1])
  })
})
