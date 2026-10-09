import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDesktopHighlighting } from '@/editor/DesktopEditor/hooks/useDesktopHighlighting'

const lifecycle = vi.hoisted(() => ({
  setups: [] as Array<() => void | (() => void)>,
  cleanup: [] as Array<() => void>,
}))
vi.mock('react', () => ({
  useRef: <T>(current: T) => ({ current }),
  useCallback: <T>(callback: T) => callback,
  useLayoutEffect: (setup: () => void | (() => void)) =>
    lifecycle.setups.push(setup),
}))

const flushEffects = () => {
  lifecycle.setups.splice(0).forEach((setup) => {
    const cleanup = setup()
    if (cleanup) lifecycle.cleanup.push(cleanup)
  })
}

class EditorResizeObserver {
  static latest: EditorResizeObserver
  observe = vi.fn()
  disconnect = vi.fn()

  constructor(public callback: () => void) {
    EditorResizeObserver.latest = this
  }
}

const mount = () => {
  vi.stubGlobal('getComputedStyle', () => ({ lineHeight: '24px' }))
  vi.stubGlobal('ResizeObserver', EditorResizeObserver)
  const text = Array.from({ length: 12 }, (_, index) => `line ${index}`).join(
    '\n',
  )
  const view = useDesktopHighlighting(text, 'file.ts', 8)
  const element = {
    value: text,
    scrollTop: 0,
    scrollLeft: 50,
    setSelectionRange: vi.fn<HTMLTextAreaElement['setSelectionRange']>(),
  }
  const overlay = { scrollTop: 0, scrollLeft: 0 }
  view.input.current = element as Pick<
    HTMLTextAreaElement,
    'value' | 'scrollTop' | 'scrollLeft' | 'setSelectionRange'
  > as HTMLTextAreaElement
  view.highlight.current = overlay as HTMLPreElement
  flushEffects()
  return { view, element, overlay }
}

afterEach(() => {
  lifecycle.cleanup.splice(0).forEach((cleanup) => cleanup())
  lifecycle.setups.splice(0)
  vi.unstubAllGlobals()
})

describe('useDesktopHighlighting', () => {
  it('reveals the requested line using actual line height and aligns both layers', () => {
    const { element, overlay } = mount()
    expect(element.setSelectionRange).toHaveBeenCalledWith(49, 49)
    expect(element.scrollTop).toBe(96)
    expect(element.scrollLeft).toBe(0)
    expect(overlay).toEqual({ scrollTop: 96, scrollLeft: 0 })
  })

  it('mirrors horizontal and vertical scrolling without changing native selection', () => {
    const { view, element, overlay } = mount()
    element.scrollTop = 151
    element.scrollLeft = 237
    view.syncScroll()
    expect(overlay).toEqual({ scrollTop: 151, scrollLeft: 237 })
    expect(element.setSelectionRange).toHaveBeenCalledTimes(1)
  })

  it('resynchronizes after resizing and disconnects its observer on unmount', () => {
    const { element, overlay } = mount()
    const observer = EditorResizeObserver.latest
    expect(observer.observe).toHaveBeenCalledWith(element)
    element.scrollTop = 25
    element.scrollLeft = 7
    observer.callback()
    expect(overlay).toEqual({ scrollTop: 25, scrollLeft: 7 })
    lifecycle.cleanup.splice(0).forEach((cleanup) => cleanup())
    expect(observer.disconnect).toHaveBeenCalledOnce()
  })

  it('handles unavailable or unmounted input layers', () => {
    const view = useDesktopHighlighting('', undefined, 1)
    flushEffects()
    expect(() => view.syncScroll()).not.toThrow()
    const { view: mounted } = mount()
    mounted.highlight.current = null
    expect(() => mounted.syncScroll()).not.toThrow()
  })
})
