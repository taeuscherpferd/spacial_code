import { useEffect, useRef } from 'react'
import {
  CodeEditorLogic,
  type EditorState,
  type CursorMovement,
} from '@/editor/CodeEditor.logic'

interface EditorInputOptions {
  inputClassName: string
  active: boolean
  state: EditorState
  apply: (state: EditorState) => void
  onSave: (text: string) => void
}

export const useEditorInput = ({
  active,
  inputClassName,
  state,
  apply,
  onSave,
}: EditorInputOptions): (() => void) => {
  const input = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const element = document.createElement('textarea')
    element.className = inputClassName
    element.setAttribute('aria-label', 'Spatial code editor')
    element.spellcheck = false
    element.autocomplete = 'off'
    element.setAttribute('autocapitalize', 'off')
    document.body.appendChild(element)
    input.current = element
    return () => {
      element.remove()
      input.current = null
    }
  }, [inputClassName])
  useEffect(() => {
    if (active) input.current?.focus({ preventScroll: true })
    else input.current?.blur()
  }, [active])
  useEffect(() => {
    const element = input.current
    if (!element) return
    if (element.value !== state.text) element.value = state.text
    element.setSelectionRange(
      Math.min(state.anchor ?? state.cursor, state.cursor),
      Math.max(state.anchor ?? state.cursor, state.cursor),
      state.anchor !== null && state.anchor > state.cursor
        ? 'backward'
        : 'forward',
    )
    const selection = (current: EditorState): EditorState =>
      CodeEditorLogic.setSelection(
        current,
        element.selectionStart,
        element.selectionEnd,
        element.selectionDirection === 'backward',
      )
    const handleInput = (): void => {
      const next = CodeEditorLogic.insert(
        CodeEditorLogic.selectAll(state),
        element.value,
      )
      apply(selection(next))
    }
    const handleSelection = (): void => {
      if (!active || element.value !== state.text) return
      const next = selection(state)
      if (next.cursor !== state.cursor || next.anchor !== state.anchor)
        apply(next)
    }
    element.addEventListener('input', handleInput)
    element.addEventListener('select', handleSelection)
    return () => {
      element.removeEventListener('input', handleInput)
      element.removeEventListener('select', handleSelection)
    }
  }, [state, apply, active])

  useEffect(() => {
    if (!active) {
      return
    }
    const handleKey = (event: KeyboardEvent): void => {
      if (event.target !== input.current) return
      const modifier = event.ctrlKey || event.metaKey
      if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault()
        onSave(state.text)
        return
      }
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        apply(
          event.shiftKey
            ? CodeEditorLogic.redo(state)
            : CodeEditorLogic.undo(state),
        )
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
      if (modifier || event.altKey || event.isComposing) return
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
      if (event.target !== input.current) return
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
  }, [active, apply, onSave, state])
  return () => input.current?.focus({ preventScroll: true })
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
    return CodeEditorLogic.newline(state)
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
