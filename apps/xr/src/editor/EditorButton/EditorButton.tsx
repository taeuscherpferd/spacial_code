import { useState } from 'react'
import { RoundedBox, Text } from '@react-three/drei'

interface EditorButtonProps {
  label: string
  disabled?: boolean
  onPress: () => void
}

export const EditorButton = ({
  label,
  disabled = false,
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
      <RoundedBox args={[0.85, 0.27, 0.045]} radius={0.045} smoothness={4}>
        <meshBasicMaterial
          color={
            disabled
              ? '#20283a'
              : pressed
                ? '#4567a5'
                : hovered
                  ? '#36558c'
                  : '#233755'
          }
        />
      </RoundedBox>
      <Text
        position={[0, 0, 0.026]}
        fontSize={0.095}
        color={disabled ? '#7984ad' : '#f4f6ff'}
      >
        {label}
      </Text>
    </group>
  )
}
