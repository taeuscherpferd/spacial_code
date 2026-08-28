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
    expect(CodeEditorLogic.visibleLines(state, 2).map((line) => line.text)).toEqual([
      'three',
      'four',
    ])
  })

  it('assigns basic syntax colors', () => {
    const tokens = CodeEditorLogic.tokenize("const answer = 42 // important")
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
    expect(CodeEditorLogic.deleteBackward(CodeEditorLogic.create('x')).text).toBe('x')
    const end = CodeEditorLogic.setCursor(CodeEditorLogic.create('x'), 1)
    expect(CodeEditorLogic.deleteForward(end).text).toBe('x')
  })

  it('selects text and clamps scrolling to the document', () => {
    let state = CodeEditorLogic.selectAll(CodeEditorLogic.create('one\ntwo\nthree'))
    expect(CodeEditorLogic.selectedText(state)).toBe('one\ntwo\nthree')
    state = CodeEditorLogic.scroll(state, 100, 2)
    expect(state.scrollLine).toBe(1)
    state = CodeEditorLogic.scroll(state, -100, 2)
    expect(state.scrollLine).toBe(0)
  })
})
