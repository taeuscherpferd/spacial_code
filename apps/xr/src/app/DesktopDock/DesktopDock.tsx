import type { ProcessState, SourceDocument } from '@/connection/protocol'
import { DesktopEditor } from '@/editor/DesktopEditor/DesktopEditor'
import { DesktopTerminal } from '@/terminal/DesktopTerminal/DesktopTerminal'
import styles from './DesktopDock.module.scss'

interface DesktopDockProps {
  activePanel: 'editor' | 'terminal' | null
  document: SourceDocument | null
  focusLine: number
  terminalChunks: string[]
  process: ProcessState
  onActivePanelChange: (panel: 'editor' | 'terminal' | null) => void
  onSourceChange: (content: string) => void
  onSave: (content: string) => void
  onTerminalInput: (data: string) => void
}

export const DesktopDock = ({
  activePanel,
  document,
  focusLine,
  terminalChunks,
  process,
  onActivePanelChange,
  onSourceChange,
  onSave,
  onTerminalInput,
}: DesktopDockProps) => (
  <div className={styles.editorDock}>
    <div className={styles.dockTabs}>
      <button
        type="button"
        aria-pressed={activePanel !== 'terminal'}
        onClick={() => onActivePanelChange('editor')}
      >
        Editor
      </button>
      <button
        type="button"
        aria-pressed={activePanel === 'terminal'}
        onClick={() => onActivePanelChange('terminal')}
      >
        Terminal
      </button>
    </div>
    <div className={styles.dockContent} hidden={activePanel === 'terminal'}>
      <DesktopEditor
        document={document}
        focusLine={focusLine}
        onActivate={() => onActivePanelChange('editor')}
        onChange={onSourceChange}
        onSave={onSave}
      />
    </div>
    <div className={styles.dockContent} hidden={activePanel !== 'terminal'}>
      <DesktopTerminal
        chunks={terminalChunks}
        process={process}
        onInput={onTerminalInput}
      />
    </div>
  </div>
)
