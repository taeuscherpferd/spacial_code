import { RoundedBox, Text } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useState } from 'react'
import type { GraphNode } from '@/connection/protocol'
import type { Position3 } from '@/graph/CodeGraph.logic'

interface GraphNodeViewProps {
  node: GraphNode
  position: Position3
  selected: boolean
  collapsed: boolean
  onMove: (id: string, position: Position3) => void
  onSelect: (node: GraphNode) => void
  onToggleCollapsed: (id: string) => void
  onFocus: (id: string) => void
}

const colors: Record<GraphNode['kind'], string> = {
  file: '#2862ff',
  function: '#7c4dff',
  class: '#d652df',
  import: '#00a895',
  export: '#e99431',
}

export const GraphNodeView = ({
  node,
  position,
  selected,
  collapsed,
  onMove,
  onSelect,
  onToggleCollapsed,
  onFocus,
}: GraphNodeViewProps) => {
  const [hovered, setHovered] = useState(false)
  const width = node.kind === 'file' ? 1.48 : 1.12
  const label = node.kind === 'import' ? `import ${node.detail?.split('/').at(-1) ?? ''}` : node.name

  const handlePointerDown = (event: ThreeEvent<PointerEvent>): void => {
    event.stopPropagation()
    if (event.nativeEvent.target instanceof Element) {
      event.nativeEvent.target.setPointerCapture(event.pointerId)
    }
    onSelect(node)
  }

  const handlePointerMove = (event: ThreeEvent<PointerEvent>): void => {
    if (
      !(event.nativeEvent.target instanceof Element) ||
      !event.nativeEvent.target.hasPointerCapture(event.pointerId)
    ) {
      return
    }
    event.stopPropagation()
    onMove(node.id, [event.point.x, event.point.y, position[2]])
  }

  return (
    <group
      position={position}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => {
        if (event.nativeEvent.target instanceof Element) {
          event.nativeEvent.target.releasePointerCapture(event.pointerId)
        }
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onDoubleClick={(event) => {
        event.stopPropagation()
        onFocus(node.id)
      }}
      onContextMenu={(event) => {
        event.nativeEvent.preventDefault()
        event.stopPropagation()
        onToggleCollapsed(node.id)
      }}
    >
      <RoundedBox args={[width, 0.52, 0.18]} radius={0.1} smoothness={4}>
        <meshStandardMaterial
          color={colors[node.kind]}
          emissive={selected ? '#5a77ff' : hovered ? '#24315c' : '#000000'}
          emissiveIntensity={selected ? 0.7 : 0.38}
          roughness={0.35}
          metalness={0.18}
        />
      </RoundedBox>
      <Text
        position={[0, 0.02, 0.105]}
        fontSize={node.kind === 'file' ? 0.14 : 0.105}
        maxWidth={width - 0.18}
        color="#f7f8ff"
        anchorX="center"
        anchorY="middle"
      >
        {collapsed ? `▸ ${label}` : label}
      </Text>
      <Text
        position={[0, -0.19, 0.106]}
        fontSize={0.06}
        color="#bdc4e6"
        anchorX="center"
        anchorY="middle"
      >
        {node.kind.toUpperCase()}
      </Text>
    </group>
  )
}
