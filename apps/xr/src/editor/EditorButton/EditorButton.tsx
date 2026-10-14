import { useState } from 'react'
import { RoundedBox, Text } from '@react-three/drei'

interface EditorButtonProps {
  label: string
  disabled?: boolean
  /** Drawn highlighted, for toggles that are on. */
  active?: boolean
  width?: number
  fontSize?: number
  onPress: () => void
}

export const EditorButton = ({
  label,
  disabled = false,
  active = false,
  width = 0.85,
  fontSize = 0.095,
  onPress,
}: EditorButtonProps) => {
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)
  return (
    <group
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => {
        setHovered(false)
        setPressed(false)
      }}
      onPointerDown={(event) => {
        event.stopPropagation()
        event.nativeEvent.preventDefault()
        if (!disabled) setPressed(true)
      }}
      onPointerUp={(event) => {
        event.stopPropagation()
        event.nativeEvent.preventDefault()
        setPressed(false)
        if (!disabled && pressed) onPress()
      }}
    >
      <RoundedBox args={[width, 0.27, 0.045]} radius={0.045} smoothness={4}>
        <meshBasicMaterial
          color={
            disabled
              ? '#20283a'
              : pressed
                ? '#4567a5'
                : hovered
                  ? '#36558c'
                  : active
                    ? '#305590'
                    : '#233755'
          }
        />
      </RoundedBox>
      <Text
        position={[0, 0, 0.026]}
        fontSize={fontSize}
        maxWidth={width - 0.08}
        whiteSpace="nowrap"
        clipRect={[-width / 2 + 0.04, -0.12, width / 2 - 0.04, 0.12]}
        color={disabled ? '#7984ad' : '#f4f6ff'}
      >
        {label}
      </Text>
    </group>
  )
}
