import type {
  GraphNode,
  ProcessState,
  ProgramGraph,
  SourceDocument,
} from '@/connection/protocol'
import { CodeEditor } from '@/editor/CodeEditor'
import { CodeGraph } from '@/graph/CodeGraph'
import { SpatialToolbar } from '@/scene/SpatialToolbar'
import { TerminalPanel } from '@/terminal/TerminalPanel'
import { Grid, Text } from '@react-three/drei'

interface WorkspaceSceneProps {
  graph: ProgramGraph
  source: SourceDocument | null
  process: ProcessState
  terminalChunks: string[]
  selectedNode: GraphNode | null
  collapsedNodeIds: ReadonlySet<string>
  focusedNodeId: string | null
  canGoBack: boolean
  activePanel: 'editor' | 'terminal' | null
  onActivePanel: (panel: 'editor' | 'terminal') => void
  onSelectNode: (node: GraphNode) => void
  onToggleCollapsed: (id: string) => void
  onFocusNode: (id: string) => void
  onBack: () => void
  onSourceChange: (content: string) => void
  onSave: (content: string) => void
  onRun: () => void
  onStop: () => void
  onRestart: () => void
  onTerminalInput: (data: string) => void
}

export const WorkspaceScene = ({
  graph,
  source,
  process,
  terminalChunks,
  selectedNode,
  collapsedNodeIds,
  focusedNodeId,
  canGoBack,
  activePanel,
  onActivePanel,
  onSelectNode,
  onToggleCollapsed,
  onFocusNode,
  onBack,
  onSourceChange,
  onSave,
  onRun,
  onStop,
  onRestart,
  onTerminalInput,
}: WorkspaceSceneProps) => (
  <>
    <color attach="background" args={['#070a12']} />
    <fog attach="fog" args={['#070a12', 10, 24]} />
    <ambientLight intensity={0.8} />
    <directionalLight position={[3, 7, 8]} intensity={2.2} color="#adc5ff" />
    <pointLight
      position={[-5, 2, 3]}
      intensity={12}
      color="#486dff"
      distance={9}
    />
    <Grid
      position={[0, -3.12, -0.4]}
      args={[24, 16]}
      cellSize={0.45}
      cellThickness={0.45}
      cellColor="#17203a"
      sectionSize={2.7}
      sectionThickness={0.85}
      sectionColor="#29355b"
      fadeDistance={15}
      fadeStrength={1.2}
      infiniteGrid
    />
    <Text position={[-3.2, 2.92, 0]} fontSize={0.16} color="#8792ba">
      LIVE PROGRAM GRAPH
    </Text>
    <CodeGraph
      graph={graph}
      selectedNodeId={selectedNode?.id ?? null}
      collapsedNodeIds={collapsedNodeIds}
      focusedNodeId={focusedNodeId}
      onSelect={onSelectNode}
      onToggleCollapsed={onToggleCollapsed}
      onFocus={onFocusNode}
    />
    <CodeEditor
      document={source}
      focusLine={selectedNode?.startLine ?? 1}
      active={activePanel === 'editor'}
      onActivate={() => onActivePanel('editor')}
      onChange={onSourceChange}
      onSave={onSave}
    />
    <TerminalPanel
      chunks={terminalChunks}
      process={process}
      active={activePanel === 'terminal'}
      onActivate={() => onActivePanel('terminal')}
      onInput={onTerminalInput}
    />
    <SpatialToolbar
      process={process}
      canSave={source !== null && source.content !== source.savedContent}
      canFocus={selectedNode !== null}
      canBack={canGoBack}
      canCollapse={selectedNode !== null}
      onRun={onRun}
      onStop={onStop}
      onRestart={onRestart}
      onSave={() => source && onSave(source.content)}
      onFocus={() => selectedNode && onFocusNode(selectedNode.id)}
      onBack={onBack}
      onCollapse={() => selectedNode && onToggleCollapsed(selectedNode.id)}
    />
    {/* <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={5} maxDistance={18} /> */}
  </>
)
