import { useMemo, useState } from 'react'
import type { WorkspaceEntry, WorkspaceSnapshot } from '@/connection/protocol'
import styles from '@/workspace/WorkspaceTree.module.scss'

interface WorkspaceTreeProps {
  workspace: WorkspaceSnapshot | null
  selectedPath: string | null
  onOpenFile: (path: string) => void
}

export const WorkspaceTree = ({
  workspace,
  selectedPath,
  onOpenFile,
}: WorkspaceTreeProps) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const fileCount = useMemo(
    () => countFiles(workspace?.entries ?? []),
    [workspace?.entries],
  )

  const toggleDirectory = (path: string): void => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  return (
    <aside className={styles.tree} aria-label="TypeScript workspace">
      <div className={styles.heading}>
        <span>Workspace</span>
        <span className={styles.count}>{fileCount} TS</span>
      </div>
      {workspace ? (
        <div className={styles.list}>
          {workspace.entries.map((entry) => (
            <WorkspaceEntryView
              key={entry.path}
              entry={entry}
              collapsed={collapsed}
              selectedPath={selectedPath}
              onOpenFile={onOpenFile}
              onToggleDirectory={toggleDirectory}
            />
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          Waiting for the Rust workspace server…
        </div>
      )}
    </aside>
  )
}

interface WorkspaceEntryViewProps {
  entry: WorkspaceEntry
  collapsed: ReadonlySet<string>
  selectedPath: string | null
  onOpenFile: (path: string) => void
  onToggleDirectory: (path: string) => void
}

const WorkspaceEntryView = ({
  entry,
  collapsed,
  selectedPath,
  onOpenFile,
  onToggleDirectory,
}: WorkspaceEntryViewProps) => {
  const isDirectory = entry.kind === 'directory'
  const isCollapsed = collapsed.has(entry.path)
  return (
    <div>
      <button
        type="button"
        className={`${styles.entry} ${selectedPath === entry.path ? styles.selected : ''}`}
        onClick={() =>
          isDirectory ? onToggleDirectory(entry.path) : onOpenFile(entry.path)
        }
      >
        <span className={styles.icon}>
          {isDirectory ? (isCollapsed ? '▸' : '▾') : '◇'}
        </span>
        <span>{entry.name}</span>
      </button>
      {isDirectory && !isCollapsed && (
        <div className={styles.children}>
          {entry.children.map((child) => (
            <WorkspaceEntryView
              key={child.path}
              entry={child}
              collapsed={collapsed}
              selectedPath={selectedPath}
              onOpenFile={onOpenFile}
              onToggleDirectory={onToggleDirectory}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const countFiles = (entries: WorkspaceEntry[]): number =>
  entries.reduce(
    (count, entry) =>
      count + (entry.kind === 'file' ? 1 : countFiles(entry.children)),
    0,
  )
