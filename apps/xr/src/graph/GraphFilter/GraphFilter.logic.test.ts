import { describe, expect, it } from 'vitest'
import type { GraphEdge, GraphNode, ProgramGraph } from '@/connection/protocol'
import {
  GraphFilterLogic,
  defaultGraphFilters,
  type GraphFilters,
} from '@/graph/GraphFilter/GraphFilter.logic'
import { GraphSearchLogic } from '@/graph/GraphFilter/GraphSearch.logic'

const node = (
  id: string,
  kind: GraphNode['kind'],
  path: string,
  name = id,
  detail: string | null = null,
): GraphNode => ({
  id,
  kind,
  name,
  path,
  startLine: 1,
  endLine: 1,
  detail,
  exported: false,
})
const edge = (
  kind: GraphEdge['kind'],
  source: string,
  target: string,
): GraphEdge => ({ id: `${source}->${target}`, kind, source, target })

const graph: ProgramGraph = {
  nodes: [
    node('app', 'file', 'src/App.tsx'),
    node('render', 'function', 'src/App.tsx', 'renderApp'),
    node('test', 'file', 'src/App.test.tsx'),
    node('styles', 'file', 'src/App.module.scss'),
    node('graph', 'file', 'src/graph/CodeGraph.tsx'),
    node('layout', 'function', 'src/graph/CodeGraph.tsx', 'layoutNodes'),
    node('react', 'import', '', 'import react', 'react'),
    node('logo', 'asset', '', 'logo.svg', 'src/assets/logo.svg'),
  ],
  edges: [
    edge('contains', 'app', 'render'),
    edge('contains', 'graph', 'layout'),
    edge('imports', 'app', 'styles'),
    edge('imports', 'app', 'react'),
    edge('imports', 'app', 'logo'),
    edge('imports', 'test', 'app'),
    edge('imports', 'graph', 'react'),
  ],
}

const ids = (filters: Partial<GraphFilters>) =>
  GraphFilterLogic.apply(graph, { ...defaultGraphFilters, ...filters })
    .nodes.map((entry) => entry.id)
    .sort()

describe('GraphFilterLogic', () => {
  it('returns the same graph when no filter is active', () => {
    expect(GraphFilterLogic.apply(graph, defaultGraphFilters)).toBe(graph)
  })

  it('recognises test files and folders', () => {
    expect(GraphFilterLogic.isTest('src/App.test.tsx')).toBe(true)
    expect(GraphFilterLogic.isTest('src/__tests__/App.tsx')).toBe(true)
    expect(GraphFilterLogic.isTest('tests/e2e.ts')).toBe(true)
    expect(GraphFilterLogic.isTest('src/setupTests.ts')).toBe(true)
    expect(GraphFilterLogic.isTest('src/latest.ts')).toBe(false)
    expect(GraphFilterLogic.isTest('src/contest/App.tsx')).toBe(false)
  })

  it('reads extensions, keeping .d.ts separate', () => {
    expect(GraphFilterLogic.extension('src/App.module.scss')).toBe('scss')
    expect(GraphFilterLogic.extension('src/vite-env.d.ts')).toBe('d.ts')
    expect(GraphFilterLogic.extension('src/.env')).toBe('')
    expect(GraphFilterLogic.extension('Makefile')).toBe('')
  })

  it('counts the file types present, assets included', () => {
    expect(GraphFilterLogic.extensions(graph)).toEqual([
      { extension: 'tsx', count: 3 },
      { extension: 'scss', count: 1 },
      { extension: 'svg', count: 1 },
    ])
  })

  it('hides test files and the edges into them', () => {
    const filtered = GraphFilterLogic.apply(graph, {
      ...defaultGraphFilters,
      hideTests: true,
    })
    expect(filtered.nodes.map((entry) => entry.id)).not.toContain('test')
    expect(filtered.edges.some((entry) => entry.source === 'test')).toBe(false)
  })

  it('hides a file type along with the symbols inside it', () => {
    expect(ids({ hiddenExtensions: ['tsx'] })).toEqual([
      'logo',
      'react',
      'styles',
    ])
    expect(ids({ hiddenExtensions: ['svg'] })).not.toContain('logo')
  })

  it('drops packages entirely when they are turned off', () => {
    expect(ids({ externalModules: 'hide' })).not.toContain('react')
  })

  it('keeps whole files whose path or symbols match the search', () => {
    // `layoutNodes` lives in CodeGraph.tsx, so that file and its symbols stay.
    expect(ids({ query: 'layoutnod' })).toEqual(['graph', 'layout', 'react'])
    // Packages and assets the kept files use come along with them.
    expect(ids({ query: 'renderapp' })).toEqual([
      'app',
      'logo',
      'react',
      'render',
    ])
  })
})

describe('GraphSearchLogic', () => {
  it('requires the characters in order', () => {
    expect(GraphSearchLogic.score('cgr', 'CodeGraph')).not.toBeNull()
    expect(GraphSearchLogic.score('rgc', 'CodeGraph')).toBeNull()
  })

  it('prefers consecutive and word-start matches', () => {
    const tight = GraphSearchLogic.score('graph', 'src/graph/x.ts')!
    const loose = GraphSearchLogic.score('graph', 'src/gear/aphid.ts')!
    expect(tight).toBeGreaterThan(loose)
    const camel = GraphSearchLogic.score('cg', 'CodeGraph')!
    const middle = GraphSearchLogic.score('cg', 'ecgraph')!
    expect(camel).toBeGreaterThan(middle)
  })

  it('ranks a file name match above a match spread over its folders', () => {
    const results = GraphSearchLogic.search(graph.nodes, 'codegraph')
    expect(results[0].node.id).toBe('graph')
    expect(results[0].label).toBe('CodeGraph.tsx')
    expect(results[0].context).toBe('src/graph')
  })

  it('labels symbols with their file and line', () => {
    const [result] = GraphSearchLogic.search(graph.nodes, 'renderapp', 1)
    expect(result.label).toBe('renderApp')
    expect(result.context).toBe('src/App.tsx:1')
  })

  it('finds nothing for an empty query', () => {
    expect(GraphSearchLogic.search(graph.nodes, '  ')).toEqual([])
  })
})
