import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useXR } from '@react-three/xr'
import { ImmersiveInputLogic } from '@/editor/ImmersiveInput.logic'
import { EditorInputLogic } from '@/editor/EditorInput.logic'
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
}: EditorInputOptions): ((reopen?: boolean) => void) => {
  const immersive = useXR((xr) => xr.session !== undefined)
  const currentState = useRef(state)
  const callbacks = useRef({ apply, onSave, active, immersive })
  const composition = useRef<EditorState | null>(null)
  const input = useRef<HTMLTextAreaElement | null>(null)
  const nativeState = useRef<EditorState | null>(null)
  const immersiveOrigin = useRef(state)
  const immersiveValue = useRef('')
  useLayoutEffect(() => {
    callbacks.current = { apply, onSave, active, immersive }
  }, [apply, onSave, active, immersive])
  const commit = useCallback((next: EditorState): void => {
    currentState.current = next
    callbacks.current.apply(next)
  }, [])
  const focusInput = useCallback((reopen = false): void => {
    const element = input.current
    if (element && reopen && document.activeElement === element) element.blur()
    if (element && (reopen || document.activeElement !== element)) {
      immersiveOrigin.current = currentState.current
      immersiveValue.current = ''
      synchronizeInput(
        element,
        currentState.current,
        callbacks.current.immersive,
      )
      element.focus({ preventScroll: true })
    }
  }, [])

  useLayoutEffect(() => {
    const element = document.createElement('textarea')
    element.className = inputClassName
    element.setAttribute('aria-label', 'Spatial code editor')
    element.spellcheck = false
    element.autocomplete = 'off'
    element.setAttribute('autocapitalize', 'off')
    element.setAttribute('autocorrect', 'off')
    element.inputMode = 'text'
    element.setAttribute('enterkeyhint', 'enter')
    document.body.appendChild(element)
    input.current = element
    const publishNative = (next: EditorState): void => {
      nativeState.current = next
      if (
        next.text !== currentState.current.text ||
        !EditorInputLogic.sameSelection(next, currentState.current)
      )
        commit(next)
    }
    const deleteAtBoundary = (inputType: string): void => {
      publishNative(
        ImmersiveInputLogic.boundaryDelete(currentState.current, inputType),
      )
      immersiveOrigin.current = currentState.current
      synchronizeInput(element, currentState.current, true)
    }
    const handleInput = (event: Event): void => {
      if (!callbacks.current.active || !(event instanceof InputEvent)) return
      const nativeInput = {
        inputType: event.inputType,
        data: event.data,
        value: element.value,
        selectionStart: element.selectionStart,
        selectionEnd: element.selectionEnd,
        backward: element.selectionDirection === 'backward',
      }
      if (callbacks.current.immersive) {
        const value = ImmersiveInputLogic.text(element.value)
        if (value === immersiveValue.current) {
          if (!value && event.inputType.startsWith('deleteContent'))
            deleteAtBoundary(event.inputType)
          return
        }
        immersiveValue.current = value
        publishNative(
          ImmersiveInputLogic.compose(immersiveOrigin.current, value),
        )
        return
      }
      if (composition.current) {
        publishNative(
          EditorInputLogic.compose(
            composition.current,
            currentState.current,
            event.data,
            event.inputType,
            element.value,
          ),
        )
        return
      }
      if (
        element.value === currentState.current.text &&
        event.inputType.startsWith('insert')
      )
        return
      // Some keyboards send a final input after compositionend.
      if (
        event.inputType === 'insertFromComposition' ||
        event.inputType === 'insertCompositionText'
      )
        return
      publishNative(
        EditorInputLogic.apply(
          currentState.current,
          nativeInput,
          callbacks.current.immersive,
        ),
      )
    }
    const handleCompositionStart = (): void => {
      if (callbacks.current.active) composition.current = currentState.current
    }
    const handleCompositionUpdate = (event: CompositionEvent): void => {
      if (
        composition.current &&
        callbacks.current.active &&
        !callbacks.current.immersive
      ) {
        publishNative(
          EditorInputLogic.compose(
            composition.current,
            currentState.current,
            event.data,
          ),
        )
      }
    }
    const handleCompositionEnd = (event: CompositionEvent): void => {
      const original = composition.current
      composition.current = null
      if (
        original &&
        callbacks.current.active &&
        !callbacks.current.immersive
      ) {
        publishNative(
          EditorInputLogic.compose(original, currentState.current, event.data),
        )
        queueMicrotask(() => {
          if (input.current === element && !composition.current)
            synchronizeInput(
              element,
              currentState.current,
              callbacks.current.immersive,
            )
        })
      }
    }
    const handleSelection = (): void => {
      const current = currentState.current
      if (
        !callbacks.current.active ||
        callbacks.current.immersive ||
        composition.current ||
        element.value !== current.text
      )
        return
      const next = CodeEditorLogic.setSelection(
        current,
        element.selectionStart,
        element.selectionEnd,
        element.selectionDirection === 'backward',
      )
      if (!EditorInputLogic.sameSelection(current, next)) publishNative(next)
    }
    const handleBeforeInput = (event: Event): void => {
      if (
        !(event instanceof InputEvent) ||
        !callbacks.current.active ||
        !callbacks.current.immersive ||
        !event.cancelable ||
        immersiveValue.current !== '' ||
        !event.inputType.startsWith('deleteContent')
      )
        return
      event.preventDefault()
      deleteAtBoundary(event.inputType)
    }
    element.addEventListener('beforeinput', handleBeforeInput)
    element.addEventListener('compositionstart', handleCompositionStart)
    element.addEventListener('compositionupdate', handleCompositionUpdate)
    element.addEventListener('compositionend', handleCompositionEnd)
    element.addEventListener('input', handleInput)
    element.addEventListener('select', handleSelection)
    return () => {
      element.removeEventListener('beforeinput', handleBeforeInput)
      element.removeEventListener('compositionstart', handleCompositionStart)
      element.removeEventListener('compositionupdate', handleCompositionUpdate)
      element.removeEventListener('compositionend', handleCompositionEnd)
      element.removeEventListener('input', handleInput)
      element.removeEventListener('select', handleSelection)
      element.remove()
      input.current = null
      composition.current = null
    }
  }, [inputClassName, commit])

  useLayoutEffect(() => {
    const native = nativeState.current
    currentState.current = state
    if (
      native &&
      native.text === state.text &&
      EditorInputLogic.sameSelection(native, state)
    )
      return
    nativeState.current = null
    composition.current = null
    immersiveOrigin.current = state
    immersiveValue.current = ''
    if (input.current) synchronizeInput(input.current, state, immersive)
  }, [state, immersive])

  useEffect(() => {
    if (active && !immersive) focusInput()
    else if (!active) {
      composition.current = null
      input.current?.blur()
    }
  }, [active, immersive, focusInput])

  useEffect(() => {
    if (!active) {
      return
    }
    const handleKey = (event: KeyboardEvent): void => {
      if (event.target !== input.current) return
      const state = currentState.current
      const modifier = event.ctrlKey || event.metaKey
      if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault()
        callbacks.current.onSave(state.text)
        return
      }
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        commit(
          event.shiftKey
            ? CodeEditorLogic.redo(state)
            : CodeEditorLogic.undo(state),
        )
        return
      }
      if (modifier && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        commit(CodeEditorLogic.redo(state))
        return
      }
      if (modifier && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        commit(CodeEditorLogic.selectAll(state))
        return
      }
      if (modifier && ['c', 'x'].includes(event.key.toLowerCase())) {
        const selected = CodeEditorLogic.selectedText(state)
        if (selected) {
          event.preventDefault()
          void writeClipboard(selected)
          if (event.key.toLowerCase() === 'x') {
            commit(CodeEditorLogic.insert(state, ''))
          }
        }
        return
      }
      if (modifier || event.altKey || event.isComposing || composition.current)
        return
      const movement = movementForKey(event.key)
      if (movement) {
        event.preventDefault()
        commit(CodeEditorLogic.move(state, movement, event.shiftKey))
        return
      }
      if (
        callbacks.current.immersive &&
        !['Tab', 'Backspace', 'Delete'].includes(event.key)
      )
        return
      const edit = editForKey(event.key, state)
      if (edit) {
        event.preventDefault()
        commit(edit)
      }
    }
    const handlePaste = (event: ClipboardEvent): void => {
      if (event.target !== input.current) return
      const state = currentState.current
      const value = event.clipboardData?.getData('text/plain')
      if (value) {
        event.preventDefault()
        commit(CodeEditorLogic.insert(state, value))
      }
    }
    window.addEventListener('keydown', handleKey)
    window.addEventListener('paste', handlePaste)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('paste', handlePaste)
    }
  }, [active, commit])
  return focusInput
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

const synchronizeInput = (
  element: HTMLTextAreaElement,
  state: EditorState,
  immersive = false,
): void => {
  if (immersive) {
    if (element.value !== ImmersiveInputLogic.buffer)
      element.value = ImmersiveInputLogic.buffer
    if (element.selectionStart !== 1 || element.selectionEnd !== 1)
      element.setSelectionRange(1, 1, 'forward')
    return
  }
  if (element.value !== state.text) element.value = state.text
  const start = Math.min(state.anchor ?? state.cursor, state.cursor)
  const end = Math.max(state.anchor ?? state.cursor, state.cursor)
  const direction =
    state.anchor !== null && state.anchor > state.cursor
      ? 'backward'
      : 'forward'
  if (
    element.selectionStart !== start ||
    element.selectionEnd !== end ||
    (start !== end && element.selectionDirection !== direction)
  ) {
    element.setSelectionRange(start, end, direction)
  }
}
