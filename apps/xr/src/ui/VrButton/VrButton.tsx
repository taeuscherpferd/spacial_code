import { Container, Text } from '@react-three/uikit'
import { VrLine } from '@/ui/VrLine/VrLine'
import { VrTextLogic } from '@/ui/VrText.logic'

interface VrButtonProps {
  label: string
  disabled?: boolean
  /** Drawn highlighted, for toggles that are on. */
  active?: boolean
  /** In uikit pixels; without it the button grows to fit its label. */
  width?: number
  fontSize?: number
  onPress: () => void
}

export const VrButton = ({
  label,
  disabled = false,
  active = false,
  width,
  fontSize = 19,
  onPress,
}: VrButtonProps) => (
  <Container
    width={width}
    height={54}
    flexShrink={0}
    paddingX={12}
    alignItems="center"
    justifyContent="center"
    borderRadius={9}
    backgroundColor={disabled ? '#20283a' : active ? '#305590' : '#233755'}
    hover={disabled ? {} : { backgroundColor: '#36558c' }}
    active={disabled ? {} : { backgroundColor: '#4567a5' }}
    // Keeps focus on the editor's hidden input, so its keyboard stays open.
    onPointerDown={(event) => {
      event.stopPropagation()
      event.nativeEvent.preventDefault()
    }}
    onPointerUp={(event) => {
      event.stopPropagation()
      event.nativeEvent.preventDefault()
    }}
    onClick={(event) => {
      event.stopPropagation()
      if (!disabled) onPress()
    }}
  >
    {width === undefined ? (
      <Text fontSize={fontSize} color={disabled ? '#7984ad' : '#f4f6ff'}>
        {VrTextLogic.ascii(label)}
      </Text>
    ) : (
      <VrLine
        text={label}
        fontSize={fontSize}
        textAlign="center"
        color={disabled ? '#7984ad' : '#f4f6ff'}
      />
    )}
  </Container>
)
