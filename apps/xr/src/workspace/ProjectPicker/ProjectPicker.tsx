import { useEffect, useRef, useState } from 'react'
import styles from '@/workspace/ProjectPicker/ProjectPicker.module.scss'
import type { WorkspaceBrowserControls } from '@/workspace/WorkspaceBrowser/hooks/useWorkspaceBrowser'
import { WorkspaceBrowserLogic } from '@/workspace/WorkspaceBrowser/WorkspaceBrowser.logic'

interface ProjectPickerProps {
  controls: WorkspaceBrowserControls
}

/** A modal folder picker: navigate to a folder on the server computer and open it. */
export const ProjectPicker = ({ controls }: ProjectPickerProps) => {
  const dialog = useRef<HTMLDialogElement>(null)
  const { listing } = controls
  // The address bar follows navigation; typing a path and pressing Enter jumps to it.
  const [path, setPath] = useState('')
  const [shownListingPath, setShownListingPath] = useState(listing?.path)
  if (listing?.path !== shownListingPath) {
    setShownListingPath(listing?.path)
    setPath(listing?.path ?? '')
  }

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (controls.browsing && !element.open) element.showModal()
    if (!controls.browsing && element.open) element.close()
  }, [controls.browsing])

  const recent = controls.recentWorkspaces.filter(
    (root) => root !== controls.workspace?.root,
  )

  return (
    <dialog
      ref={dialog}
      className={styles.picker}
      aria-labelledby="project-picker-title"
      onClose={controls.closeBrowser}
    >
      <h2 id="project-picker-title">Open project</h2>
      <form
        className={styles.address}
        onSubmit={(event) => {
          event.preventDefault()
          controls.browse(path)
        }}
      >
        <input
          aria-label="Folder path on server computer"
          value={path}
          placeholder="Type or paste a folder path"
          onChange={(event) => setPath(event.target.value)}
        />
      </form>
      {controls.error && (
        <p className={styles.error} role="alert">
          {controls.error}
        </p>
      )}
      <div className={styles.body}>
        {recent.length > 0 && (
          <nav className={styles.recent} aria-label="Recent projects">
            <p className={styles.heading}>Recent</p>
            {recent.map((root) => (
              <button
                type="button"
                className={styles.entry}
                key={root}
                title={root}
                disabled={controls.disabled}
                onClick={() => controls.requestOpen(root)}
              >
                {root.split(/[\\/]/).filter(Boolean).pop() ?? root}
              </button>
            ))}
          </nav>
        )}
        <div className={styles.folders}>
          {listing ? (
            WorkspaceBrowserLogic.folderRows(listing).map((row) => (
              <button
                type="button"
                className={styles.entry}
                key={`${row.kind}:${row.path}`}
                disabled={controls.disabled}
                onClick={() => controls.browse(row.path)}
              >
                {WorkspaceBrowserLogic.folderLabel(row)}
              </button>
            ))
          ) : (
            <p className={styles.muted}>Loading folders…</p>
          )}
        </div>
      </div>
      <footer className={styles.footer}>
        {controls.pendingPath ? (
          <>
            <p className={styles.muted} role="alert">
              You have unsaved changes. Keep them as a draft and switch?
            </p>
            <button
              type="button"
              className={styles.primary}
              disabled={controls.disabled}
              onClick={controls.confirmOpen}
            >
              Keep draft &amp; open
            </button>
            <button type="button" onClick={controls.cancelOpen}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <p className={styles.muted} role="status">
              {controls.switching ? 'Opening project…' : null}
            </p>
            <button type="button" onClick={controls.closeBrowser}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.primary}
              disabled={controls.disabled || !listing}
              onClick={() => listing && controls.requestOpen(listing.path)}
            >
              Open folder
            </button>
          </>
        )}
      </footer>
    </dialog>
  )
}
