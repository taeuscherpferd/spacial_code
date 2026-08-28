import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type {
  ConnectionStatus,
  ProcessState,
  ProgramGraph,
  RunConfiguration,
  ServerEvent,
  SourceDocument,
  WorkspaceSnapshot,
} from '@/connection/protocol'

interface AppState {
  connection: ConnectionStatus
  workspace: WorkspaceSnapshot | null
  graph: ProgramGraph
  runConfigurations: RunConfiguration[]
  process: ProcessState
  source: SourceDocument | null
  terminalChunks: string[]
  error: string | null
}

const initialState: AppState = {
  connection: 'connecting',
  workspace: null,
  graph: { nodes: [], edges: [] },
  runConfigurations: [],
  process: { status: 'idle' },
  source: null,
  terminalChunks: [],
  error: null,
}

const processState = (event: Extract<ServerEvent, { type: 'processState' }>): ProcessState => {
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
    errorDismissed(state) {
      state.error = null
    },
    eventReceived(state, action: PayloadAction<ServerEvent>) {
      const event = action.payload
      switch (event.type) {
        case 'bootstrap':
          state.workspace = event.workspace
          state.graph = event.graph
          state.runConfigurations = event.runConfigurations
          state.connection = 'connected'
          break
        case 'workspaceChanged':
          state.workspace = event.workspace
          state.graph = event.graph
          break
        case 'sourceContent':
          state.source = {
            path: event.path,
            content: event.content,
            savedContent: event.content,
            version: event.version,
            savedVersion: event.version,
          }
          break
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
          state.error = event.message
          break
      }
    },
  },
})

export const {
  connectionChanged,
  errorDismissed,
  eventReceived,
  sourceEdited,
  terminalCleared,
} = appSlice.actions
