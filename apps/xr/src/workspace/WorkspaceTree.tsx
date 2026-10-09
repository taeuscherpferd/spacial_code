import styles from '@/workspace/WorkspaceTree.module.scss'
import type { WorkspaceBrowserControls } from '@/workspace/WorkspaceBrowser/hooks/useWorkspaceBrowser'
import { WorkspaceBrowserLogic } from '@/workspace/WorkspaceBrowser/WorkspaceBrowser.logic'
import { useState } from 'react'

interface WorkspaceTreeProps {
  controls: WorkspaceBrowserControls
}

export const WorkspaceTree = ({ controls }: WorkspaceTreeProps) => {
  const [path, setPath] = useState('')
  return (
    <aside className={styles.tree} aria-label="TypeScript workspace">
      <div className={styles.heading}>
        <span>{controls.workspace?.name ?? 'Workspace'}</span>
        <span className={styles.count}>{controls.fileCount} TS</span>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          disabled={controls.disabled}
          onClick={() => controls.browse(controls.workspace?.root ?? '')}
        >
          Choose project
        </button>
        {controls.browsing && (
          <button type="button" onClick={controls.closeBrowser}>
            Files
          </button>
        )}
      </div>
      {controls.switching && (
        <p className={styles.empty} role="status">
          Opening project…
        </p>
      )}
      {controls.pendingPath && (
        <div className={styles.confirmation} role="alert">
          <p>
            Keep unsaved changes as a draft and open {controls.pendingPath}?
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              disabled={controls.disabled}
              onClick={controls.confirmOpen}
            >
              Keep draft &amp; open
            </button>
            <button type="button" onClick={controls.cancelOpen}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {controls.browsing ? (
        <div className={styles.list}>
          <form
            className={styles.pathForm}
            onSubmit={(event) => {
              event.preventDefault()
              controls.browse(path)
            }}
          >
            <label htmlFor="project-path">Folder on server computer</label>
            <input
              id="project-path"
              value={path}
              placeholder={controls.listing?.path ?? controls.workspace?.root}
              onChange={(event) => setPath(event.target.value)}
            />
            <div className={styles.actions}>
              <button disabled={controls.disabled} type="submit">
                Browse path
              </button>
              <button
                disabled={controls.disabled || !path.trim()}
                type="button"
                onClick={() => controls.requestOpen(path)}
              >
                Open path
              </button>
            </div>
          </form>
          {controls.listing ? (
            <>
              <p className={styles.folderPath}>{controls.listing.path}</p>
              <div className={styles.actions}>
                <button
                  type="button"
                  disabled={controls.disabled || !controls.listing.parent}
                  onClick={() =>
                    controls.listing?.parent &&
                    controls.browse(controls.listing.parent)
                  }
                >
                  Up
                </button>
                <button
                  type="button"
                  disabled={controls.disabled}
                  onClick={() =>
                    controls.listing &&
                    controls.requestOpen(controls.listing.path)
                  }
                >
                  Open this folder
                </button>
              </div>
              {controls.listing.directories.map((directory) => (
                <button
                  type="button"
                  className={styles.entry}
                  key={directory.path}
                  disabled={controls.disabled}
                  onClick={() => controls.browse(directory.path)}
                >
                  ▸ {directory.name}
                </button>
              ))}
              {controls.listing.directories.length === 0 && (
                <p className={styles.empty}>
                  No subfolders. You can open this folder.
                </p>
              )}
            </>
          ) : (
            <p className={styles.empty}>
              {controls.error ?? 'Loading folders…'}
            </p>
          )}
          {controls.recentWorkspaces.length > 1 && (
            <>
              <p className={styles.heading}>Recent projects</p>
              {controls.recentWorkspaces
                .filter((root) => root !== controls.workspace?.root)
                .map((root) => (
                  <button
                    type="button"
                    className={styles.entry}
                    disabled={controls.disabled}
                    key={root}
                    onClick={() => controls.requestOpen(root)}
                  >
                    {root}
                  </button>
                ))}
            </>
          )}
        </div>
      ) : (
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
      )}
    </aside>
  )
}
