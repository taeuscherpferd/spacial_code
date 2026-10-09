import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { CodeEditorLogic, type EditorState } from '@/editor/CodeEditor.logic'
import { EditorSurfaceLogic as Layout } from '@/editor/EditorSurface/EditorSurface.logic'
import { EditorHighlightingLogic } from '@/editor/highlighting/EditorHighlighting.logic'
import type { EditorDiagnostic } from '@/editor/diagnostics/EditorDiagnostics.logic'

interface EditorSurfaceProps {
  state: EditorState
  active: boolean
  diagnostics: EditorDiagnostic[]
  onActivate: () => void
  onCursor: (offset: number, extend: boolean) => void
}

export const EditorSurface = ({
  state,
  active,
  diagnostics,
  onActivate,
  onCursor,
}: EditorSurfaceProps) => {
  const [scrollX, setScrollX] = useState(0)
  const dragging = useRef<number | null>(null)
  const [hoveredOffset, setHoveredOffset] = useState<number | null>(null)
  const { canvas, context, texture } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = Layout.width
    canvas.height = Layout.height + 64
    const context = canvas.getContext('2d')!
    context.font = Layout.font
    context.fontKerning = 'none'
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    return { canvas, context, texture }
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  const lines = useMemo(
    () => CodeEditorLogic.visibleLines(state, Layout.lineCount),
    [state],
  )
  const measure = (text: string): number =>
    context.measureText(Layout.expandTabs(text)).width

  useLayoutEffect(() => {
    const line = lines.find((line) => line.cursorColumn !== null)
    if (line) {
      const x = context.measureText(
        Layout.expandTabs(line.text.slice(0, line.cursorColumn!)),
      ).width
      setScrollX((current) => Layout.reveal(x, current))
    }
  }, [state.cursor, state.text, lines, context])

  useLayoutEffect(() => {
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.font = Layout.font
    context.textBaseline = 'middle'
    const widthAt = (text: string, offset: number) =>
      context.measureText(Layout.expandTabs(text.slice(0, offset))).width
    lines.forEach((line, index) => {
      const top = index * Layout.lineHeight
      const y = top + Layout.lineHeight / 2
      if (active && line.cursorColumn !== null) {
        context.fillStyle = '#17233d'
        context.fillRect(0, top, Layout.width, Layout.lineHeight)
      }
      context.fillStyle = diagnostics.some(
        (d) =>
          d.start >= line.startOffset &&
          d.start <= line.startOffset + line.text.length,
      )
        ? '#ff8798'
        : '#7784a8'
      context.textAlign = 'right'
      context.fillText(String(line.number), Layout.gutter - 28, y)
      context.textAlign = 'left'
      context.save()
      context.beginPath()
      context.rect(
        Layout.gutter,
        top,
        Layout.width - Layout.gutter,
        Layout.lineHeight,
      )
      context.clip()
      const xAt = (offset: number) =>
        Layout.gutter + widthAt(line.text, offset) - scrollX
      if (line.selectionStart !== null && line.selectionEnd !== null) {
        context.fillStyle = '#355b99'
        context.fillRect(
          xAt(line.selectionStart),
          top,
          xAt(line.selectionEnd) - xAt(line.selectionStart),
          Layout.lineHeight,
        )
      }
      const expanded = Layout.expandTabs(line.text)
      line.tokens.forEach((token) => {
        context.fillStyle = EditorHighlightingLogic.tokenColors[token.kind]
        const start = Layout.expandTabs(line.text.slice(0, token.start)).length
        const end = Layout.expandTabs(
          line.text.slice(0, token.start + token.text.length),
        ).length
        context.fillText(expanded.slice(start, end), xAt(token.start), y)
      })
      EditorHighlightingLogic.lineDiagnostics(
        line.startOffset,
        line.text.length,
        diagnostics,
      ).forEach(({ start, end }) => {
        const left = xAt(start)
        const right = Math.max(left + 12, xAt(end))
        context.strokeStyle = EditorHighlightingLogic.tokenColors.diagnostic
        context.lineWidth = 3
        context.beginPath()
        for (let x = left; x <= right; x += 6) {
          const y =
            top + Layout.lineHeight - 7 + ((x - left) % 12 === 0 ? 0 : 4)
          if (x === left) context.moveTo(x, y)
          else context.lineTo(x, y)
        }
        context.stroke()
      })
      if (active && line.cursorColumn !== null) {
        context.fillStyle = '#ffffff'
        context.fillRect(
          xAt(line.cursorColumn),
          top + 5,
          3,
          Layout.lineHeight - 10,
        )
      }
      context.restore()
    })
    const target = hoveredOffset ?? state.cursor
    const diagnostic = diagnostics.find(
      (d) => target >= d.start && target <= d.start + d.length,
    )
    context.font = '28px sans-serif'
    context.fillStyle = '#ff9aab'
    if (diagnostic)
      context.fillText(
        diagnostic.message,
        12,
        Layout.height + 32,
        Layout.width - 24,
      )
    context.font = Layout.font
    texture.needsUpdate = true
  }, [
    active,
    canvas,
    context,
    diagnostics,
    hoveredOffset,
    lines,
    scrollX,
    state.cursor,
    texture,
  ])

  const offsetAt = (event: ThreeEvent<PointerEvent>): number => {
    const v = ((event.uv?.y ?? 1) * canvas.height - 64) / Layout.height
    const line = lines[Layout.rowAt(v, lines.length)]
    const x = (event.uv?.x ?? 0) * Layout.width - Layout.gutter + scrollX
    return (
      line.startOffset +
      Layout.offsetAt(Layout.boundaries(line.text, measure), x)
    )
  }

  return (
    <mesh
      position={[0, -0.085, 0.081]}
      onPointerDown={(event) => {
        event.stopPropagation()
        event.nativeEvent.preventDefault()
        dragging.current = event.pointerId
        ;(event.target as Element).setPointerCapture(event.pointerId)
        onCursor(offsetAt(event), event.shiftKey)
      }}
      onPointerMove={(event) => {
        event.stopPropagation()
        const offset = offsetAt(event)
        setHoveredOffset(offset)
        if (dragging.current === event.pointerId) onCursor(offset, true)
      }}
      onPointerUp={(event) => {
        event.stopPropagation()
        event.nativeEvent.preventDefault()
        onActivate()
        dragging.current = null
        ;(event.target as Element).releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={() => {
        dragging.current = null
      }}
      onPointerOut={() => setHoveredOffset(null)}
      onWheel={(event) => {
        if (!event.shiftKey && Math.abs(event.deltaX) <= Math.abs(event.deltaY))
          return
        event.stopPropagation()
        const maxWidth = Math.max(0, ...state.text.split('\n').map(measure))
        const delta = event.shiftKey ? event.deltaY : event.deltaX
        setScrollX((current) =>
          Math.max(0, Math.min(maxWidth, current + delta)),
        )
      }}
    >
      <planeGeometry args={[4.8, canvas.height / 400]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  )
}
