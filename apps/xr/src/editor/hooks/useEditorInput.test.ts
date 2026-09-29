import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodeEditorLogic, type EditorState } from '@/editor/CodeEditor.logic'
import { ImmersiveInputLogic } from '@/editor/ImmersiveInput.logic'
import { useEditorInput } from '@/editor/hooks/useEditorInput'

const lifecycle = vi.hoisted(() => ({ cleanup: [] as Array<() => void> }))
vi.mock('react', () => {
  const effect = (setup: () => void | (() => void)): void => {
    const cleanup = setup()
    if (cleanup) lifecycle.cleanup.push(cleanup)
  }
  return {
    useRef: <T>(current: T) => ({ current }),
    useCallback: <T>(callback: T) => callback,
    useEffect: effect,
    useLayoutEffect: effect,
  }
})
vi.mock('@react-three/xr', () => ({ useXR: () => true }))

class NativeInputEvent extends Event {
  constructor(
    public inputType: string,
    public data: string | null,
    type = 'input',
    cancelable = false,
  ) {
    super(type, { cancelable })
  }
}
class NativeCompositionEvent extends Event {
  constructor(
    type: string,
    public data = '',
  ) {
    super(type)
  }
}
class InputSurface extends EventTarget {
  value = ''
  selectionStart = 0
  selectionEnd = 0
  selectionDirection = 'forward'
  setAttribute = vi.fn()
  remove = vi.fn()
  blur = vi.fn()
  focus = vi.fn(() => {
    surfaceDocument.activeElement = this
  })
  setSelectionRange = vi.fn((start: number, end: number, direction: string) => {
    this.selectionStart = start
    this.selectionEnd = end
    this.selectionDirection = direction
  })
}
const surfaceDocument = { activeElement: null as InputSurface | null }

const mount = (openKeyboard = true) => {
  const element = new InputSurface()
  surfaceDocument.activeElement = null
  vi.stubGlobal('document', {
    get activeElement() {
      return surfaceDocument.activeElement
    },
    createElement: () => element,
    body: { appendChild: vi.fn() },
  })
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('InputEvent', NativeInputEvent)
  let state = CodeEditorLogic.setCursor(
    CodeEditorLogic.create('before after'),
    7,
  )
  const apply = vi.fn((next: EditorState) => {
    state = next
  })
  const focus = useEditorInput({
    active: true,
    inputClassName: 'input',
    state,
    apply,
    onSave: vi.fn(),
  })
  if (openKeyboard) focus()
  return { element, apply, focus, state: () => state }
}

afterEach(() => {
  lifecycle.cleanup
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup())
  vi.unstubAllGlobals()
})

describe('immersive keyboard event sequences', () => {
  it('waits for a user gesture to focus the field in VR', () => {
    const view = mount(false)
    expect(view.element.focus).not.toHaveBeenCalled()
    view.focus()
    expect(view.element.focus).toHaveBeenCalledTimes(1)
  })

  it('explicitly reopens a dismissed keyboard even when its field retains focus', () => {
    const view = mount()
    view.focus(true)
    expect(view.element.blur).toHaveBeenCalledTimes(1)
    expect(view.element.focus).toHaveBeenCalledTimes(2)
    view.focus()
    expect(view.element.focus).toHaveBeenCalledTimes(2)
  })

  it('displays composition updates before completion without rewriting the native buffer', () => {
    const view = mount()
    const selections = view.element.setSelectionRange.mock.calls.length
    view.element.dispatchEvent(new NativeCompositionEvent('compositionstart'))
    for (const data of ['h', 'he', 'h', '', 'hello']) {
      view.element.dispatchEvent(
        new NativeCompositionEvent('compositionupdate', data),
      )
      view.element.value = data
      view.element.dispatchEvent(
        new NativeInputEvent('insertCompositionText', data),
      )
      expect(view.state().text).toBe(`before ${data}after`)
      expect(view.element.value).toBe(data)
    }
    expect(view.element.setSelectionRange).toHaveBeenCalledTimes(selections)
    expect(view.element.focus).toHaveBeenCalledTimes(1)
    expect(view.state().history).toHaveLength(1)
  })

  it('handles backspace during and after composition and commits only once', async () => {
    const view = mount()
    view.element.dispatchEvent(new NativeCompositionEvent('compositionstart'))
    view.element.dispatchEvent(
      new NativeCompositionEvent('compositionupdate', 'hi'),
    )
    view.element.value = 'hi'
    view.element.dispatchEvent(
      new NativeInputEvent('insertCompositionText', 'hi'),
    )
    view.element.value = 'h'
    view.element.dispatchEvent(
      new NativeInputEvent('deleteContentBackward', null),
    )
    expect(view.state().text).toBe('before hafter')
    view.element.dispatchEvent(
      new NativeCompositionEvent('compositionend', 'h'),
    )
    view.element.dispatchEvent(
      new NativeInputEvent('insertFromComposition', 'h'),
    )
    await Promise.resolve()
    expect(view.state().text).toBe('before hafter')
    expect(view.element.value).toBe('h')
    view.element.value = ''
    view.element.dispatchEvent(
      new NativeInputEvent('deleteContentBackward', null),
    )
    expect(view.state().text).toBe('before after')
  })

  it('handles empty delete data and ignores stale compositionend text', async () => {
    const view = mount()
    view.element.dispatchEvent(new NativeCompositionEvent('compositionstart'))
    view.element.value = 'ab'
    view.element.dispatchEvent(
      new NativeInputEvent('insertCompositionText', 'ab'),
    )
    view.element.value = 'a'
    view.element.dispatchEvent(
      new NativeInputEvent('deleteContentBackward', ''),
    )
    expect(view.state().text).toBe('before aafter')
    view.element.dispatchEvent(
      new NativeCompositionEvent('compositionend', 'ab'),
    )
    await Promise.resolve()
    expect(view.state().text).toBe('before aafter')
    expect(view.element.value).toBe('a')
  })

  it('keeps source out of the native field and rearms repeated backspace', () => {
    const view = mount()
    for (const expected of ['beforeafter', 'beforafter', 'befoafter']) {
      expect(view.element.value).toBe(ImmersiveInputLogic.buffer)
      expect(view.element.selectionStart).toBe(1)
      view.element.value = '\u200b'
      view.element.selectionStart = 0
      view.element.selectionEnd = 0
      view.element.dispatchEvent(
        new NativeInputEvent('deleteContentBackward', ''),
      )
      expect(view.state().text).toBe(expected)
    }
    expect(view.element.focus).toHaveBeenCalledTimes(1)
  })

  it('does not refocus an already focused input and can reopen after dismissal', () => {
    const view = mount()
    view.focus()
    view.focus()
    expect(view.element.focus).toHaveBeenCalledTimes(1)
    surfaceDocument.activeElement = null
    view.focus()
    expect(view.element.focus).toHaveBeenCalledTimes(2)
  })

  it('ignores native select-all and keeps the keyboard buffer between insertions', () => {
    const view = mount()
    view.element.selectionStart = 0
    view.element.selectionEnd = view.element.value.length
    view.element.dispatchEvent(new Event('select'))
    for (const data of ['a', 'ab']) {
      view.element.value = data
      view.element.dispatchEvent(new NativeInputEvent('insertText', data))
    }
    expect(view.state().text).toBe('before abafter')
    expect(view.element.focus).toHaveBeenCalledTimes(1)
  })
  it('does not treat removal of a sentinel during insertion as source deletion', () => {
    const view = mount()
    view.element.value = 'x'
    view.element.dispatchEvent(new NativeInputEvent('insertText', 'x'))
    expect(view.state().text).toBe('before xafter')
    view.element.dispatchEvent(new NativeInputEvent('insertText', 'x'))
    expect(view.state().text).toBe('before xafter')
    view.element.value = 'xy'
    view.element.dispatchEvent(new NativeInputEvent('insertText', 'y'))
    expect(view.state().text).toBe('before xyafter')
  })

  it('handles composition replacement without compositionstart and does not replay completion', async () => {
    const view = mount()
    for (const value of ['h', 'he', 'hello', 'hell']) {
      view.element.value = value
      view.element.dispatchEvent(
        new NativeInputEvent('insertCompositionText', value),
      )
      expect(view.state().text).toBe(`before ${value}after`)
    }
    view.element.dispatchEvent(
      new NativeCompositionEvent('compositionend', 'hello'),
    )
    view.element.dispatchEvent(new NativeInputEvent('insertText', 'hell'))
    await Promise.resolve()
    expect(view.element.value).toBe('hell')
    expect(view.state().text).toBe('before hellafter')
    expect(view.state().history).toHaveLength(1)
  })

  it('deletes the preceding source after the keyboard has emptied its buffer', () => {
    const view = mount()
    view.element.value = 'x'
    view.element.dispatchEvent(new NativeInputEvent('insertText', 'x'))
    view.element.value = ''
    view.element.dispatchEvent(
      new NativeInputEvent('deleteContentBackward', ''),
    )
    expect(view.state().text).toBe('before after')
    const deletion = new NativeInputEvent(
      'deleteContentBackward',
      null,
      'beforeinput',
      true,
    )
    view.element.dispatchEvent(deletion)
    expect(deletion.defaultPrevented).toBe(true)
    expect(view.state().text).toBe('beforeafter')
    view.element.value = 'z'
    view.element.dispatchEvent(new NativeInputEvent('insertText', 'z'))
    expect(view.state().text).toBe('beforezafter')
  })
})
