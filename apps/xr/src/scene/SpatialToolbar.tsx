import { Container } from '@react-three/uikit'
import type { ProcessState } from '@/connection/protocol'
import { VrButton } from '@/ui/VrButton/VrButton'
import { vrPixelSize } from '@/ui/VrPanel/VrPanel'

interface SpatialToolbarProps {
  process: ProcessState
  canSave: boolean
  canFocus: boolean
  canBack: boolean
  canCollapse: boolean
  filtersActive: boolean
  onRun: () => void
  onStop: () => void
  onRestart: () => void
  onSave: () => void
  onFocus: () => void
  onBack: () => void
  onCollapse: () => void
  onFilters: () => void
}

export const SpatialToolbar = ({
  process,
  canSave,
  canFocus,
  canBack,
  canCollapse,
  filtersActive,
  onRun,
  onStop,
  onRestart,
  onSave,
  onFocus,
  onBack,
  onCollapse,
  onFilters,
}: SpatialToolbarProps) => {
  const running = process.status === 'running'
  return (
    <group position={[2.91, 2.72, 0]}>
      <Container pixelSize={vrPixelSize} flexDirection="row" gap={12}>
        <VrButton label="RUN" disabled={running} onPress={onRun} />
        <VrButton label="STOP" disabled={!running} onPress={onStop} />
        <VrButton label="RESTART" disabled={!running} onPress={onRestart} />
        <VrButton label="SAVE" disabled={!canSave} onPress={onSave} />
        <VrButton label="FOCUS" disabled={!canFocus} onPress={onFocus} />
        <VrButton label="BACK" disabled={!canBack} onPress={onBack} />
        <VrButton label="FOLD" disabled={!canCollapse} onPress={onCollapse} />
        <VrButton
          label={filtersActive ? 'FILTER *' : 'FILTER'}
          active={filtersActive}
          onPress={onFilters}
        />
      </Container>
    </group>
  )
}
