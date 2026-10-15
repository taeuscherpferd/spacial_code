import { Container } from '@react-three/uikit'
import type { ReactNode } from 'react'

/** World units per uikit pixel: 200px is one unit before the panel's group scale. */
export const vrPixelSize = 0.005

interface VrPanelProps {
  width: number
  height: number
  children: ReactNode
}

/** The backing card for an immersive menu. Place and scale it with a wrapping group. */
export const VrPanel = ({ width, height, children }: VrPanelProps) => (
  <Container
    pixelSize={vrPixelSize}
    width={width}
    height={height}
    padding={30}
    gap={10}
    flexDirection="column"
    borderRadius={14}
    backgroundColor="#0c1425"
    color="#f4f6ff"
  >
    {children}
  </Container>
)
