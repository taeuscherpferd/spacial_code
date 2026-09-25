export type SyntaxTokenKind =
  'plain' | 'keyword' | 'string' | 'number' | 'comment'

export interface SyntaxToken {
  text: string
  start: number
  kind: SyntaxTokenKind
}

export interface EditorSnapshot {
  text: string
  cursor: number
  anchor: number | null
}

export interface EditorState extends EditorSnapshot {
  scrollLine: number
  history: EditorSnapshot[]
  future: EditorSnapshot[]
}

export interface VisibleEditorLine {
  number: number
  startOffset: number
  text: string
  tokens: SyntaxToken[]
  cursorColumn: number | null
  selectionStart: number | null
  selectionEnd: number | null
}

export type CursorMovement = 'left' | 'right' | 'up' | 'down' | 'home' | 'end'

const historyLimit = 100

export class CodeEditorLogic {
  static create(text: string, focusLine = 1): EditorState {
    const starts = this.lineStarts(text)
    const lineIndex = Math.min(Math.max(focusLine - 1, 0), starts.length - 1)
    return {
      text,
      cursor: starts[lineIndex] ?? 0,
      anchor: null,
      scrollLine: Math.max(0, lineIndex - 3),
      history: [],
      future: [],
    }
  }

  static insert(state: EditorState, value: string): EditorState {
    return this.replaceSelection(state, value)
  }

  static deleteBackward(state: EditorState): EditorState {
    const selection = this.selection(state)
    if (selection.start !== selection.end) {
      return this.replaceSelection(state, '')
    }
    if (state.cursor === 0) {
      return state
    }
    return this.replaceRange(state, state.cursor - 1, state.cursor, '')
  }

  static deleteForward(state: EditorState): EditorState {
    const selection = this.selection(state)
    if (selection.start !== selection.end) {
      return this.replaceSelection(state, '')
    }
    if (state.cursor >= state.text.length) {
      return state
    }
    return this.replaceRange(state, state.cursor, state.cursor + 1, '')
  }

  static move(
    state: EditorState,
    movement: CursorMovement,
    extend: boolean,
  ): EditorState {
    const starts = this.lineStarts(state.text)
    const currentLine = this.lineAt(starts, state.cursor)
    const currentColumn = state.cursor - (starts[currentLine] ?? 0)
    let cursor = state.cursor
    switch (movement) {
      case 'left':
        cursor = Math.max(0, state.cursor - 1)
        break
      case 'right':
        cursor = Math.min(state.text.length, state.cursor + 1)
        break
      case 'up':
        cursor = this.offsetAt(
          state.text,
          starts,
          currentLine - 1,
          currentColumn,
        )
        break
      case 'down':
        cursor = this.offsetAt(
          state.text,
          starts,
          currentLine + 1,
          currentColumn,
        )
        break
      case 'home':
        cursor = starts[currentLine] ?? 0
        break
      case 'end':
        cursor = this.lineEnd(state.text, starts, currentLine)
        break
    }
    return {
      ...state,
      cursor,
      anchor: extend ? (state.anchor ?? state.cursor) : null,
    }
  }

  static setCursor(
    state: EditorState,
    offset: number,
    extend = false,
  ): EditorState {
    return {
      ...state,
      cursor: Math.min(Math.max(offset, 0), state.text.length),
      anchor: extend ? (state.anchor ?? state.cursor) : null,
    }
  }

  static selectAll(state: EditorState): EditorState {
    return { ...state, anchor: 0, cursor: state.text.length }
  }

  static selectedText(state: EditorState): string {
    const selection = this.selection(state)
    return state.text.slice(selection.start, selection.end)
  }

  static undo(state: EditorState): EditorState {
    const previous = state.history.at(-1)
    if (!previous) {
      return state
    }
    return {
      ...previous,
      scrollLine: state.scrollLine,
      history: state.history.slice(0, -1),
      future: [this.snapshot(state), ...state.future].slice(0, historyLimit),
    }
  }

  static redo(state: EditorState): EditorState {
    const next = state.future[0]
    if (!next) {
      return state
    }
    return {
      ...next,
      scrollLine: state.scrollLine,
      history: [...state.history, this.snapshot(state)].slice(-historyLimit),
      future: state.future.slice(1),
    }
  }

  static scroll(
    state: EditorState,
    lines: number,
    visibleLineCount: number,
  ): EditorState {
    const lineCount = this.lineStarts(state.text).length
    const maxScroll = Math.max(0, lineCount - visibleLineCount)
    return {
      ...state,
      scrollLine: Math.min(Math.max(state.scrollLine + lines, 0), maxScroll),
    }
  }

  static revealCursor(
    state: EditorState,
    visibleLineCount: number,
  ): EditorState {
    const starts = this.lineStarts(state.text)
    const cursorLine = this.lineAt(starts, state.cursor)
    if (cursorLine < state.scrollLine) {
      return { ...state, scrollLine: cursorLine }
    }
    if (cursorLine >= state.scrollLine + visibleLineCount) {
      return { ...state, scrollLine: cursorLine - visibleLineCount + 1 }
    }
    return state
  }

  static visibleLines(state: EditorState, count: number): VisibleEditorLine[] {
    const starts = this.lineStarts(state.text)
    const selection = this.selection(state)
    return starts
      .slice(state.scrollLine, state.scrollLine + count)
      .map((start, index) => {
        const lineIndex = state.scrollLine + index
        const end = this.lineEnd(state.text, starts, lineIndex)
        const text = state.text.slice(start, end)
        const selectedStart = Math.max(selection.start, start)
        const selectedEnd = Math.min(selection.end, end)
        return {
          number: lineIndex + 1,
          startOffset: start,
          text,
          tokens: this.tokenize(text),
          cursorColumn:
            state.cursor >= start && state.cursor <= end
              ? state.cursor - start
              : null,
          selectionStart:
            selectedEnd > selectedStart ? selectedStart - start : null,
          selectionEnd:
            selectedEnd > selectedStart ? selectedEnd - start : null,
        }
      })
  }

  static tokenize(line: string): SyntaxToken[] {
    const pattern =
      /\/\/.*$|(?:'(?:\\.|[^'])*'|"(?:\\.|[^"])*"|`(?:\\.|[^`])*`)|\b(?:class|const|else|export|extends|false|function|if|import|interface|let|new|null|return|true|type|undefined)\b|\b\d+(?:\.\d+)?\b/g
    const tokens: SyntaxToken[] = []
    let cursor = 0
    for (const match of line.matchAll(pattern)) {
      const start = match.index
      if (start > cursor) {
        tokens.push({
          text: line.slice(cursor, start),
          start: cursor,
          kind: 'plain',
        })
      }
      const text = match[0]
      tokens.push({ text, start, kind: this.tokenKind(text) })
      cursor = start + text.length
    }
    if (cursor < line.length || tokens.length === 0) {
      tokens.push({ text: line.slice(cursor), start: cursor, kind: 'plain' })
    }
    return tokens
  }

  private static replaceSelection(
    state: EditorState,
    value: string,
  ): EditorState {
    const selection = this.selection(state)
    return this.replaceRange(state, selection.start, selection.end, value)
  }

  private static replaceRange(
    state: EditorState,
    start: number,
    end: number,
    value: string,
  ): EditorState {
    const text = state.text.slice(0, start) + value + state.text.slice(end)
    return {
      text,
      cursor: start + value.length,
      anchor: null,
      scrollLine: state.scrollLine,
      history: [...state.history, this.snapshot(state)].slice(-historyLimit),
      future: [],
    }
  }

  private static selection(state: EditorSnapshot): {
    start: number
    end: number
  } {
    const anchor = state.anchor ?? state.cursor
    return {
      start: Math.min(anchor, state.cursor),
      end: Math.max(anchor, state.cursor),
    }
  }

  private static snapshot(state: EditorSnapshot): EditorSnapshot {
    return { text: state.text, cursor: state.cursor, anchor: state.anchor }
  }

  private static lineStarts(text: string): number[] {
    const starts = [0]
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === '\n') {
        starts.push(index + 1)
      }
    }
    return starts
  }

  private static lineAt(starts: number[], offset: number): number {
    let line = 0
    for (let index = 1; index < starts.length; index += 1) {
      if ((starts[index] ?? 0) > offset) {
        break
      }
      line = index
    }
    return line
  }

  private static offsetAt(
    text: string,
    starts: number[],
    requestedLine: number,
    column: number,
  ): number {
    const line = Math.min(Math.max(requestedLine, 0), starts.length - 1)
    const start = starts[line] ?? 0
    return Math.min(start + column, this.lineEnd(text, starts, line))
  }

  private static lineEnd(text: string, starts: number[], line: number): number {
    const nextStart = starts[line + 1]
    return nextStart === undefined ? text.length : nextStart - 1
  }

  private static tokenKind(text: string): SyntaxTokenKind {
    if (text.startsWith('//')) {
      return 'comment'
    }
    if (/^['"`]/.test(text)) {
      return 'string'
    }
    if (/^\d/.test(text)) {
      return 'number'
    }
    return 'keyword'
  }
}
