import { describe, expect, it } from 'vitest'
import { VrTextLogic } from '@/ui/VrText.logic'

describe('VrTextLogic', () => {
  it('swaps the label symbols for characters the panel font has', () => {
    expect(VrTextLogic.ascii('    ▾ src')).toBe('    v src')
    expect(VrTextLogic.ascii('◇ main.ts · around App…')).toBe(
      '- main.ts | around App...',
    )
    expect(VrTextLogic.ascii('↰ ..')).toBe('< ..')
  })

  it('leaves plain text alone', () => {
    expect(VrTextLogic.ascii('C:/projects/app')).toBe('C:/projects/app')
  })
})
