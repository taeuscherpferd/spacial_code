import { RoundedBox, Text } from '@react-three/drei'
import { useEffect, useMemo, useState } from 'react'
import { terminalInput, processLabel } from '@/terminal/TerminalInput'
import { useTerminalBuffer } from '@/terminal/hooks/useTerminalBuffer'
import type { ProcessState } from '@/connection/protocol'
import { TerminalLogic } from '@/terminal/Terminal.logic'

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
  const buffer = useTerminalBuffer(chunks)
  const [scrollback, setScrollback] = useState(0)
  useEffect(() => setScrollback(0), [chunks])

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
