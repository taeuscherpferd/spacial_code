import { useEffect, useState } from 'react'
import { directoriesRequested, workspaceSwitchRequested } from '@/app/appSlice'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { webSocketClient } from '@/connection/WebSocketClient'
import { WorkspaceBrowserLogic } from '@/workspace/WorkspaceBrowser/WorkspaceBrowser.logic'

export const useWorkspaceBrowser = (onOpenFile: (path: string) => void) => {
  const app = useAppSelector((state) => state.app)
  const dispatch = useAppDispatch()
  const [browsing, setBrowsing] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [pendingPath, setPendingPath] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const connected = app.connection === 'connected'
  const disabled = !connected || app.switchingWorkspace

  useEffect(() => {
    setBrowsing(false)
    setExpanded(new Set())
    setPendingPath(null)
    setPage(0)
  }, [app.workspace?.root])

  const browse = (path: string): void => {
    if (disabled) return
    setBrowsing(true)
    setPage(0)
    dispatch(directoriesRequested())
    webSocketClient.send({ type: 'browseDirectories', path })
  }

  const open = (path: string): void => {
    if (disabled || !path.trim()) return
    setPendingPath(null)
    dispatch(workspaceSwitchRequested())
    webSocketClient.send({ type: 'openWorkspace', path: path.trim() })
  }

  const requestOpen = (path: string): void => {
    if (disabled || !path.trim()) return
    if (
      app.source &&
      app.source.content !== app.source.savedContent &&
      path !== app.workspace?.root
    ) {
      setPendingPath(path)
    } else {
      open(path)
    }
  }

  return {
    workspace: app.workspace,
    selectedPath: app.source?.path ?? null,
    listing: app.directoryListing,
    recentWorkspaces: app.recentWorkspaces,
    error: app.error,
    switching: app.switchingWorkspace,
    disabled,
    browsing,
    pendingPath,
    page,
    setPage,
    rows: WorkspaceBrowserLogic.rows(app.workspace?.entries ?? [], expanded),
    fileCount: WorkspaceBrowserLogic.countFiles(app.workspace?.entries ?? []),
    browse,
    requestOpen,
    confirmOpen: () => pendingPath && open(pendingPath),
    cancelOpen: () => setPendingPath(null),
    closeBrowser: () => {
      setBrowsing(false)
      setPendingPath(null)
      setPage(0)
    },
    selectRow: (path: string, directory: boolean) => {
      if (disabled) return
      if (directory)
        setExpanded((current) => WorkspaceBrowserLogic.toggle(current, path))
      else onOpenFile(path)
    },
  }
}

export type WorkspaceBrowserControls = ReturnType<typeof useWorkspaceBrowser>
