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
      exported: false,
    },
    {
      id: 'function:main',
      kind: 'function',
      name: 'main',
      path: 'index.ts',
      startLine: 2,
      endLine: 4,
      detail: null,
      exported: false,
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

  it('places arrow heads at the node surface pointing into the node', () => {
    const arrow = CodeGraphLogic.arrowHead([0, 0, 0], [2, 0, 0], 0.25)
    expect(arrow?.position).toEqual([0.25, 0, 0])
    expect(arrow?.direction).toEqual([-1, 0, 0])
  })

  it('skips arrow heads when nodes overlap', () => {
    expect(CodeGraphLogic.arrowHead([0, 0, 0], [0.1, 0, 0], 0.25)).toBeNull()
  })

  describe('edge scoping', () => {
    const node = (id: string, path: string, exported = false) => ({
      id,
      kind: id.startsWith('file')
        ? ('file' as const)
        : id.startsWith('module')
          ? ('import' as const)
          : ('function' as const),
      name: id,
      path,
      startLine: 1,
      endLine: 1,
      detail: null,
      exported,
    })
    const nodes = new Map(
      [
        node('file:a', 'a.ts'),
        node('fn:a1', 'a.ts', true),
        node('fn:a2', 'a.ts'),
        node('file:b', 'b.ts'),
        node('fn:b1', 'b.ts'),
        node('module:fs', ''),
      ].map((item) => [item.id, item]),
    )
    const edges = [
      {
        id: 'export',
        source: 'file:a',
        target: 'fn:a1',
        kind: 'contains' as const,
      },
      {
        id: 'local',
        source: 'file:a',
        target: 'fn:a2',
        kind: 'contains' as const,
      },
      {
        id: 'selfCall',
        source: 'file:a',
        target: 'fn:a1',
        kind: 'calls' as const,
      },
      {
        id: 'import',
        source: 'file:b',
        target: 'file:a',
        kind: 'imports' as const,
      },
      {
        id: 'crossCall',
        source: 'fn:b1',
        target: 'fn:a1',
        kind: 'calls' as const,
      },
      {
        id: 'moduleImport',
        source: 'file:b',
        target: 'module:fs',
        kind: 'imports' as const,
      },
    ]
    const scoped = (selectedId: string | null, showModules = false) =>
      CodeGraphLogic.scoped(
        { nodes: [...nodes.values()], edges },
        selectedId ? (nodes.get(selectedId) ?? null) : null,
        { showModules },
      )
    const ids = (selectedId: string | null, showModules = false) => {
      const view = scoped(selectedId, showModules)
      return {
        nodes: view.nodes.map((item) => item.id),
        edges: view.edges.map((edge) => edge.id),
      }
    }

    it('shows only files and imports when nothing is selected', () => {
      expect(ids(null)).toEqual({
        nodes: ['file:a', 'file:b'],
        edges: ['import'],
      })
    })

    it('reveals internal nodes and edges of the selected file', () => {
      expect(ids('file:a')).toEqual({
        nodes: ['file:a', 'fn:a1', 'fn:a2', 'file:b', 'fn:b1'],
        edges: ['export', 'local', 'selfCall', 'import', 'crossCall'],
      })
    })

    it('shows symbols and modules the selected file uses', () => {
      expect(ids('file:b')).toEqual({
        nodes: ['file:a', 'fn:a1', 'file:b', 'fn:b1', 'module:fs'],
        edges: ['export', 'import', 'crossCall', 'moduleImport'],
      })
    })

    it('shows a selected module and the files importing it', () => {
      expect(ids('module:fs')).toEqual({
        nodes: ['file:a', 'file:b', 'module:fs'],
        edges: ['import', 'moduleImport'],
      })
    })

    it('shows every module when showModules is on', () => {
      expect(ids(null, true)).toEqual({
        nodes: ['file:a', 'file:b', 'module:fs'],
        edges: ['import', 'moduleImport'],
      })
    })

    it('lifts export lines that share endpoints with a call', () => {
      expect(CodeGraphLogic.overlappingExportEdges(edges, nodes)).toEqual(
        new Set(['export']),
      )
      expect(
        CodeGraphLogic.overlappingExportEdges(scoped(null).edges, nodes),
      ).toEqual(new Set())
    })
  })
})
