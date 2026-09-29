import { describe, expect, it } from 'vitest'
import { CodeEditorLogic } from '@/editor/CodeEditor.logic'
import { ImmersiveInputLogic } from '@/editor/ImmersiveInput.logic'

const state = CodeEditorLogic.setCursor(
  CodeEditorLogic.create('before after'),
  7,
)

describe('persistent immersive input', () => {
  it('maps the complete buffer onto the original spatial selection', () => {
    for (const value of ['h', 'hello', 'hell', '']) {
      const next = ImmersiveInputLogic.compose(state, `\u200b${value}\u200b`)
      expect(next.text).toBe(`before ${value}after`)
      expect(next.history.length).toBe(value ? 1 : 0)
    }
    const selected = CodeEditorLogic.setSelection(state, 0, 6, true)
    expect(ImmersiveInputLogic.compose(selected, 'x').text).toBe('x after')
    expect(ImmersiveInputLogic.compose(state, ImmersiveInputLogic.buffer)).toBe(
      state,
    )
  })
  it('deletes at either boundary without relying on event data', () => {
    expect(
      ImmersiveInputLogic.boundaryDelete(state, 'deleteContentBackward').text,
    ).toBe('beforeafter')
    expect(
      ImmersiveInputLogic.boundaryDelete(state, 'deleteContentForward').text,
    ).toBe('before fter')
    expect(ImmersiveInputLogic.boundaryDelete(state, 'insertText')).toBe(state)
  })
})
