import { useEffect, useRef } from 'react'
import type { ProcessState } from '@/connection/protocol'
import { useTerminalBuffer } from '@/terminal/hooks/useTerminalBuffer'
import { terminalInput, processLabel } from '@/terminal/TerminalInput'
import styles from './DesktopTerminal.module.scss'

interface DesktopTerminalProps {
  chunks: string[]
  process: ProcessState
  onInput: (data: string) => void
}

export const DesktopTerminal = ({
  chunks,
  process,
  onInput,
}: DesktopTerminalProps) => {
  const buffer = useTerminalBuffer(chunks)
  const output = useRef<HTMLPreElement>(null)
  useEffect(() => {
    if (output.current) output.current.scrollTop = output.current.scrollHeight
  }, [buffer])
  return (
    <section className={styles.terminal} aria-label="Terminal">
      <header>
        {processLabel(process)} · Click output to type · Ctrl+C interrupts
      </header>
      <pre
        ref={output}
        tabIndex={0}
        aria-label="Terminal input and output"
        onKeyDown={(event) => {
          const data = terminalInput(event.nativeEvent)
          if (data !== null) {
            event.preventDefault()
            onInput(data)
          }
        }}
      >
        {buffer.lines
          .map((line) => line.spans.map((span) => span.text).join(''))
          .join('\n')}
      </pre>
    </section>
  )
}
