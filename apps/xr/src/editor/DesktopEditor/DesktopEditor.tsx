import { useMemo } from 'react'
import type { SourceDocument } from '@/connection/protocol'
import { DesktopEditorLogic } from '@/editor/DesktopEditor/DesktopEditor.logic'
import { useEditorDiagnostics } from '@/editor/hooks/useEditorDiagnostics'
import { EditorHighlightingLogic } from '@/editor/highlighting/EditorHighlighting.logic'
import { useDesktopHighlighting } from '@/editor/DesktopEditor/hooks/useDesktopHighlighting'
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
  const text = DesktopEditorLogic.normalizeText(document?.content ?? '')
  const { input, highlight, syncScroll } = useDesktopHighlighting(
    text,
    document?.path,
    focusLine,
  )
  const { diagnostics, status } = useEditorDiagnostics(
    document?.path ?? '',
    text,
  )
  const lines = useMemo(
    () => EditorHighlightingLogic.lines(text, diagnostics),
    [text, diagnostics],
  )

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
      <div className={styles.surface}>
        <pre ref={highlight} className={styles.highlight} aria-hidden="true">
          {lines.map((line) => (
            <span key={line.number} className={styles.line}>
              {line.tokens.map((token) => (
                <span
                  key={token.start}
                  className={`${styles[token.kind]} ${token.diagnostic ? styles.diagnostic : ''}`}
                >
                  {token.text}
                </span>
              ))}
              {line.markers.map((marker, index) => (
                <span key={index} className={styles.marker}>
                  {line.text.slice(0, marker.start)}
                  <span />
                </span>
              ))}
              {line.text === '' ? '\u200b' : ''}
              {line.number < lines.length ? '\n' : ''}
            </span>
          ))}
        </pre>
        <textarea
          ref={input}
          className={styles.input}
          aria-label="Source code"
          value={text}
          disabled={!document}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          onScroll={syncScroll}
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
      </div>
    </section>
  )
}
