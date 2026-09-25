import { describe, expect, it } from 'vitest'
import { TerminalLogic } from '@/terminal/Terminal.logic'

describe('TerminalLogic', () => {
  it('keeps scrollback and handles carriage-return progress', () => {
    let buffer = TerminalLogic.consume(
      TerminalLogic.create(),
      'Loading 1%\rLoading 2%\nDone',
    )
    expect(buffer.lines[0]?.spans[0]?.text).toBe('Loading 2%')
    expect(buffer.lines[1]?.spans[0]?.text).toBe('Done')
    buffer = TerminalLogic.consume(buffer, '\b!')
    expect(buffer.lines[1]?.spans[0]?.text).toBe('Don!')
  })

  it('parses basic ANSI colors across chunks', () => {
    let buffer = TerminalLogic.consume(TerminalLogic.create(), '\u001b[3')
    buffer = TerminalLogic.consume(buffer, '1merror\u001b[0m')
    expect(buffer.lines[0]?.spans[0]?.color).toBe('#ff6b7a')
    expect(buffer.pendingEscape).toBe('')
  })

  it('preserves lines written with Windows CRLF endings', () => {
    let buffer = TerminalLogic.consume(TerminalLogic.create(), 'one\r')
    buffer = TerminalLogic.consume(buffer, '\ntwo')
    expect(buffer.lines.map((line) => line.spans[0]?.text)).toEqual([
      'one',
      'two',
    ])
  })

  it('filters terminal title sequences across chunks', () => {
    let buffer = TerminalLogic.consume(
      TerminalLogic.create(),
      '\u001b]0;Spatial',
    )
    buffer = TerminalLogic.consume(buffer, ' Code\u0007ready')
    expect(buffer.lines[0]?.spans[0]?.text).toBe('ready')
    expect(buffer.pendingEscape).toBe('')
  })

  it('returns a virtualized scrollback window', () => {
    const buffer = TerminalLogic.consume(
      TerminalLogic.create(),
      'one\ntwo\nthree',
    )
    const visible = TerminalLogic.visibleLines(buffer, 2, 0)
    expect(visible.map((line) => line.spans[0]?.text)).toEqual(['two', 'three'])
  })
})
