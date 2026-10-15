import { Container } from '@react-three/uikit'
import { VrLine } from '@/ui/VrLine/VrLine'

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
}: VrWorkspaceRowProps) => (
  <Container
    width="100%"
    height={44}
    flexShrink={0}
    paddingX={16}
    alignItems="center"
    borderRadius={5}
    backgroundColor={selected ? '#305590' : '#131e32'}
    hover={disabled || selected ? {} : { backgroundColor: '#253b60' }}
    onPointerDown={(event) => event.stopPropagation()}
    onPointerUp={(event) => event.stopPropagation()}
    onClick={(event) => {
      event.stopPropagation()
      if (!disabled) onPress()
    }}
  >
    <VrLine
      text={label}
      fontSize={14}
      color={disabled ? '#7984ad' : '#f4f6ff'}
    />
  </Container>
)
