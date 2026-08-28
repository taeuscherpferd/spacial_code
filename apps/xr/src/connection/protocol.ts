export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

export type WorkspaceEntryKind = 'directory' | 'file'

export interface WorkspaceEntry {
  name: string
  path: string
  kind: WorkspaceEntryKind
  children: WorkspaceEntry[]
}

export interface WorkspaceSnapshot {
  name: string
  root: string
  entries: WorkspaceEntry[]
}

export type GraphNodeKind = 'file' | 'function' | 'class' | 'import' | 'export'

export interface GraphNode {
  id: string
  kind: GraphNodeKind
  name: string
  path: string
  startLine: number
  endLine: number
  detail: string | null
}

export type GraphEdgeKind = 'contains' | 'imports' | 'calls'

export interface GraphEdge {
  id: string
  source: string
  target: string
  kind: GraphEdgeKind
}

export interface ProgramGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface RunConfiguration {
  name: string
  command: string
  args: string[]
  cwd: string
}

export type ProcessState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'exited'; code: number | null }
  | { status: 'failed'; message: string }

export interface SourceDocument {
  path: string
  content: string
  savedContent: string
  version: number
  savedVersion: number
}

export type ServerEvent =
  | {
      type: 'bootstrap'
      workspace: WorkspaceSnapshot
      graph: ProgramGraph
      runConfigurations: RunConfiguration[]
    }
  | { type: 'workspaceChanged'; workspace: WorkspaceSnapshot; graph: ProgramGraph }
  | { type: 'sourceContent'; path: string; content: string; version: number }
  | { type: 'fileSaved'; path: string; version: number }
  | { type: 'terminalOutput'; data: string }
  | { type: 'processState'; state: ProcessStatePayload }
  | { type: 'error'; message: string }

export type ProcessStatePayload =
  | 'idle'
  | 'running'
  | { exited: { code: number | null } }
  | { failed: { message: string } }

export type ClientMessage =
  | { type: 'openSource'; path: string }
  | { type: 'saveFile'; path: string; content: string }
  | { type: 'refresh' }
  | { type: 'startRun'; configuration: string }
  | { type: 'stopRun' }
  | { type: 'restartRun'; configuration: string }
  | { type: 'terminalInput'; data: string }
  | { type: 'resizeTerminal'; cols: number; rows: number }
