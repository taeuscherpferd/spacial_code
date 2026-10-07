import { useEffect, useRef, useState } from 'react'
import { TerminalLogic } from '@/terminal/Terminal.logic'

export const useTerminalBuffer = (chunks: string[]) => {
  const [buffer, setBuffer] = useState(TerminalLogic.create)
  const consumed = useRef(0)
  useEffect(() => {
    const reset = chunks.length < consumed.current
    const pending = chunks.slice(reset ? 0 : consumed.current)
    setBuffer((current) =>
      pending.reduce(
        (next, chunk) => TerminalLogic.consume(next, chunk),
        reset ? TerminalLogic.create() : current,
      ),
    )
    consumed.current = chunks.length
  }, [chunks])
  return buffer
}
