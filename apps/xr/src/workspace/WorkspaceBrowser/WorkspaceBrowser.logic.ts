import type { DirectoryListing, WorkspaceEntry } from '@/connection/protocol'
import { Euler, Quaternion, Vector3 } from 'three'

export interface WorkspaceRow {
  name: string
  path: string
  directory: boolean
  expanded: boolean
  depth: number
}

export interface FolderRow {
  name: string
  path: string
  kind: 'parent' | 'drive' | 'folder'
}

export class WorkspaceBrowserLogic {
  /** The folder picker's rows: `..`, or the other drives at a drive root, then subfolders. */
  static folderRows(listing: DirectoryListing): FolderRow[] {
    const up: FolderRow[] = listing.parent
      ? [{ name: '..', path: listing.parent, kind: 'parent' }]
      : listing.roots
          .filter((root) => root.path !== listing.path)
          .map((root) => ({ ...root, kind: 'drive' }))
    return [
      ...up,
      ...listing.directories.map((directory) => ({
        ...directory,
        kind: 'folder' as const,
      })),
    ]
  }

  static folderLabel(row: FolderRow): string {
    return `${row.kind === 'drive' ? '◆' : row.kind === 'parent' ? '↰' : '▸'} ${row.name}`
  }

  static rows(
    entries: WorkspaceEntry[],
    expanded: ReadonlySet<string>,
    depth = 0,
  ): WorkspaceRow[] {
    return entries.flatMap((entry) => {
      const directory = entry.kind === 'directory'
      const row = {
        name: entry.name,
        path: entry.path,
        directory,
        expanded: expanded.has(entry.path),
        depth,
      }
      return [
        row,
        ...(directory && row.expanded
          ? this.rows(entry.children, expanded, depth + 1)
          : []),
      ]
    })
  }

  static countFiles(entries: WorkspaceEntry[]): number {
    return entries.reduce(
      (count, entry) =>
        count + (entry.kind === 'file' ? 1 : this.countFiles(entry.children)),
      0,
    )
  }

  /** Trims a typed path and drops the quotes Explorer's "Copy as path" adds. */
  static cleanPath(path: string): string {
    const trimmed = path.trim()
    return /^(["']).*\1$/.test(trimmed) ? trimmed.slice(1, -1).trim() : trimmed
  }

  static toggle(expanded: ReadonlySet<string>, path: string): Set<string> {
    const next = new Set(expanded)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    return next
  }

  static label(row: WorkspaceRow): string {
    return `${' '.repeat(row.depth * 2)}${row.directory ? (row.expanded ? '▾' : '▸') : '◇'} ${row.name}`
  }

  static placement(position: Vector3, orientation: Quaternion) {
    const yaw = new Euler().setFromQuaternion(orientation, 'YXZ').y
    const offset = new Vector3(-1.25, -0.1, -1.5).applyAxisAngle(
      new Vector3(0, 1, 0),
      yaw,
    )
    return {
      position: position.clone().add(offset),
      rotation: Math.atan2(-offset.x, -offset.z),
    }
  }

  static page<T>(
    rows: T[],
    requested: number,
    size = 7,
  ): { rows: T[]; index: number; count: number } {
    const count = Math.max(1, Math.ceil(rows.length / size))
    const index = Math.min(Math.max(0, requested), count - 1)
    return { rows: rows.slice(index * size, (index + 1) * size), index, count }
  }
}
