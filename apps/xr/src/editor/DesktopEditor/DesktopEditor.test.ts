import { describe, expect, it } from 'vitest'
import { DesktopEditorLogic } from '@/editor/DesktopEditor/DesktopEditor.logic'

describe('DesktopEditorLogic', () => {
  it('matches textarea newline normalization without changing other source text', () => {
    expect(DesktopEditorLogic.normalizeText('a\r\nb\rc\n\t<tag>')).toBe(
      'a\nb\nc\n\t<tag>',
    )
    expect(DesktopEditorLogic.normalizeText('')).toBe('')
  })
})
