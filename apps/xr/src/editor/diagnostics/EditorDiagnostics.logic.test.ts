import { describe, expect, it } from 'vitest'
import * as ts from 'typescript'
import { EditorDiagnosticsLogic } from '@/editor/diagnostics/EditorDiagnostics.logic'

describe('EditorDiagnosticsLogic', () => {
  it('reports syntax errors at source offsets and clears them after correction', () => {
    expect(
      EditorDiagnosticsLogic.check('example.ts', 'const value = ;'),
    ).toEqual([
      expect.objectContaining({
        start: 14,
        length: 1,
        message: 'Expression expected.',
      }),
    ])
    expect(
      EditorDiagnosticsLogic.check('example.ts', 'const value = 1;'),
    ).toEqual([])
  })
  it('supports TSX and JavaScript without inventing type errors', () => {
    for (const path of [
      'file.tsx',
      'file.jsx',
      'file.mts',
      'file.cts',
      'file.mjs',
      'file.cjs',
    ]) {
      expect(
        EditorDiagnosticsLogic.check(path, 'const value = ;').length,
      ).toBeGreaterThan(0)
    }
    expect(
      EditorDiagnosticsLogic.check('file.tsx', 'const view = <div />'),
    ).toEqual([])
    expect(
      EditorDiagnosticsLogic.check('file.ts', 'const value: number = "text"'),
    ).toEqual([])
    expect(EditorDiagnosticsLogic.check('notes.md', 'const value = ;')).toEqual(
      [],
    )
  })
  it('handles compiler responses without locations or diagnostics', () => {
    expect(EditorDiagnosticsLogic.normalize()).toEqual([])
    const diagnostics: ts.Diagnostic[] = [
      {
        category: ts.DiagnosticCategory.Error,
        code: 1,
        file: undefined,
        start: undefined,
        length: undefined,
        messageText: 'Compiler error',
      },
    ]
    expect(EditorDiagnosticsLogic.normalize(diagnostics)).toEqual([
      { start: 0, length: 1, message: 'Compiler error' },
    ])
  })
})
