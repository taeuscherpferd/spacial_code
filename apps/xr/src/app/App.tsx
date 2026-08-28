import { Canvas } from '@react-three/fiber'
import { createXRStore, XR } from '@react-three/xr'
import { useEffect, useMemo, useState } from 'react'
import { errorDismissed, sourceEdited, terminalCleared } from '@/app/appSlice'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import type { GraphNode } from '@/connection/protocol'
import { webSocketClient } from '@/connection/WebSocketClient'
import { WorkspaceScene } from '@/scene/WorkspaceScene'
import { WorkspaceTree } from '@/workspace/WorkspaceTree'
import styles from '@/app/App.module.scss'

const xrStore = createXRStore()

export const App = () => {
  const dispatch = useAppDispatch()
  const app = useAppSelector((state) => state.app)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set())
  const [focusHistory, setFocusHistory] = useState<string[]>([])
  const [activePanel, setActivePanel] = useState<'editor' | 'terminal' | null>(null)
  const [configuration, setConfiguration] = useState('')

  useEffect(() => {
    webSocketClient.connect(dispatch)
    return () => webSocketClient.disconnect()
  }, [dispatch])

  useEffect(() => {
    const firstConfiguration = app.runConfigurations?.[0]
    if (!configuration && firstConfiguration) {
      setConfiguration(firstConfiguration.name)
    }
  }, [app.runConfigurations, configuration])

  const selectedNode = useMemo(
    () => app.graph.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [app.graph.nodes, selectedNodeId],
  )
  const focusedNodeId = focusHistory.at(-1) ?? null
  const dirty = app.source !== null && app.source.content !== app.source.savedContent
  const running = app.process.status === 'running'

  const selectNode = (node: GraphNode): void => {
    setSelectedNodeId(node.id)
    setActivePanel('editor')
    webSocketClient.send({ type: 'openSource', path: node.path })
  }

  const openFile = (path: string): void => {
    const fileNode = app.graph.nodes.find((node) => node.kind === 'file' && node.path === path)
    if (fileNode) {
      selectNode(fileNode)
    } else {
      webSocketClient.send({ type: 'openSource', path })
    }
  }

  const toggleCollapsed = (id: string): void => {
    setCollapsedNodeIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const focusNode = (id: string): void => {
    if (focusedNodeId !== id) {
      setFocusHistory((current) => [...current, id])
    }
  }

  const goBack = (): void => {
    setFocusHistory((current) => current.slice(0, -1))
  }

  const save = (content: string): void => {
    if (app.source) {
      webSocketClient.send({ type: 'saveFile', path: app.source.path, content })
    }
  }

  const run = (): void => {
    if (!configuration) {
      return
    }
    dispatch(terminalCleared())
    setActivePanel('terminal')
    webSocketClient.send({ type: 'startRun', configuration })
  }

  const restart = (): void => {
    if (!configuration) {
      return
    }
    dispatch(terminalCleared())
    setActivePanel('terminal')
    webSocketClient.send({ type: 'restartRun', configuration })
  }

  const stop = (): void => webSocketClient.send({ type: 'stopRun' })

  return (
    <main className={styles.app} onContextMenu={(event) => event.preventDefault()}>
      <div className={styles.canvas}>
        <Canvas camera={{ position: [0, 0.65, 10.5], fov: 52 }} dpr={[1, 1.6]}>
          <XR store={xrStore}>
            <WorkspaceScene
              graph={app.graph}
              source={app.source}
              process={app.process}
              terminalChunks={app.terminalChunks}
              selectedNode={selectedNode}
              collapsedNodeIds={collapsedNodeIds}
              focusedNodeId={focusedNodeId}
              canGoBack={focusHistory.length > 0}
              activePanel={activePanel}
              onActivePanel={setActivePanel}
              onSelectNode={selectNode}
              onToggleCollapsed={toggleCollapsed}
              onFocusNode={focusNode}
              onBack={goBack}
              onSourceChange={(content) => dispatch(sourceEdited(content))}
              onSave={save}
              onRun={run}
              onStop={stop}
              onRestart={restart}
              onTerminalInput={(data) =>
                webSocketClient.send({ type: 'terminalInput', data })
              }
            />
          </XR>
        </Canvas>
      </div>

      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>S</div>
          <div>
            <div className={styles.brandName}>Spatial Code</div>
            <div className={styles.workspaceName}>
              {app.workspace?.name ?? 'Connecting to workspace'}
            </div>
          </div>
        </div>
        <div className={styles.connection}>
          <span
            className={`${styles.connectionDot} ${
              app.connection === 'connected'
                ? styles.connected
                : app.connection === 'disconnected'
                  ? styles.disconnected
                  : ''
            }`}
          />
          {app.connection}
        </div>
        <div className={styles.controls}>
          <select
            className={styles.select}
            value={configuration}
            onChange={(event) => setConfiguration(event.target.value)}
            aria-label="Run configuration"
          >
            {(app.runConfigurations ?? []).map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            disabled={running || !configuration}
            onClick={run}
          >
            ▶ Run
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.danger}`}
            disabled={!running}
            onClick={stop}
          >
            ■ Stop
          </button>
          <button
            type="button"
            className={styles.button}
            disabled={!running}
            onClick={restart}
          >
            ↻ Restart
          </button>
          <button
            type="button"
            className={styles.button}
            disabled={!dirty}
            onClick={() => app.source && save(app.source.content)}
          >
            Save
          </button>
          <span className={styles.divider} />
          <button
            type="button"
            className={`${styles.button} ${styles.xrButton}`}
            onClick={() => void xrStore.enterVR()}
          >
            Enter VR
          </button>
        </div>
      </header>

      <WorkspaceTree
        workspace={app.workspace}
        selectedPath={app.source?.path ?? null}
        onOpenFile={openFile}
      />

      <div className={styles.selection}>
        <span>Selected</span>
        <span className={styles.selectionName}>{selectedNode?.name ?? 'none'}</span>
        <button
          type="button"
          className={styles.button}
          disabled={!selectedNode}
          onClick={() => selectedNode && toggleCollapsed(selectedNode.id)}
        >
          {selectedNode && collapsedNodeIds.has(selectedNode.id) ? 'Expand' : 'Collapse'}
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={!selectedNode}
          onClick={() => selectedNode && focusNode(selectedNode.id)}
        >
          Focus
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={focusHistory.length === 0}
          onClick={goBack}
        >
          Back
        </button>
      </div>

      <div className={styles.hint}>
        drag nodes · double-click to focus · right-click to fold · orbit with the background
      </div>

      {app.error && (
        <div className={styles.error} role="alert">
          <span>{app.error}</span>
          <button type="button" onClick={() => dispatch(errorDismissed())} aria-label="Dismiss error">
            ✕
          </button>
        </div>
      )}
    </main>
  )
}
