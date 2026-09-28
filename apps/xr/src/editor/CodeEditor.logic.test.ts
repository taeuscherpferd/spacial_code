import { describe, expect, it } from 'vitest'
import { CodeEditorLogic } from '@/editor/CodeEditor.logic'

describe('CodeEditorLogic', () => {
  it('edits a selection and restores it through undo and redo', () => {
    let state = CodeEditorLogic.create('hello world')
    state = CodeEditorLogic.setCursor(state, 5)
    state = CodeEditorLogic.setCursor(state, 11, true)
    state = CodeEditorLogic.insert(state, ' spatial code')
    expect(state.text).toBe('hello spatial code')
    state = CodeEditorLogic.undo(state)
    expect(state.text).toBe('hello world')
    expect(CodeEditorLogic.redo(state).text).toBe('hello spatial code')
  })

  it('moves vertically while preserving the intended column', () => {
    let state = CodeEditorLogic.create('alpha\nbeta\ngamma')
    state = CodeEditorLogic.setCursor(state, 3)
    state = CodeEditorLogic.move(state, 'down', false)
    expect(state.cursor).toBe(9)
  })

  it('virtualizes visible lines and reveals the cursor', () => {
    let state = CodeEditorLogic.create('one\ntwo\nthree\nfour', 4)
    state = CodeEditorLogic.revealCursor({ ...state, scrollLine: 0 }, 2)
    expect(state.scrollLine).toBe(2)
    expect(
      CodeEditorLogic.visibleLines(state, 2).map((line) => line.text),
    ).toEqual(['three', 'four'])
  })

  it('assigns basic syntax colors', () => {
    const tokens = CodeEditorLogic.tokenize('const answer = 42 // important')
    expect(tokens.find((token) => token.text === 'const')?.kind).toBe('keyword')
    expect(tokens.find((token) => token.text === '42')?.kind).toBe('number')
    expect(tokens.at(-1)?.kind).toBe('comment')
  })

  it('deletes in both directions and keeps boundary edits stable', () => {
    let state = CodeEditorLogic.setCursor(CodeEditorLogic.create('abc'), 1)
    state = CodeEditorLogic.deleteBackward(state)
    expect(state.text).toBe('bc')
    state = CodeEditorLogic.deleteForward(state)
    expect(state.text).toBe('c')
    expect(
      CodeEditorLogic.deleteBackward(CodeEditorLogic.create('x')).text,
    ).toBe('x')
    const end = CodeEditorLogic.setCursor(CodeEditorLogic.create('x'), 1)
    expect(CodeEditorLogic.deleteForward(end).text).toBe('x')
  })

  it('selects text and clamps scrolling to the document', () => {
    let state = CodeEditorLogic.selectAll(
      CodeEditorLogic.create('one\ntwo\nthree'),
    )
    expect(CodeEditorLogic.selectedText(state)).toBe('one\ntwo\nthree')
    state = CodeEditorLogic.scroll(state, 100, 2)
    expect(state.scrollLine).toBe(1)
    state = CodeEditorLogic.scroll(state, -100, 2)
    expect(state.scrollLine).toBe(0)
  })
})

describe('editor indentation', () => {
  it('inherits indentation, adds a level after brackets and preserves CRLF', () => {
    const text = '  if (ready) {'
    const next = CodeEditorLogic.newline(
      CodeEditorLogic.setCursor(CodeEditorLogic.create(text), text.length),
    )
    expect(next.text).toBe(text + '\n    ')
    expect(CodeEditorLogic.undo(next).text).toBe(text)
    const windows = 'first\r\n\tsecond'
    expect(
      CodeEditorLogic.newline(
        CodeEditorLogic.setCursor(
          CodeEditorLogic.create(windows),
          windows.length,
        ),
      ).text,
    ).toBe(windows + '\r\n\t')
    expect(CodeEditorLogic.newline(CodeEditorLogic.create('')).text).toBe('\n')
  })
})

describe('native input selection', () => {
  it('preserves forward/backward selections and collapsed cursors', () => {
    const state = CodeEditorLogic.create('hello')
    expect(CodeEditorLogic.setSelection(state, 1, 4)).toMatchObject({
      anchor: 1,
      cursor: 4,
    })
    expect(CodeEditorLogic.setSelection(state, 1, 4, true)).toMatchObject({
      anchor: 4,
      cursor: 1,
    })
    expect(CodeEditorLogic.setSelection(state, 2, 2)).toMatchObject({
      anchor: null,
      cursor: 2,
    })
  })
})

describe('editor boundaries', () => {
  it('moves and extends selections at line and document boundaries', () => {
    let state = CodeEditorLogic.create('ab\nc')
    expect(CodeEditorLogic.move(state, 'left', false).cursor).toBe(0)
    state = CodeEditorLogic.move(state, 'right', true)
    expect(state).toMatchObject({ cursor: 1, anchor: 0 })
    state = CodeEditorLogic.move(state, 'end', true)
    expect(state).toMatchObject({ cursor: 2, anchor: 0 })
    state = CodeEditorLogic.move(state, 'home', false)
    expect(state).toMatchObject({ cursor: 0, anchor: null })
    state = CodeEditorLogic.move(state, 'down', false)
    expect(state.cursor).toBe(3)
    expect(CodeEditorLogic.move(state, 'up', false).cursor).toBe(0)
    expect(CodeEditorLogic.undo(state)).toBe(state)
    expect(CodeEditorLogic.redo(state)).toBe(state)
    expect(CodeEditorLogic.setCursor(state, -1).cursor).toBe(0)
    expect(CodeEditorLogic.setCursor(state, 99).cursor).toBe(4)
  })
  it('deletes selected ranges in either direction and reveals above the viewport', () => {
    const state = CodeEditorLogic.selectAll(CodeEditorLogic.create('abc'))
    expect(CodeEditorLogic.deleteBackward(state).text).toBe('')
    expect(CodeEditorLogic.deleteForward(state).text).toBe('')
    const scrolled = { ...CodeEditorLogic.create('a\nb\nc'), scrollLine: 2 }
    expect(CodeEditorLogic.revealCursor(scrolled, 2).scrollLine).toBe(0)
    const visible = CodeEditorLogic.visibleLines(state, 1)[0]
    expect(visible).toMatchObject({ selectionStart: 0, selectionEnd: 3 })
    expect(
      CodeEditorLogic.visibleLines(CodeEditorLogic.create('a\nb'), 2)[1]
        .cursorColumn,
    ).toBeNull()
  })
  it('renders empty lines and common literal token kinds', () => {
    expect(CodeEditorLogic.tokenize('')).toEqual([
      { text: '', start: 0, kind: 'plain' },
    ])
    expect(CodeEditorLogic.tokenize('"hello"')[0].kind).toBe('string')
    expect(CodeEditorLogic.tokenize('plain')[0].kind).toBe('plain')
  })
})
