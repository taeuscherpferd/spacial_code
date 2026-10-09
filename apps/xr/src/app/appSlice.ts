import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type {
  ConnectionStatus,
  DirectoryListing,
  ProcessState,
  ProgramGraph,
  RunConfiguration,
  ServerEvent,
  SourceDocument,
  WorkspaceSnapshot,
} from '@/connection/protocol'

interface SourceDraft {
  workspaceRoot: string
  path: string
  content: string
}

interface AppState {
  connection: ConnectionStatus
  workspace: WorkspaceSnapshot | null
  graph: ProgramGraph
  runConfigurations: RunConfiguration[]
  process: ProcessState
  source: SourceDocument | null
  sourceDrafts: SourceDraft[]
  terminalChunks: string[]
  error: string | null
  directoryListing: DirectoryListing | null
  switchingWorkspace: boolean
  recentWorkspaces: string[]
}

const initialState: AppState = {
  connection: 'connecting',
  workspace: null,
  graph: { nodes: [], edges: [] },
  runConfigurations: [],
  process: { status: 'idle' },
  source: null,
  sourceDrafts: [],
  terminalChunks: [],
  error: null,
  directoryListing: null,
  switchingWorkspace: false,
  recentWorkspaces: [],
}

const rememberSourceDraft = (state: AppState): void => {
  if (!state.workspace || !state.source) return
  const { root } = state.workspace
  const { path, content, savedContent } = state.source
  state.sourceDrafts = state.sourceDrafts.filter(
    (draft) => draft.workspaceRoot !== root || draft.path !== path,
  )
  if (content !== savedContent) {
    state.sourceDrafts.push({ workspaceRoot: root, path, content })
  }
}

const processState = (
  event: Extract<ServerEvent, { type: 'processState' }>,
): ProcessState => {
  if (event.state === 'idle' || event.state === 'running') {
    return { status: event.state }
  }
  if ('exited' in event.state) {
    return { status: 'exited', code: event.state.exited.code }
  }
  return { status: 'failed', message: event.state.failed.message }
}

export const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    connectionChanged(state, action: PayloadAction<ConnectionStatus>) {
      state.connection = action.payload
    },
    sourceEdited(state, action: PayloadAction<string>) {
      if (state.source) {
        state.source.content = action.payload
      }
    },
    terminalCleared(state) {
      state.terminalChunks = []
    },
    workspaceSwitchRequested(state) {
      state.switchingWorkspace = true
      state.error = null
    },
    directoriesRequested(state) {
      state.directoryListing = null
      state.error = null
    },
    errorDismissed(state) {
      state.error = null
    },
    eventReceived(state, action: PayloadAction<ServerEvent>) {
      const event = action.payload
      switch (event.type) {
        case 'directoriesListed':
          state.directoryListing = event.listing
          break
        case 'bootstrap':
          if (state.workspace?.root !== event.workspace.root) {
            rememberSourceDraft(state)
            state.source = null
            state.terminalChunks = []
            state.process = { status: 'idle' }
            state.directoryListing = null
          }
          state.switchingWorkspace = false
          state.error = null
          state.recentWorkspaces = [
            event.workspace.root,
            ...state.recentWorkspaces.filter(
              (root) => root !== event.workspace.root,
            ),
          ].slice(0, 8)
          state.workspace = event.workspace
          state.graph = event.graph
          state.runConfigurations = event.runConfigurations
          state.connection = 'connected'
          break
        case 'workspaceChanged':
          state.workspace = event.workspace
          state.graph = event.graph
          break
        case 'sourceContent': {
          rememberSourceDraft(state)
          const draftIndex = state.sourceDrafts.findIndex(
            (draft) =>
              draft.workspaceRoot === state.workspace?.root &&
              draft.path === event.path,
          )
          const draft = state.sourceDrafts[draftIndex]
          state.source = {
            path: event.path,
            content: draft?.content ?? event.content,
            savedContent: event.content,
            version: event.version,
            savedVersion: event.version,
          }
          if (draftIndex !== -1) state.sourceDrafts.splice(draftIndex, 1)
          break
        }
        case 'fileSaved':
          if (state.source?.path === event.path) {
            state.source.savedVersion = event.version
            state.source.version = event.version
            state.source.savedContent = state.source.content
          }
          break
        case 'terminalOutput':
          state.terminalChunks.push(event.data)
          if (state.terminalChunks.length > 2_000) {
            state.terminalChunks.splice(0, state.terminalChunks.length - 2_000)
          }
          break
        case 'processState':
          state.process = processState(event)
          break
        case 'error':
          state.switchingWorkspace = false
          state.error = event.message
          break
      }
    },
  },
})

export const {
  connectionChanged,
  directoriesRequested,
  workspaceSwitchRequested,
  errorDismissed,
  eventReceived,
  sourceEdited,
  terminalCleared,
} = appSlice.actions
