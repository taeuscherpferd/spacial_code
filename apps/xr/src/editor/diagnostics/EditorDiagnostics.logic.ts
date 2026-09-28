import * as ts from 'typescript'

export interface EditorDiagnostic {
  start: number
  length: number
  message: string
}

export interface DiagnosticsRequest {
  path: string
  text: string
}

export interface DiagnosticsResponse extends DiagnosticsRequest {
  diagnostics: EditorDiagnostic[]
}

export class EditorDiagnosticsLogic {
  static check(path: string, text: string): EditorDiagnostic[] {
    if (!/\.[cm]?[jt]sx?$/i.test(path)) return []
    const result = ts.transpileModule(text, {
      fileName: path,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        jsx: ts.JsxEmit.Preserve,
      },
    })
    return this.normalize(result.diagnostics)
  }

  static normalize(
    diagnostics: readonly ts.Diagnostic[] = [],
  ): EditorDiagnostic[] {
    return diagnostics.map((diagnostic) => ({
      start: diagnostic.start ?? 0,
      length: diagnostic.length ?? 1,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
    }))
  }
}
