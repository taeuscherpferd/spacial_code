import { RoundedBox, Text } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SourceDocument } from '@/connection/protocol'
import {
  CodeEditorLogic,
  type CursorMovement,
  type EditorState,
  type VisibleEditorLine,
} from '@/editor/CodeEditor.logic'

interface CodeEditorProps {
  document: SourceDocument | null
  focusLine: number
  active: boolean
  onActivate: () => void
  onChange: (content: string) => void
  onSave: (content: string) => void
}

const visibleLineCount = 21
const characterWidth = 0.061
const lineHeight = 0.135
const panelWidth = 5.2
const tokenColors = {
  plain: '#d9def2',
  keyword: '#c792ea',
  string: '#c3e88d',
  number: '#f78c6c',
  comment: '#68739b',
} as const

export const CodeEditor = ({
  document,
  focusLine,
  active,
  onActivate,
  onChange,
  onSave,
}: CodeEditorProps) => {
  const [state, setState] = useState<EditorState>(() => CodeEditorLogic.create(''))

  useEffect(() => {
    setState(CodeEditorLogic.create(document?.content ?? '', focusLine))
  }, [document?.path, document?.savedVersion, focusLine])

  const apply = useCallback(
    (nextState: EditorState): void => {
      const revealed = CodeEditorLogic.revealCursor(nextState, visibleLineCount)
      setState(revealed)
      if (revealed.text !== state.text) {
        onChange(revealed.text)
      }
    },
    [onChange, state.text],
  )

  useEffect(() => {
    if (!active || !document) {
      return
    }
    const handleKey = (event: KeyboardEvent): void => {
      const modifier = event.ctrlKey || event.metaKey
      if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault()
        onSave(state.text)
        return
      }
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        apply(event.shiftKey ? CodeEditorLogic.redo(state) : CodeEditorLogic.undo(state))
        return
      }
      if (modifier && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        apply(CodeEditorLogic.redo(state))
        return
      }
      if (modifier && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        apply(CodeEditorLogic.selectAll(state))
        return
      }
      if (modifier && ['c', 'x'].includes(event.key.toLowerCase())) {
        const selected = CodeEditorLogic.selectedText(state)
        if (selected) {
          event.preventDefault()
          void writeClipboard(selected)
          if (event.key.toLowerCase() === 'x') {
            apply(CodeEditorLogic.insert(state, ''))
          }
        }
        return
      }
      const movement = movementForKey(event.key)
      if (movement) {
        event.preventDefault()
        apply(CodeEditorLogic.move(state, movement, event.shiftKey))
        return
      }
      const edit = editForKey(event.key, state)
      if (edit) {
        event.preventDefault()
        apply(edit)
      }
    }
    const handlePaste = (event: ClipboardEvent): void => {
      const value = event.clipboardData?.getData('text/plain')
      if (value) {
        event.preventDefault()
        apply(CodeEditorLogic.insert(state, value))
      }
    }
    window.addEventListener('keydown', handleKey)
    window.addEventListener('paste', handlePaste)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('paste', handlePaste)
    }
  }, [active, apply, document, onSave, state])

  const lines = useMemo(
    () => CodeEditorLogic.visibleLines(state, visibleLineCount),
    [state],
  )
  const dirty = document ? state.text !== document.savedContent : false

  return (
    <group
      position={[2.4, 0.65, 0]}
      onPointerDown={(event) => {
        event.stopPropagation()
        onActivate()
      }}
      onWheel={(event) => {
        event.stopPropagation()
        setState((current) =>
          CodeEditorLogic.scroll(current, event.deltaY > 0 ? 3 : -3, visibleLineCount),
        )
      }}
    >
      <RoundedBox args={[panelWidth, 3.55, 0.12]} radius={0.12} smoothness={4}>
        <meshStandardMaterial
          color={active ? '#11182d' : '#0c1120'}
          emissive={active ? '#17234b' : '#05070d'}
          emissiveIntensity={0.28}
          roughness={0.8}
        />
      </RoundedBox>
      <Text
        position={[-2.35, 1.57, 0.075]}
        fontSize={0.14}
        color="#f4f6ff"
        anchorX="left"
      >
        {document ? `${document.path}${dirty ? ' •' : ''}` : 'Select a source node'}
      </Text>
      {lines.map((line, index) => (
        <EditorLine
          key={line.number}
          line={line}
          index={index}
          active={active}
          onCursor={(column, extend) =>
            apply(CodeEditorLogic.setCursor(state, line.startOffset + column, extend))
          }
        />
      ))}
      <Text
        position={[2.25, -1.62, 0.075]}
        fontSize={0.08}
        color="#7984ad"
        anchorX="right"
      >
        {active ? 'typing · Ctrl/Cmd+S saves · wheel scrolls' : 'select panel to edit'}
      </Text>
    </group>
  )
}

interface EditorLineProps {
  line: VisibleEditorLine
  index: number
  active: boolean
  onCursor: (column: number, extend: boolean) => void
}

const EditorLine = ({ line, index, active, onCursor }: EditorLineProps) => {
  const y = 1.35 - index * lineHeight
  const codeX = -2.02
  return (
    <group position={[0, y, 0.08]}>
      <mesh
        position={[0, 0, -0.004]}
        onPointerDown={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation()
          const column = Math.min(
            line.text.length,
            Math.max(0, Math.round((event.uv?.x ?? 0) * 76)),
          )
          onCursor(column, event.shiftKey)
        }}
      >
        <planeGeometry args={[4.85, lineHeight]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      <Text position={[-2.34, 0, 0]} fontSize={0.085} color="#566086" anchorX="left">
        {String(line.number).padStart(3, ' ')}
      </Text>
      {line.selectionStart !== null && line.selectionEnd !== null && (
        <mesh
          position={[
            codeX + ((line.selectionStart + line.selectionEnd) * characterWidth) / 2,
            0,
            -0.002,
          ]}
        >
          <planeGeometry
            args={[(line.selectionEnd - line.selectionStart) * characterWidth, 0.118]}
          />
          <meshBasicMaterial color="#3c5fa8" transparent opacity={0.62} />
        </mesh>
      )}
      {line.tokens.map((token) => (
        <Text
          key={`${token.start}:${token.text}`}
          position={[codeX + token.start * characterWidth, 0, 0.002]}
          fontSize={0.1}
          color={tokenColors[token.kind]}
          anchorX="left"
          anchorY="middle"
          maxWidth={4.45}
        >
          {token.text}
        </Text>
      ))}
      {active && line.cursorColumn !== null && (
        <mesh position={[codeX + line.cursorColumn * characterWidth, 0, 0.008]}>
          <planeGeometry args={[0.013, 0.116]} />
          <meshBasicMaterial color="#f5f7ff" />
        </mesh>
      )}
    </group>
  )
}

const movementForKey = (key: string): CursorMovement | null => {
  const movements: Record<string, CursorMovement> = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
    Home: 'home',
    End: 'end',
  }
  return movements[key] ?? null
}

const editForKey = (key: string, state: EditorState): EditorState | null => {
  if (key === 'Backspace') {
    return CodeEditorLogic.deleteBackward(state)
  }
  if (key === 'Delete') {
    return CodeEditorLogic.deleteForward(state)
  }
  if (key === 'Enter') {
    return CodeEditorLogic.insert(state, '\n')
  }
  if (key === 'Tab') {
    return CodeEditorLogic.insert(state, '  ')
  }
  if (key.length === 1) {
    return CodeEditorLogic.insert(state, key)
  }
  return null
}

const writeClipboard = async (value: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    // Clipboard access is optional in immersive browsers.
  }
}
