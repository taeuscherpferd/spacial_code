import {
  EditorDiagnosticsLogic,
  type DiagnosticsRequest,
  type DiagnosticsResponse,
} from '@/editor/diagnostics/EditorDiagnostics.logic'

self.onmessage = (event: MessageEvent<DiagnosticsRequest>): void => {
  const { path, text } = event.data
  const response: DiagnosticsResponse = {
    path,
    text,
    diagnostics: EditorDiagnosticsLogic.check(path, text),
  }
  self.postMessage(response)
}
