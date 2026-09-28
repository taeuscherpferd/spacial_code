import styles from './CodeEditor.module.scss'
import { RoundedBox, Text } from '@react-three/drei'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SourceDocument } from '@/connection/protocol'
import { CodeEditorLogic, type EditorState } from '@/editor/CodeEditor.logic'

import { EditorSurface } from '@/editor/EditorSurface/EditorSurface'
import { useEditorInput } from '@/editor/hooks/useEditorInput'
import { useEditorDiagnostics } from '@/editor/hooks/useEditorDiagnostics'

interface CodeEditorProps {
  document: SourceDocument | null
  focusLine: number
  active: boolean
  onInteractionChange: (interacting: boolean) => void
  onActivate: () => void
  onChange: (content: string) => void
  onSave: (content: string) => void
}

const visibleLineCount = 21
export const CodeEditor = ({
  document,
  focusLine,
  active,
  onActivate,
  onInteractionChange,
  onChange,
  onSave,
}: CodeEditorProps) => {
  const [state, setState] = useState<EditorState>(() =>
    CodeEditorLogic.create(''),
  )

  const previousPath = useRef<string | undefined>(undefined)
  useEffect(() => {
    const changedFile = previousPath.current !== document?.path
    previousPath.current = document?.path
    setState((current) =>
      changedFile || current.text !== (document?.content ?? '')
        ? CodeEditorLogic.create(document?.content ?? '', focusLine)
        : current,
    )
  }, [document?.path, document?.content])

  useEffect(() => {
    setState((current) =>
      CodeEditorLogic.revealCursor(
        CodeEditorLogic.setCursor(
          current,
          CodeEditorLogic.create(current.text, focusLine).cursor,
        ),
        visibleLineCount,
      ),
    )
  }, [focusLine, document?.path])

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

  const focusInput = useEditorInput({
    inputClassName: styles.input,
    active: active && document !== null,
    state,
    apply,
    onSave,
  })
  const activate = (): void => {
    onActivate()
    focusInput()
  }
  const { diagnostics, status } = useEditorDiagnostics(
    document?.path ?? '',
    state.text,
  )

  const dirty = document ? state.text !== document.savedContent : false

  return (
    <group
      position={[2.4, 0.65, 0]}
      onPointerOver={() => onInteractionChange(true)}
      onPointerOut={() => onInteractionChange(false)}
      onPointerDown={(event) => {
        event.stopPropagation()
        activate()
      }}
      onWheel={(event) => {
        event.stopPropagation()
        setState((current) =>
          CodeEditorLogic.scroll(
            current,
            event.deltaY > 0 ? 3 : -3,
            visibleLineCount,
          ),
        )
      }}
    >
      <RoundedBox args={[5.2, 3.55, 0.12]} radius={0.12} smoothness={4}>
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
        {document
          ? `${document.path}${dirty ? ' •' : ''}`
          : 'Select a source node'}
      </Text>
      <EditorSurface
        state={state}
        active={active}
        diagnostics={diagnostics}
        onActivate={activate}
        onCursor={(offset, extend) =>
          apply(CodeEditorLogic.setCursor(state, offset, extend))
        }
      />
      <Text
        position={[2.25, -1.62, 0.075]}
        fontSize={0.08}
        color="#7984ad"
        anchorX="right"
      >
        {active
          ? `${status} · Ctrl/Cmd+S saves · Shift+wheel scrolls sideways`
          : 'select panel to edit'}
      </Text>
    </group>
  )
}
