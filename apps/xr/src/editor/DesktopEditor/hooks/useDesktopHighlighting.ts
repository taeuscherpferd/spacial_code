import { useCallback, useLayoutEffect, useRef } from 'react'
import { CodeEditorLogic } from '@/editor/CodeEditor.logic'

export const useDesktopHighlighting = (
  text: string,
  path: string | undefined,
  focusLine: number,
) => {
  const input = useRef<HTMLTextAreaElement>(null)
  const highlight = useRef<HTMLPreElement>(null)
  const syncScroll = useCallback(() => {
    if (!input.current || !highlight.current) return
    highlight.current.scrollTop = input.current.scrollTop
    highlight.current.scrollLeft = input.current.scrollLeft
  }, [])

  useLayoutEffect(() => {
    const element = input.current
    if (!element) return
    const state = CodeEditorLogic.create(element.value, focusLine)
    element.setSelectionRange(state.cursor, state.cursor)
    element.scrollTop =
      state.scrollLine * Number.parseFloat(getComputedStyle(element).lineHeight)
    element.scrollLeft = 0
    syncScroll()
  }, [path, focusLine, syncScroll])

  useLayoutEffect(() => syncScroll(), [text, syncScroll])

  useLayoutEffect(() => {
    const element = input.current
    if (!element) return
    const observer = new ResizeObserver(syncScroll)
    observer.observe(element)
    return () => observer.disconnect()
  }, [syncScroll])

  return { input, highlight, syncScroll }
}
