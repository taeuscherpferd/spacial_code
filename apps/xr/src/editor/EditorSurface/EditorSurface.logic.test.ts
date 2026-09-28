import { describe, expect, it } from 'vitest'
import { EditorSurfaceLogic as Layout } from '@/editor/EditorSurface/EditorSurface.logic'
const measure = (text: string): number => Array.from(text).length * 24

describe('EditorSurfaceLogic', () => {
  it('preserves spaces and expands tabs to tab stops', () => {
    expect(Layout.expandTabs('\tx\tfoo  bar')).toBe('  x foo  bar')
    expect(Layout.expandTabs('')).toBe('')
  })
  it('maps measured source offsets including tabs and Unicode graphemes', () => {
    const boundaries = Layout.boundaries('\ti = 1', measure)
    expect(boundaries[1]).toEqual({ offset: 1, x: 48 })
    for (const boundary of boundaries)
      expect(Layout.offsetAt(boundaries, boundary.x)).toBe(boundary.offset)
    expect(Layout.offsetAt(boundaries, -500)).toBe(0)
    expect(Layout.offsetAt(boundaries, 5000)).toBe(6)
    expect(Layout.offsetAt(boundaries, 60)).toBe(2)
    expect(Layout.offsetAt(Layout.boundaries('', measure), 500)).toBe(0)
    expect(
      Layout.boundaries('a😀e\u0301', measure).map((b) => b.offset),
    ).toEqual([0, 1, 3, 5])
  })
  it('maps inverted texture coordinates to clamped visible rows', () => {
    expect(Layout.rowAt(1, 21)).toBe(0)
    expect(Layout.rowAt(0, 21)).toBe(20)
    expect(Layout.rowAt(1 - 3.5 / 21, 21)).toBe(3)
    expect(Layout.rowAt(-1, 3)).toBe(2)
    expect(Layout.rowAt(2, 0)).toBe(0)
  })
  it('reveals long-line cursors without moving an already visible viewport', () => {
    expect(Layout.reveal(20, 100)).toBe(0)
    expect(Layout.reveal(120, 200)).toBe(88)
    expect(Layout.reveal(3000, 0)).toBe(1256)
    expect(Layout.reveal(100, 0)).toBe(0)
  })
})
