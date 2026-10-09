import { describe, expect, it } from 'vitest'
import {
  appSlice,
  directoriesRequested,
  eventReceived,
  sourceEdited,
  workspaceSwitchRequested,
} from '@/app/appSlice'
import type { ServerEvent } from '@/connection/protocol'

const bootstrap = (root: string): ServerEvent => ({
  type: 'bootstrap',
  workspace: { root, name: root, entries: [] },
  graph: { nodes: [], edges: [] },
  runConfigurations: [
    { name: root, command: 'npm', args: ['start'], cwd: '.' },
  ],
})
const initial = () =>
  appSlice.reducer(undefined, eventReceived(bootstrap('/first')))

const sourceContent = (content = 'old', path = 'main.ts', version = 1) =>
  eventReceived({ type: 'sourceContent', path, content, version })

describe('workspace switching state', () => {
  it('clears previous source, terminal, process, and folder listing on a successful switch', () => {
    let state = initial()
    state = appSlice.reducer(
      state,
      eventReceived({
        type: 'sourceContent',
        path: 'main.ts',
        content: 'old',
        version: 1,
      }),
    )
    state = appSlice.reducer(state, sourceEdited('unsaved'))
    state = appSlice.reducer(
      state,
      eventReceived({ type: 'terminalOutput', data: 'old output' }),
    )
    state = appSlice.reducer(
      state,
      eventReceived({ type: 'processState', state: 'running' }),
    )
    state = appSlice.reducer(
      state,
      eventReceived({
        type: 'directoriesListed',
        listing: { path: '/first', parent: '/', directories: [] },
      }),
    )
    state = appSlice.reducer(state, workspaceSwitchRequested())
    expect(state.source?.content).toBe('unsaved')
    state = appSlice.reducer(state, eventReceived(bootstrap('/second')))
    expect(state.workspace?.root).toBe('/second')
    expect(state.runConfigurations[0].name).toBe('/second')
    expect(state.source).toBeNull()
    expect(state.sourceDrafts).toEqual([
      { workspaceRoot: '/first', path: 'main.ts', content: 'unsaved' },
    ])
    expect(state.terminalChunks).toEqual([])
    expect(state.process).toEqual({ status: 'idle' })
    expect(state.directoryListing).toBeNull()
    expect(state.switchingWorkspace).toBe(false)
    expect(state.recentWorkspaces).toEqual(['/second', '/first'])
  })
  it('recovers a remote-switch draft without leaking it into another project with the same file path', () => {
    let state = appSlice.reducer(initial(), sourceContent())
    state = appSlice.reducer(state, sourceEdited('first draft'))
    state = appSlice.reducer(state, eventReceived(bootstrap('/second')))
    expect(state.source).toBeNull()
    state = appSlice.reducer(state, sourceContent('second saved'))
    expect(state.source?.content).toBe('second saved')
    state = appSlice.reducer(state, sourceEdited('second draft'))
    state = appSlice.reducer(state, eventReceived(bootstrap('/third')))
    state = appSlice.reducer(state, eventReceived(bootstrap('/first')))
    state = appSlice.reducer(
      state,
      sourceContent('updated on disk', 'main.ts', 2),
    )
    expect(state.source).toEqual({
      path: 'main.ts',
      content: 'first draft',
      savedContent: 'updated on disk',
      version: 2,
      savedVersion: 2,
    })
    state = appSlice.reducer(state, eventReceived(bootstrap('/second')))
    state = appSlice.reducer(state, sourceContent('second saved'))
    expect(state.source?.content).toBe('second draft')
  })
  it('keeps recovered drafts when opening other files or reloading the same source', () => {
    let state = appSlice.reducer(initial(), sourceContent())
    state = appSlice.reducer(state, sourceEdited('draft'))
    state = appSlice.reducer(state, eventReceived(bootstrap('/second')))
    state = appSlice.reducer(state, eventReceived(bootstrap('/first')))
    state = appSlice.reducer(state, sourceContent())
    state = appSlice.reducer(state, sourceContent('another file', 'other.ts'))
    expect(state.source?.content).toBe('another file')
    state = appSlice.reducer(state, sourceContent())
    expect(state.source?.content).toBe('draft')
    state = appSlice.reducer(state, sourceContent('new saved source'))
    expect(state.source?.content).toBe('draft')
    expect(state.source?.savedContent).toBe('new saved source')
    expect(state.sourceDrafts).toEqual([])
  })
  it('does not retain saved or reverted drafts through later switches', () => {
    for (const save of [true, false]) {
      let state = appSlice.reducer(initial(), sourceContent())
      state = appSlice.reducer(state, sourceEdited('draft'))
      state = appSlice.reducer(state, eventReceived(bootstrap('/second')))
      state = appSlice.reducer(state, eventReceived(bootstrap('/first')))
      state = appSlice.reducer(state, sourceContent())
      state = appSlice.reducer(
        state,
        save
          ? eventReceived({ type: 'fileSaved', path: 'main.ts', version: 2 })
          : sourceEdited('old'),
      )
      state = appSlice.reducer(state, eventReceived(bootstrap('/second')))
      expect(state.sourceDrafts).toEqual([])
      state = appSlice.reducer(state, eventReceived(bootstrap('/first')))
      state = appSlice.reducer(state, sourceContent('latest saved source'))
      expect(state.source?.content).toBe('latest saved source')
    }
  })
  it('preserves edits on failure and when reopening the current project', () => {
    let state = appSlice.reducer(
      initial(),
      eventReceived({
        type: 'sourceContent',
        path: 'main.ts',
        content: 'old',
        version: 1,
      }),
    )
    state = appSlice.reducer(state, sourceEdited('unsaved'))
    state = appSlice.reducer(state, workspaceSwitchRequested())
    state = appSlice.reducer(
      state,
      eventReceived({ type: 'error', message: 'missing folder' }),
    )
    expect(state.source?.content).toBe('unsaved')
    expect(state.workspace?.root).toBe('/first')
    expect(state.switchingWorkspace).toBe(false)
    state = appSlice.reducer(state, eventReceived(bootstrap('/first')))
    expect(state.source?.content).toBe('unsaved')
    expect(state.recentWorkspaces).toEqual(['/first'])
  })
  it('clears stale folder listings when browsing and keeps recent projects bounded', () => {
    let state = appSlice.reducer(
      initial(),
      eventReceived({
        type: 'directoriesListed',
        listing: { path: '/first', parent: '/', directories: [] },
      }),
    )
    state = appSlice.reducer(state, directoriesRequested())
    expect(state.directoryListing).toBeNull()
    for (let index = 0; index < 10; index += 1)
      state = appSlice.reducer(
        state,
        eventReceived(bootstrap(`/project-${index}`)),
      )
    expect(state.recentWorkspaces).toHaveLength(8)
    state = appSlice.reducer(state, eventReceived(bootstrap('/project-8')))
    expect(state.recentWorkspaces[0]).toBe('/project-8')
    expect(
      state.recentWorkspaces.filter((root) => root === '/project-8'),
    ).toHaveLength(1)
  })
})
