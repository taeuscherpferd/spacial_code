import { CodeEditorLogic, type EditorState } from '@/editor/CodeEditor.logic'

export interface NativeEditorInput {
  inputType: string
  data: string | null
  value: string
  selectionStart: number
  selectionEnd: number
  backward: boolean
}

export class EditorInputLogic {
  static sameSelection(left: EditorState, right: EditorState): boolean {
    return left.cursor === right.cursor && left.anchor === right.anchor
  }

  static compose(
    original: EditorState,
    current: EditorState,
    data: string | null,
    inputType = 'insertCompositionText',
    value = '',
  ): EditorState {
    if (data !== null) return CodeEditorLogic.insert(original, data)
    if (
      inputType === 'deleteContentBackward' ||
      inputType === 'deleteContentForward'
    ) {
      const next =
        inputType === 'deleteContentBackward'
          ? CodeEditorLogic.deleteBackward(current)
          : CodeEditorLogic.deleteForward(current)
      return { ...next, history: CodeEditorLogic.insert(original, '').history }
    }
    const start = Math.min(original.cursor, original.anchor ?? original.cursor)
    const end = Math.max(original.cursor, original.anchor ?? original.cursor)
    const prefix = original.text.slice(0, start)
    const suffix = original.text.slice(end)
    if (
      value.length >= prefix.length + suffix.length &&
      value.startsWith(prefix) &&
      value.endsWith(suffix)
    ) {
      return CodeEditorLogic.insert(
        original,
        value.slice(prefix.length, value.length - suffix.length),
      )
    }
    return current
  }

  static apply(
    state: EditorState,
    input: NativeEditorInput,
    immersive: boolean,
  ): EditorState {
    switch (input.inputType) {
      case 'insertText':
      case 'insertFromPaste':
        if (input.data !== null)
          return CodeEditorLogic.insert(state, input.data)
        break
      case 'insertLineBreak':
      case 'insertParagraph':
        return CodeEditorLogic.newline(state)
      case 'deleteContentBackward':
        return CodeEditorLogic.deleteBackward(state)
      case 'deleteContentForward':
        return CodeEditorLogic.deleteForward(state)
      case 'historyUndo':
        return CodeEditorLogic.undo(state)
      case 'historyRedo':
        return CodeEditorLogic.redo(state)
    }
    // Headset keyboards can expose only their input buffer as the textarea value.
    // Accept a value-only edit only when it preserves text outside our selection.
    if (immersive) {
      const deleted = this.nativeDeletion(state, input)
      if (deleted) return deleted
      const start = Math.min(state.cursor, state.anchor ?? state.cursor)
      const end = Math.max(state.cursor, state.anchor ?? state.cursor)
      const prefix = state.text.slice(0, start)
      const suffix = state.text.slice(end)
      if (
        input.value.length < prefix.length + suffix.length ||
        !input.value.startsWith(prefix) ||
        !input.value.endsWith(suffix)
      )
        return state
    }
    return CodeEditorLogic.setSelection(
      CodeEditorLogic.insert(CodeEditorLogic.selectAll(state), input.value),
      input.selectionStart,
      input.selectionEnd,
      input.backward,
    )
  }

  private static nativeDeletion(
    state: EditorState,
    input: NativeEditorInput,
  ): EditorState | null {
    if (input.inputType !== '' && !input.inputType.startsWith('delete'))
      return null
    const removed = state.text.length - input.value.length
    const start = input.selectionStart
    const end = start + removed
    const selectionStart = Math.min(state.cursor, state.anchor ?? state.cursor)
    const selectionEnd = Math.max(state.cursor, state.anchor ?? state.cursor)
    const selected =
      selectionStart !== selectionEnd &&
      start === selectionStart &&
      end === selectionEnd
    const backward =
      end === state.cursor &&
      (input.inputType.endsWith('Backward') || removed === 1)
    const forward =
      start === state.cursor &&
      (input.inputType.endsWith('Forward') || removed === 1)
    if (
      removed <= 0 ||
      !(selected || backward || forward) ||
      state.text.slice(0, start) + state.text.slice(end) !== input.value
    )
      return null
    return CodeEditorLogic.insert(
      CodeEditorLogic.setSelection(state, start, end),
      '',
    )
  }
}
