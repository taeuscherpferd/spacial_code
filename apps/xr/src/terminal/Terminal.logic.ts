export interface TerminalSpan {
  text: string
  color: string
}

export interface TerminalLine {
  spans: TerminalSpan[]
}

export interface TerminalBuffer {
  lines: TerminalLine[]
  color: string
  pendingEscape: string
  pendingCarriageReturn: boolean
}

const defaultColor = '#d9def2'
const ansiColors: Record<number, string> = {
  30: '#202638',
  31: '#ff6b7a',
  32: '#9cdb75',
  33: '#f3c969',
  34: '#72a7ff',
  35: '#d99bff',
  36: '#63d7cf',
  37: '#d9def2',
  90: '#67708e',
  91: '#ff8793',
  92: '#b2e58f',
  93: '#ffda84',
  94: '#91b9ff',
  95: '#e2b5ff',
  96: '#86e3dc',
  97: '#ffffff',
}

export class TerminalLogic {
  static create(): TerminalBuffer {
    return {
      lines: [{ spans: [] }],
      color: defaultColor,
      pendingEscape: '',
      pendingCarriageReturn: false,
    }
  }

  static consume(buffer: TerminalBuffer, chunk: string): TerminalBuffer {
    const state: TerminalBuffer = {
      lines: buffer.lines.map((line) => ({ spans: line.spans.map((span) => ({ ...span })) })),
      color: buffer.color,
      pendingEscape: '',
      pendingCarriageReturn: buffer.pendingCarriageReturn,
    }
    const input = buffer.pendingEscape + chunk
    let index = 0
    while (index < input.length) {
      const character = input[index]
      if (state.pendingCarriageReturn) {
        state.pendingCarriageReturn = false
        if (character === '\n') {
          state.lines.push({ spans: [] })
          index += 1
          continue
        }
        state.lines[state.lines.length - 1] = { spans: [] }
      }
      if (character === '\u001b') {
        const sequenceEnd = TerminalLogic.sequenceEnd(input, index)
        if (sequenceEnd === -1) {
          state.pendingEscape = input.slice(index)
          break
        }
        TerminalLogic.applySequence(state, input.slice(index, sequenceEnd + 1))
        index = sequenceEnd + 1
        continue
      }
      if (character === '\n') {
        state.lines.push({ spans: [] })
      } else if (character === '\r') {
        state.pendingCarriageReturn = true
      } else if (character === '\b') {
        TerminalLogic.backspace(state)
      } else if (character === '\t') {
        TerminalLogic.append(state, '    ')
      } else if (character >= ' ') {
        TerminalLogic.append(state, character)
      }
      index += 1
    }
    if (state.lines.length > 500) {
      state.lines.splice(0, state.lines.length - 500)
    }
    return state
  }

  static visibleLines(buffer: TerminalBuffer, count: number, scrollback: number): TerminalLine[] {
    const end = Math.max(0, buffer.lines.length - scrollback)
    const start = Math.max(0, end - count)
    return buffer.lines.slice(start, end)
  }

  private static sequenceEnd(input: string, start: number): number {
    if (input[start + 1] === ']') {
      for (let index = start + 2; index < input.length; index += 1) {
        if (input[index] === '\u0007') {
          return index
        }
        if (input[index] === '\u001b' && input[index + 1] === '\\') {
          return index + 1
        }
      }
      return -1
    }
    if (input[start + 1] !== '[') {
      return Math.min(start + 1, input.length - 1)
    }
    for (let index = start + 2; index < input.length; index += 1) {
      const code = input.charCodeAt(index)
      if (code >= 0x40 && code <= 0x7e) {
        return index
      }
    }
    return -1
  }

  private static applySequence(state: TerminalBuffer, sequence: string): void {
    if (!sequence.startsWith('\u001b[')) {
      return
    }
    const command = sequence.at(-1)
    const values = sequence
      .slice(2, -1)
      .split(';')
      .filter(Boolean)
      .map(Number)
    if (command === 'm') {
      for (const value of values.length ? values : [0]) {
        if (value === 0 || value === 39) {
          state.color = defaultColor
        } else if (ansiColors[value]) {
          state.color = ansiColors[value]
        }
      }
    } else if (command === 'J' && values.includes(2)) {
      state.lines = [{ spans: [] }]
    } else if (command === 'K') {
      state.lines[state.lines.length - 1] = { spans: [] }
    }
  }

  private static append(state: TerminalBuffer, value: string): void {
    const line = state.lines[state.lines.length - 1] ?? { spans: [] }
    if (state.lines.length === 0) {
      state.lines.push(line)
    }
    const span = line.spans.at(-1)
    if (span?.color === state.color) {
      span.text += value
    } else {
      line.spans.push({ text: value, color: state.color })
    }
  }

  private static backspace(state: TerminalBuffer): void {
    const line = state.lines[state.lines.length - 1]
    const span = line?.spans.at(-1)
    if (!span) {
      return
    }
    span.text = span.text.slice(0, -1)
    if (!span.text) {
      line.spans.pop()
    }
  }
}
