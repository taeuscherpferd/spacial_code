import {
  CodeEditorLogic,
  type SyntaxToken,
  type VisibleEditorLine,
} from '@/editor/CodeEditor.logic'
import type { EditorDiagnostic } from '@/editor/diagnostics/EditorDiagnostics.logic'
import colors from './EditorHighlighting.module.scss'

export interface LineDiagnostic {
  start: number
  end: number
  message: string
}

export interface HighlightedToken extends SyntaxToken {
  diagnostic: boolean
}

export interface HighlightedLine extends Omit<VisibleEditorLine, 'tokens'> {
  tokens: HighlightedToken[]
  markers: LineDiagnostic[]
}

export class EditorHighlightingLogic {
  static readonly tokenColors = {
    plain: colors.plain,
    keyword: colors.keyword,
    string: colors.string,
    number: colors.number,
    comment: colors.comment,
    diagnostic: colors.diagnostic,
  }

  static lines(
    text: string,
    diagnostics: EditorDiagnostic[],
  ): HighlightedLine[] {
    return CodeEditorLogic.visibleLines(
      CodeEditorLogic.create(text),
      Infinity,
    ).map((line) => {
      const ranges = this.lineDiagnostics(
        line.startOffset,
        line.text.length,
        diagnostics,
      )
      return {
        ...line,
        tokens: this.tokens(line.tokens, ranges),
        markers: ranges.filter((range) => range.start === range.end),
      }
    })
  }

  static lineDiagnostics(
    startOffset: number,
    length: number,
    diagnostics: EditorDiagnostic[],
  ): LineDiagnostic[] {
    return diagnostics.flatMap((diagnostic) => {
      const start = Math.max(diagnostic.start - startOffset, 0)
      const end = Math.min(
        diagnostic.start + diagnostic.length - startOffset,
        length,
      )
      return start > length || end < start
        ? []
        : [{ start, end, message: diagnostic.message }]
    })
  }

  static tokens(
    tokens: SyntaxToken[],
    diagnostics: LineDiagnostic[],
  ): HighlightedToken[] {
    return tokens.flatMap((token) => {
      const end = token.start + token.text.length
      const boundaries = [
        ...new Set([
          token.start,
          end,
          ...diagnostics
            .flatMap((diagnostic) => [diagnostic.start, diagnostic.end])
            .filter((offset) => offset > token.start && offset < end),
        ]),
      ].sort((left, right) => left - right)
      return boundaries.slice(0, -1).map((start, index) => ({
        start,
        text: token.text.slice(
          start - token.start,
          boundaries[index + 1] - token.start,
        ),
        kind: token.kind,
        diagnostic: diagnostics.some(
          (diagnostic) => diagnostic.start <= start && diagnostic.end > start,
        ),
      }))
    })
  }
}
