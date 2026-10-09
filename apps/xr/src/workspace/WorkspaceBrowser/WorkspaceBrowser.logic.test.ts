import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import type { WorkspaceEntry } from '@/connection/protocol'
import { WorkspaceBrowserLogic } from '@/workspace/WorkspaceBrowser/WorkspaceBrowser.logic'

const entries: WorkspaceEntry[] = [
  {
    name: 'src',
    path: 'src',
    kind: 'directory',
    children: [
      {
        name: 'nested',
        path: 'src/nested',
        kind: 'directory',
        children: [
          {
            name: 'main.ts',
            path: 'src/nested/main.ts',
            kind: 'file',
            children: [],
          },
        ],
      },
    ],
  },
  { name: 'root.ts', path: 'root.ts', kind: 'file', children: [] },
]

describe('WorkspaceBrowserLogic', () => {
  it('counts files independently of expanded directories', () => {
    expect(WorkspaceBrowserLogic.countFiles(entries)).toBe(2)
    expect(WorkspaceBrowserLogic.countFiles([])).toBe(0)
  })
  it('flattens only expanded folders with indentation and disclosure labels', () => {
    const collapsed = WorkspaceBrowserLogic.rows(entries, new Set())
    expect(collapsed.map((row) => row.path)).toEqual(['src', 'root.ts'])
    expect(WorkspaceBrowserLogic.label(collapsed[0])).toBe('▸ src')
    expect(WorkspaceBrowserLogic.label(collapsed[1])).toBe('◇ root.ts')
    const expanded = WorkspaceBrowserLogic.rows(
      entries,
      new Set(['src', 'src/nested']),
    )
    expect(expanded.map((row) => row.depth)).toEqual([0, 1, 2, 0])
    expect(WorkspaceBrowserLogic.label(expanded[0])).toBe('▾ src')
    expect(WorkspaceBrowserLogic.label(expanded[2])).toBe('    ◇ main.ts')
  })
  it('toggles expansion without changing the original set', () => {
    const original = new Set(['src'])
    expect(WorkspaceBrowserLogic.toggle(original, 'src').size).toBe(0)
    expect(WorkspaceBrowserLogic.toggle(original, 'new')).toEqual(
      new Set(['src', 'new']),
    )
    expect(original).toEqual(new Set(['src']))
  })
  it('paginates and clamps after folders collapse or change', () => {
    expect(WorkspaceBrowserLogic.page([], 10)).toEqual({
      rows: [],
      index: 0,
      count: 1,
    })
    expect(WorkspaceBrowserLogic.page([1, 2, 3, 4, 5], 1, 2)).toEqual({
      rows: [3, 4],
      index: 1,
      count: 3,
    })
    expect(WorkspaceBrowserLogic.page([1, 2, 3], 5, 2).rows).toEqual([3])
    expect(WorkspaceBrowserLogic.page([1], -3).index).toBe(0)
    expect(
      WorkspaceBrowserLogic.page(
        Array.from({ length: 8 }, (_, index) => index),
        1,
      ).rows,
    ).toEqual([7])
  })
  it('anchors the panel to the viewer’s left and rotates with their heading', () => {
    const position = new Vector3(2, 1.6, 3)
    const initial = WorkspaceBrowserLogic.placement(position, new Quaternion())
    expect(initial.position.toArray()).toEqual([0.75, 1.5, 1.5])
    expect(initial.rotation).toBeCloseTo(Math.atan2(1.25, 1.5))
    const turned = WorkspaceBrowserLogic.placement(
      position,
      new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2),
    )
    expect(turned.position.x).toBeCloseTo(0.5)
    expect(turned.position.z).toBeCloseTo(4.25)
    expect(position.toArray()).toEqual([2, 1.6, 3])
  })
})
