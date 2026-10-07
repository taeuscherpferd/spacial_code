import styles from './CodeEditor.module.scss'
import { RoundedBox, Text } from '@react-three/drei'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { SourceDocument } from '@/connection/protocol'
import { CodeEditorLogic, type EditorState } from '@/editor/CodeEditor.logic'

import { EditorButton } from '@/editor/EditorButton/EditorButton'
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

  const appliedText = useRef(state.text)
  useLayoutEffect(() => {
    appliedText.current = state.text
  }, [state.text])

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
      if (revealed.text !== appliedText.current) {
        appliedText.current = revealed.text
        onChange(revealed.text)
      }
    },
    [onChange],
  )

  const focusInput = useEditorInput({
    inputClassName: styles.input,
    active: active && document !== null,
    state,
    apply,
    onSave,
  })
  const openKeyboard = (): void => {
    if (!document) return
    onActivate()
    focusInput(true)
  }
  const { diagnostics, status } = useEditorDiagnostics(
    document?.path ?? '',
    state.text,
  )

  const dirty = document ? state.text !== document.savedContent : false

  return (
    <group
      onPointerOver={() => onInteractionChange(true)}
      onPointerOut={() => onInteractionChange(false)}
      onPointerDown={(event) => {
        event.stopPropagation()
        event.nativeEvent.preventDefault()
      }}
      onPointerUp={(event) => {
        event.stopPropagation()
        event.nativeEvent.preventDefault()
        onActivate()
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
      <group position={[2, 1.57, 0.1]}>
        <EditorButton
          label="Keyboard"
          disabled={!document}
          onPress={openKeyboard}
        />
      </group>
      <EditorSurface
        state={state}
        active={active}
        diagnostics={diagnostics}
        onActivate={onActivate}
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
