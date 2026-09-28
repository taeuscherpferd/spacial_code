import { useEffect, useState } from 'react'
import type { DiagnosticsResponse } from '@/editor/diagnostics/EditorDiagnostics.logic'

export const useEditorDiagnostics = (path: string, text: string) => {
  const [result, setResult] = useState<DiagnosticsResponse | null>(null)
  const [failed, setFailed] = useState(false)
  const [worker, setWorker] = useState<Worker | null>(null)
  useEffect(() => {
    const instance = new Worker(
      new URL('../diagnostics/diagnostics.worker.ts', import.meta.url),
      { type: 'module' },
    )
    instance.onmessage = (event: MessageEvent<DiagnosticsResponse>) =>
      setResult(event.data)
    instance.onerror = () => setFailed(true)
    setWorker(instance)
    return () => instance.terminate()
  }, [])
  useEffect(() => {
    const timeout = window.setTimeout(
      () => worker?.postMessage({ path, text }),
      250,
    )
    return () => window.clearTimeout(timeout)
  }, [worker, path, text])
  const current = result?.path === path && result.text === text
  return {
    diagnostics: current ? result.diagnostics : [],
    status: failed
      ? 'Syntax checks unavailable'
      : current
        ? `${result.diagnostics.length} syntax errors`
        : 'Checking syntax…',
  }
}
