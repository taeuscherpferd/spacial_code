import { describe, expect, it } from 'vitest'
import { CodeEditorLogic } from '@/editor/CodeEditor.logic'
import {
  EditorInputLogic,
  type NativeEditorInput,
} from '@/editor/EditorInput.logic'

const input = (
  overrides: Partial<NativeEditorInput> = {},
): NativeEditorInput => ({
  inputType: 'insertText',
  data: 'x',
  value: 'x',
  selectionStart: 1,
  selectionEnd: 1,
  backward: false,
  ...overrides,
})
const state = CodeEditorLogic.setCursor(
  CodeEditorLogic.create('before after'),
  7,
)

describe('native editor input', () => {
  it('inserts a Quest keyboard character without replacing the document', () => {
    const next = EditorInputLogic.apply(state, input(), true)
    expect(next.text).toBe('before xafter')
    expect(next.cursor).toBe(8)
    expect(CodeEditorLogic.undo(next)).toMatchObject({
      text: state.text,
      cursor: state.cursor,
      anchor: state.anchor,
    })
    expect(EditorInputLogic.apply(next, input({ data: 'y' }), true).text).toBe(
      'before xyafter',
    )
  })

  it('replaces only the selection, including backwards selections and paste', () => {
    const selected = CodeEditorLogic.setSelection(state, 0, 6, true)
    expect(EditorInputLogic.apply(selected, input(), true).text).toBe('x after')
    expect(
      EditorInputLogic.apply(
        selected,
        input({ inputType: 'insertFromPaste' }),
        true,
      ).text,
    ).toBe('x after')
  })

  it.each(['insertLineBreak', 'insertParagraph'])('indents %s', (inputType) => {
    const source = CodeEditorLogic.setCursor(CodeEditorLogic.create('  {'), 3)
    expect(
      EditorInputLogic.apply(source, input({ inputType }), true).text,
    ).toBe('  {\n    ')
  })

  it.each([
    ['deleteContentBackward', 'beforeafter'],
    ['deleteContentForward', 'before fter'],
  ])('applies %s without trusting the native buffer', (inputType, expected) => {
    expect(
      EditorInputLogic.apply(state, input({ inputType, value: '' }), true).text,
    ).toBe(expected)
  })

  it('supports native undo and redo', () => {
    const changed = EditorInputLogic.apply(state, input(), true)
    const undone = EditorInputLogic.apply(
      changed,
      input({ inputType: 'historyUndo' }),
      true,
    )
    expect(undone.text).toBe(state.text)
    expect(
      EditorInputLogic.apply(undone, input({ inputType: 'historyRedo' }), true)
        .text,
    ).toBe(changed.text)
  })

  it('rejects truncated or unrelated value-only buffers in immersive mode', () => {
    for (const value of [
      'x',
      'unrelated long buffer',
      'before different ending',
    ]) {
      expect(
        EditorInputLogic.apply(state, input({ data: null, value }), true),
      ).toBe(state)
    }
  })

  it('accepts value-only edits that preserve the surrounding source', () => {
    expect(
      EditorInputLogic.apply(
        state,
        input({ data: null, value: 'before xafter' }),
        true,
      ).text,
    ).toBe('before xafter')
    const selected = CodeEditorLogic.setSelection(state, 0, 6)
    expect(
      EditorInputLogic.apply(
        selected,
        input({ data: null, value: 'x after' }),
        true,
      ).text,
    ).toBe('x after')
  })

  it('preserves desktop native replacements and their selection', () => {
    expect(
      EditorInputLogic.apply(
        state,
        input({
          inputType: 'insertReplacementText',
          value: 'replacement',
          selectionStart: 2,
          selectionEnd: 4,
          backward: true,
        }),
        false,
      ),
    ).toMatchObject({ text: 'replacement', cursor: 2, anchor: 4 })
  })
})

describe('live composition', () => {
  it('shows every update and shrinking text while retaining one undo step', () => {
    let preview = state
    for (const data of ['h', 'he', 'hel', 'he', '', 'hello']) {
      preview = EditorInputLogic.compose(state, preview, data)
      expect(preview.text).toBe(`before ${data}after`)
      expect(preview.history).toHaveLength(1)
      expect(CodeEditorLogic.undo(preview).text).toBe(state.text)
    }
  })

  it('supports deletion during composition', () => {
    const preview = EditorInputLogic.compose(state, state, 'xy')
    expect(
      EditorInputLogic.compose(state, preview, null, 'deleteContentBackward')
        .text,
    ).toBe('before xafter')
    const forward = EditorInputLogic.compose(
      state,
      preview,
      null,
      'deleteContentForward',
    )
    expect(forward.text).toBe('before xyfter')
    expect(forward.history).toHaveLength(1)
  })

  it('accepts a complete native composition value but rejects truncated buffers', () => {
    expect(
      EditorInputLogic.compose(
        state,
        state,
        null,
        'insertCompositionText',
        'before hi after',
      ).text,
    ).toBe('before hi after')
    for (const value of [
      '',
      'wrong prefix long enough',
      'before wrong suffix',
    ]) {
      expect(
        EditorInputLogic.compose(
          state,
          state,
          null,
          'insertCompositionText',
          value,
        ),
      ).toBe(state)
    }
    expect(EditorInputLogic.compose(state, state, null)).toBe(state)
    const selection = CodeEditorLogic.setSelection(state, 0, 6, true)
    expect(EditorInputLogic.compose(selection, selection, 'new').text).toBe(
      'new after',
    )
  })

  it('compares cursor and anchor', () => {
    expect(EditorInputLogic.sameSelection(state, state)).toBe(true)
    expect(EditorInputLogic.sameSelection(state, { ...state, cursor: 0 })).toBe(
      false,
    )
    expect(EditorInputLogic.sameSelection(state, { ...state, anchor: 0 })).toBe(
      false,
    )
  })
})

describe('native value-only deletion', () => {
  it.each([
    ['', 'beforeafter', 6],
    ['', 'before fter', 7],
    ['deleteWordBackward', 'after', 0],
    ['deleteWordForward', 'before ', 7],
  ])(
    'accepts a deletion at the cursor (%s)',
    (inputType, value, selectionStart) => {
      expect(
        EditorInputLogic.apply(
          state,
          input({ inputType, value, data: null, selectionStart }),
          true,
        ).text,
      ).toBe(value)
    },
  )

  it('deletes an explicit selection and protects unrelated source', () => {
    const selected = CodeEditorLogic.setSelection(state, 0, 6)
    expect(
      EditorInputLogic.apply(
        selected,
        input({ inputType: 'deleteByCut', value: ' after', selectionStart: 0 }),
        true,
      ).text,
    ).toBe(' after')
    for (const [value, selectionStart] of [
      ['', 0],
      ['broken', 1],
      ['before after!', 0],
    ] as const) {
      expect(
        EditorInputLogic.apply(
          state,
          input({ inputType: '', data: null, value, selectionStart }),
          true,
        ),
      ).toBe(state)
    }
  })
})
