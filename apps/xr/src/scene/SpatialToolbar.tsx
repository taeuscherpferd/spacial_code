import { RoundedBox, Text } from '@react-three/drei'
import type { ProcessState } from '@/connection/protocol'

interface SpatialToolbarProps {
  process: ProcessState
  canSave: boolean
  canFocus: boolean
  canBack: boolean
  canCollapse: boolean
  onRun: () => void
  onStop: () => void
  onRestart: () => void
  onSave: () => void
  onFocus: () => void
  onBack: () => void
  onCollapse: () => void
}

export const SpatialToolbar = ({
  process,
  canSave,
  canFocus,
  canBack,
  canCollapse,
  onRun,
  onStop,
  onRestart,
  onSave,
  onFocus,
  onBack,
  onCollapse,
}: SpatialToolbarProps) => {
  const running = process.status === 'running'
  return (
    <group position={[2.4, 2.72, 0]}>
      <SpatialButton x={-2.2} label="▶ RUN" enabled={!running} onPress={onRun} />
      <SpatialButton x={-1.46} label="■ STOP" enabled={running} onPress={onStop} />
      <SpatialButton x={-0.64} label="↻ RESTART" enabled={running} onPress={onRestart} />
      <SpatialButton x={0.28} label="SAVE" enabled={canSave} onPress={onSave} />
      <SpatialButton x={1.0} label="FOCUS" enabled={canFocus} onPress={onFocus} />
      <SpatialButton x={1.76} label="BACK" enabled={canBack} onPress={onBack} />
      <SpatialButton x={2.46} label="FOLD" enabled={canCollapse} onPress={onCollapse} />
    </group>
  )
}

interface SpatialButtonProps {
  x: number
  label: string
  enabled: boolean
  onPress: () => void
}

const SpatialButton = ({ x, label, enabled, onPress }: SpatialButtonProps) => (
  <group
    position={[x, 0, 0]}
    onPointerDown={(event) => {
      event.stopPropagation()
      if (enabled) {
        onPress()
      }
    }}
  >
    <RoundedBox args={[0.65, 0.3, 0.1]} radius={0.06} smoothness={3}>
      <meshStandardMaterial
        color={enabled ? '#1c294e' : '#111522'}
        emissive={enabled ? '#27488d' : '#000000'}
        emissiveIntensity={0.35}
      />
    </RoundedBox>
    <Text fontSize={0.075} position={[0, 0, 0.057]} color={enabled ? '#edf2ff' : '#5c6275'}>
      {label}
    </Text>
  </group>
)

