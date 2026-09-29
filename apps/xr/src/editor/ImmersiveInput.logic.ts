import { CodeEditorLogic, type EditorState } from '@/editor/CodeEditor.logic'

export class ImmersiveInputLogic {
  static readonly buffer = '\u200b\u200b'

  static text(value: string): string {
    return value.replaceAll('\u200b', '')
  }

  static compose(original: EditorState, value: string): EditorState {
    const text = this.text(value)
    return text ? CodeEditorLogic.insert(original, text) : original
  }

  static boundaryDelete(state: EditorState, inputType: string): EditorState {
    if (inputType === 'deleteContentBackward')
      return CodeEditorLogic.deleteBackward(state)
    if (inputType === 'deleteContentForward')
      return CodeEditorLogic.deleteForward(state)
    return state
  }
}
