import { Container, Text } from '@react-three/uikit'
import { VrTextLogic } from '@/ui/VrText.logic'

interface VrLineProps {
  text: string
  fontSize: number
  color?: string
  textAlign?: 'left' | 'center' | 'right'
}

/**
 * One line of text that fills the remaining width and clips whatever does not
 * fit, since uikit has no `white-space: nowrap`. Wrapped lines fall below the
 * one-line box and are hidden.
 */
export const VrLine = ({
  text,
  fontSize,
  color,
  textAlign = 'left',
}: VrLineProps) => {
  const lineHeight = Math.ceil(fontSize * 1.3)
  return (
    <Container
      flexGrow={1}
      flexShrink={1}
      minWidth={0}
      height={lineHeight}
      overflow="hidden"
    >
      <Text
        width="100%"
        fontSize={fontSize}
        lineHeight={`${lineHeight}px`}
        wordBreak="break-all"
        textAlign={textAlign}
        color={color}
      >
        {VrTextLogic.ascii(text)}
      </Text>
    </Container>
  )
}
