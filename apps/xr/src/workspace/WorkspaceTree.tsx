import { ProjectPicker } from '@/workspace/ProjectPicker/ProjectPicker'
import type { WorkspaceBrowserControls } from '@/workspace/WorkspaceBrowser/hooks/useWorkspaceBrowser'
import { WorkspaceBrowserLogic } from '@/workspace/WorkspaceBrowser/WorkspaceBrowser.logic'
import styles from '@/workspace/WorkspaceTree.module.scss'

interface WorkspaceTreeProps {
  controls: WorkspaceBrowserControls
}

export const WorkspaceTree = ({ controls }: WorkspaceTreeProps) => (
  <aside className={styles.tree} aria-label="TypeScript workspace">
    <div className={styles.heading}>
      <span>{'Current Project'}</span>
      <span className={styles.count}>{controls.fileCount} TS</span>
    </div>
    <div className={styles.project}>
      <span className={styles.projectName} title={controls.workspace?.root}>
        {controls.workspace?.name ?? 'No project'}
      </span>
      <button
        type="button"
        disabled={controls.disabled}
        onClick={() => controls.browse(controls.workspace?.root ?? '')}
      >
        Change project
      </button>
    </div>
    <div className={styles.list}>
      {controls.rows.map((row) => (
        <button
          type="button"
          className={`${styles.entry} ${controls.selectedPath === row.path ? styles.selected : ''}`}
          key={row.path}
          disabled={controls.disabled}
          onClick={() => controls.selectRow(row.path, row.directory)}
        >
          {WorkspaceBrowserLogic.label(row)}
        </button>
      ))}
      {controls.rows.length === 0 && (
        <p className={styles.empty}>
          {controls.workspace
            ? 'No TypeScript files in this project.'
            : 'Waiting for the Rust workspace server…'}
        </p>
      )}
    </div>
    <ProjectPicker controls={controls} />
  </aside>
)
