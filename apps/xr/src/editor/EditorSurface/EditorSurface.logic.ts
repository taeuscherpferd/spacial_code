export interface TextBoundary {
  offset: number
  x: number
}

export class EditorSurfaceLogic {
  static readonly width = 1920
  static readonly lineHeight = 54
  static readonly lineCount = 21
  static readonly height = this.lineHeight * this.lineCount
  static readonly gutter = 144
  static readonly font =
    '40px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

  static expandTabs(text: string): string {
    let column = 0
    return Array.from(text, (character) => {
      const width = character === '\t' ? 2 - (column % 2) : 1
      column += width
      return character === '\t' ? ' '.repeat(width) : character
    }).join('')
  }

  static boundaries(
    text: string,
    measure: (text: string) => number,
  ): TextBoundary[] {
    const boundaries = [{ offset: 0, x: 0 }]
    const segments = new Intl.Segmenter(undefined, {
      granularity: 'grapheme',
    }).segment(text)
    for (const { index, segment } of segments) {
      const offset = index + segment.length
      boundaries.push({
        offset,
        x: measure(this.expandTabs(text.slice(0, offset))),
      })
    }
    return boundaries
  }

  static offsetAt(boundaries: TextBoundary[], x: number): number {
    let closest = boundaries[0]
    for (const boundary of boundaries) {
      if (Math.abs(boundary.x - x) <= Math.abs(closest.x - x))
        closest = boundary
    }
    return closest.offset
  }

  static rowAt(v: number, lineCount: number): number {
    return Math.max(
      0,
      Math.min(lineCount - 1, Math.floor((1 - v) * this.lineCount)),
    )
  }

  static reveal(cursorX: number, scrollX: number): number {
    const width = this.width - this.gutter - 32
    if (cursorX < scrollX) return Math.max(0, cursorX - 32)
    if (cursorX > scrollX + width) return cursorX - width
    return scrollX
  }
}
