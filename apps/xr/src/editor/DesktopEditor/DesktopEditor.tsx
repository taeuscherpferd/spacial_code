import { useEffect, useRef } from 'react'
import type { SourceDocument } from '@/connection/protocol'
import { CodeEditorLogic } from '@/editor/CodeEditor.logic'
import { useEditorDiagnostics } from '@/editor/hooks/useEditorDiagnostics'
import styles from './DesktopEditor.module.scss'

interface DesktopEditorProps {
  document: SourceDocument | null
  focusLine: number
  onActivate: () => void
  onChange: (content: string) => void
  onSave: (content: string) => void
}

export const DesktopEditor = ({
  document,
  focusLine,
  onActivate,
  onChange,
  onSave,
}: DesktopEditorProps) => {
  const input = useRef<HTMLTextAreaElement>(null)
  const { status } = useEditorDiagnostics(
    document?.path ?? '',
    document?.content ?? '',
  )
  useEffect(() => {
    const element = input.current
    if (!element) return
    const state = CodeEditorLogic.create(element.value, focusLine)
    element.setSelectionRange(state.cursor, state.cursor)
    element.scrollTop = state.scrollLine * 20
  }, [document?.path, focusLine])

  return (
    <section className={styles.editor} aria-label="Source editor">
      <header className={styles.header}>
        <span>
          {document
            ? `${document.path}${document.content !== document.savedContent ? ' •' : ''}`
            : 'Select a source node or file'}
        </span>
        <span>{document ? status : ''}</span>
        <button
          type="button"
          disabled={!document || document.content === document.savedContent}
          onClick={() => document && onSave(document.content)}
        >
          Save
        </button>
      </header>
      <textarea
        ref={input}
        className={styles.input}
        aria-label="Source code"
        value={document?.content ?? ''}
        disabled={!document}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        onFocus={onActivate}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === 's'
          ) {
            event.preventDefault()
            if (document) onSave(document.content)
          }
        }}
      />
    </section>
  )
}
