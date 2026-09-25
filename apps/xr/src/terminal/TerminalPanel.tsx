import { RoundedBox, Text } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProcessState } from '@/connection/protocol'
import { TerminalLogic, type TerminalBuffer } from '@/terminal/Terminal.logic'

interface TerminalPanelProps {
  chunks: string[]
  process: ProcessState
  active: boolean
  onActivate: () => void
  onInput: (data: string) => void
}

const visibleLineCount = 8
const characterWidth = 0.057

export const TerminalPanel = ({
  chunks,
  process,
  active,
  onActivate,
  onInput,
}: TerminalPanelProps) => {
  const [buffer, setBuffer] = useState<TerminalBuffer>(() =>
    TerminalLogic.create(),
  )
  const [scrollback, setScrollback] = useState(0)
  const consumedChunks = useRef(0)

  useEffect(() => {
    if (chunks.length < consumedChunks.current) {
      consumedChunks.current = 0
      setBuffer(TerminalLogic.create())
    }
    const pending = chunks.slice(consumedChunks.current)
    if (pending.length) {
      setBuffer((current) =>
        pending.reduce(
          (nextBuffer, chunk) => TerminalLogic.consume(nextBuffer, chunk),
          current,
        ),
      )
      consumedChunks.current = chunks.length
      setScrollback(0)
    }
  }, [chunks])

  useEffect(() => {
    if (!active) {
      return
    }
    const handleKey = (event: KeyboardEvent): void => {
      const input = terminalInput(event)
      if (input !== null) {
        event.preventDefault()
        onInput(input)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [active, onInput])

  const lines = useMemo(
    () => TerminalLogic.visibleLines(buffer, visibleLineCount, scrollback),
    [buffer, scrollback],
  )

  return (
    <group
      position={[2.4, -2.15, 0]}
      onPointerDown={(event) => {
        event.stopPropagation()
        onActivate()
      }}
      onWheel={(event) => {
        event.stopPropagation()
        const maximum = Math.max(0, buffer.lines.length - visibleLineCount)
        setScrollback((current) =>
          Math.min(maximum, Math.max(0, current + (event.deltaY < 0 ? 3 : -3))),
        )
      }}
    >
      <RoundedBox args={[5.2, 1.55, 0.12]} radius={0.12} smoothness={4}>
        <meshStandardMaterial
          color={active ? '#0c1920' : '#091218'}
          emissive={active ? '#0c3335' : '#020608'}
          emissiveIntensity={0.3}
          roughness={0.82}
        />
      </RoundedBox>
      <Text
        position={[-2.35, 0.59, 0.075]}
        fontSize={0.13}
        color="#f4f6ff"
        anchorX="left"
      >
        Terminal
      </Text>
      <Text
        position={[2.35, 0.59, 0.075]}
        fontSize={0.08}
        color="#78cfc7"
        anchorX="right"
      >
        {processLabel(process)}
      </Text>
      {lines.map((line, lineIndex) => {
        let column = 0
        return line.spans.map((span, spanIndex) => {
          const start = column
          column += span.text.length
          return (
            <Text
              key={`${lineIndex}:${spanIndex}`}
              position={[
                -2.35 + start * characterWidth,
                0.39 - lineIndex * 0.14,
                0.075,
              ]}
              fontSize={0.095}
              color={span.color}
              anchorX="left"
              anchorY="top"
              maxWidth={4.7}
            >
              {span.text}
            </Text>
          )
        })
      })}
    </group>
  )
}

const terminalInput = (event: KeyboardEvent): string | null => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
    return '\u0003'
  }
  if (event.ctrlKey && event.key.toLowerCase() === 'd') {
    return '\u0004'
  }
  const controls: Record<string, string> = {
    Enter: '\r',
    Backspace: '\u007f',
    Tab: '\t',
    ArrowUp: '\u001b[A',
    ArrowDown: '\u001b[B',
    ArrowRight: '\u001b[C',
    ArrowLeft: '\u001b[D',
  }
  if (controls[event.key]) {
    return controls[event.key]
  }
  if (!event.ctrlKey && !event.metaKey && event.key.length === 1) {
    return event.key
  }
  return null
}

const processLabel = (process: ProcessState): string => {
  switch (process.status) {
    case 'idle':
      return 'IDLE'
    case 'running':
      return '● RUNNING'
    case 'exited':
      return process.code === null ? 'EXITED' : `EXIT ${process.code}`
    case 'failed':
      return 'FAILED'
  }
}
