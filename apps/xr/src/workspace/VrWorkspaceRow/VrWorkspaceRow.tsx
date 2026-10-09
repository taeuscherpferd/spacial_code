import { RoundedBox, Text } from '@react-three/drei'
import { useState } from 'react'

interface VrWorkspaceRowProps {
  label: string
  selected?: boolean
  disabled: boolean
  onPress: () => void
}

export const VrWorkspaceRow = ({
  label,
  selected = false,
  disabled,
  onPress,
}: VrWorkspaceRowProps) => {
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
        if (!disabled) setPressed(true)
      }}
      onPointerUp={(event) => {
        event.stopPropagation()
        setPressed(false)
        if (pressed && !disabled) onPress()
      }}
    >
      <RoundedBox args={[2.7, 0.22, 0.025]} radius={0.025} smoothness={3}>
        <meshBasicMaterial
          color={
            selected ? '#305590' : hovered && !disabled ? '#253b60' : '#131e32'
          }
        />
      </RoundedBox>
      <Text
        position={[-1.27, 0, 0.018]}
        fontSize={0.07}
        anchorX="left"
        maxWidth={2.5}
        whiteSpace="nowrap"
        overflowWrap="normal"
        clipRect={[-0.01, -0.1, 2.5, 0.1]}
        color={disabled ? '#7984ad' : '#f4f6ff'}
      >
        {label}
      </Text>
    </group>
  )
}
