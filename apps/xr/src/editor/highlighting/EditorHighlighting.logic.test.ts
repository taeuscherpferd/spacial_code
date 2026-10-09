import { describe, expect, it } from 'vitest'
import { CodeEditorLogic } from '@/editor/CodeEditor.logic'
import { EditorHighlightingLogic as Highlighting } from '@/editor/highlighting/EditorHighlighting.logic'

describe('EditorHighlightingLogic', () => {
  it('exports one palette for canvas and DOM rendering', () => {
    expect(Highlighting.tokenColors).toMatchObject({
      plain: '#d9def2',
      keyword: '#c792ea',
      string: '#c3e88d',
      number: '#f78c6c',
      comment: '#8793b6',
      diagnostic: '#ff758c',
    })
  })

  it('clips multiline ranges and preserves zero-width and end-of-line errors', () => {
    const diagnostics = [
      { start: 2, length: 6, message: 'Across lines' },
      { start: 6, length: 0, message: 'Missing token' },
      { start: 8, length: 0, message: 'End of line' },
      { start: 0, length: 1, message: 'Earlier line' },
      { start: 10, length: 1, message: 'Later line' },
    ]
    expect(Highlighting.lineDiagnostics(5, 3, diagnostics)).toEqual([
      { start: 0, end: 3, message: 'Across lines' },
      { start: 1, end: 1, message: 'Missing token' },
      { start: 3, end: 3, message: 'End of line' },
    ])
    expect(Highlighting.lineDiagnostics(8, 0, diagnostics)).toEqual([
      { start: 0, end: 0, message: 'Across lines' },
      { start: 0, end: 0, message: 'End of line' },
    ])
    expect(Highlighting.lineDiagnostics(0, 3, [])).toEqual([])
  })

  it('splits tokens at diagnostic boundaries without losing syntax or source text', () => {
    const text = 'const\tanswer = "<tag>" // note'
    const ranges = [
      { start: 2, end: 8, message: 'First' },
      { start: 4, end: 10, message: 'Overlap' },
      { start: 12, end: 12, message: 'Zero width' },
    ]
    const tokens = Highlighting.tokens(CodeEditorLogic.tokenize(text), ranges)
    expect(tokens.map((token) => token.text).join('')).toBe(text)
    expect(tokens.slice(0, 3)).toEqual([
      { text: 'co', start: 0, kind: 'keyword', diagnostic: false },
      { text: 'ns', start: 2, kind: 'keyword', diagnostic: true },
      { text: 't', start: 4, kind: 'keyword', diagnostic: true },
    ])
    expect(tokens.find((token) => token.start === 10)?.diagnostic).toBe(false)
    expect(tokens.find((token) => token.text === '"<tag>"')?.kind).toBe(
      'string',
    )
    expect(tokens.at(-1)?.kind).toBe('comment')
  })

  it('builds offset-aware lines with blank lines and end-of-file markers', () => {
    const text = 'const x = 1\n\n'
    const lines = Highlighting.lines(text, [
      { start: 6, length: 1, message: 'Invalid identifier' },
      { start: text.length, length: 0, message: 'Unexpected end' },
    ])
    expect(lines.map((line) => line.text)).toEqual(['const x = 1', '', ''])
    expect(lines.map((line) => line.startOffset)).toEqual([0, 12, 13])
    expect(
      lines[0].tokens.find((token) => token.text === 'x')?.diagnostic,
    ).toBe(true)
    expect(lines[2].markers).toEqual([
      { start: 0, end: 0, message: 'Unexpected end' },
    ])
    expect(Highlighting.lines('', [])[0]).toMatchObject({
      text: '',
      tokens: [],
      markers: [],
    })
  })

  it('preserves ordinary tokens and handles empty source lines', () => {
    expect(Highlighting.tokens(CodeEditorLogic.tokenize('42'), [])).toEqual([
      { text: '42', start: 0, kind: 'number', diagnostic: false },
    ])
    expect(Highlighting.tokens(CodeEditorLogic.tokenize(''), [])).toEqual([])
    expect(Highlighting.tokens([], [])).toEqual([])
  })
})
