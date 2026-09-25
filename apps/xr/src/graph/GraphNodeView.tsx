import { Billboard, Text } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useRef, useState } from 'react'
import { Plane, Vector3, type Group } from 'three'
import type { GraphNode } from '@/connection/protocol'
import { CodeGraphLogic, type Position3 } from '@/graph/CodeGraph.logic'

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
}

/** How far (in graph units) the pointer must travel before a press becomes a drag. */
const dragThreshold = 0.03

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
  const radius = CodeGraphLogic.nodeRadius(node.kind)
  const color = colors[node.kind]
  const label =
    node.kind === 'import'
      ? `import ${node.detail?.split('/').at(-1) ?? ''}`
      : node.name

  const groupRef = useRef<Group>(null)
  // Offset from the grab point to the node centre, so the node doesn't jump to the cursor.
  const grabOffset = useRef<Vector3 | null>(null)
  // Where the press started; cleared once it turns into a drag so release won't select.
  const pressStart = useRef<Vector3 | null>(null)
  const dragPlane = useRef(new Plane())

  /** Where the pointer ray crosses the node's drag plane, in the graph's local space. */
  const pointOnDragPlane = (
    event: ThreeEvent<PointerEvent>,
  ): Vector3 | null => {
    const group = groupRef.current
    const hit = event.ray.intersectPlane(dragPlane.current, new Vector3())
    if (!group || !hit) {
      return null
    }
    return group.parent ? group.parent.worldToLocal(hit) : hit
  }

  const handlePointerDown = (event: ThreeEvent<PointerEvent>): void => {
    event.stopPropagation()
    const group = groupRef.current
    if (!group) {
      return
    }
    // Drag on the plane facing the camera through the node's current position.
    const nodeWorld = group.getWorldPosition(new Vector3())
    const normal = event.ray.direction.clone().negate()
    dragPlane.current.setFromNormalAndCoplanarPoint(normal, nodeWorld)
    const start = pointOnDragPlane(event)
    grabOffset.current = start
      ? new Vector3(...position).sub(start)
      : new Vector3()
    pressStart.current = start ?? new Vector3(...position)
    // R3F capture keeps move events coming to this node even when the ray leaves the sphere.
    ;(event.target as unknown as Element).setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: ThreeEvent<PointerEvent>): void => {
    if (!grabOffset.current) {
      return
    }
    event.stopPropagation()
    const point = pointOnDragPlane(event)
    if (!point) {
      return
    }
    if (pressStart.current) {
      if (point.distanceTo(pressStart.current) < dragThreshold) {
        return
      }
      pressStart.current = null
    }
    point.add(grabOffset.current)
    onMove(node.id, [point.x, point.y, position[2]])
  }

  const endDrag = (event: ThreeEvent<PointerEvent>): void => {
    if (!grabOffset.current) {
      return
    }
    grabOffset.current = null
    ;(event.target as unknown as Element).releasePointerCapture(event.pointerId)
    // A press that never became a drag is a click.
    if (pressStart.current && event.type === 'pointerup') {
      onSelect(node)
    }
    pressStart.current = null
  }

  return (
    <group
      ref={groupRef}
      position={position}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
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
      <mesh>
        <sphereGeometry args={[radius, 48, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 0.55 : hovered ? 0.38 : 0.22}
          roughness={0.9}
          metalness={0}
        />
      </mesh>
      <Billboard>
        <mesh renderOrder={-1}>
          <circleGeometry args={[radius * (selected ? 1.9 : 1.55), 48]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={selected ? 0.28 : hovered ? 0.18 : 0.1}
            depthWrite={false}
          />
        </mesh>
        <Text
          position={[0, radius + 0.1, 0]}
          fontSize={node.kind === 'file' ? 0.12 : 0.09}
          maxWidth={1.6}
          color={selected ? '#ffffff' : '#dfe3f5'}
          outlineWidth={0.006}
          outlineColor="#070a12"
          anchorX="center"
          anchorY="bottom"
        >
          {collapsed ? `▸ ${label}` : label}
        </Text>
      </Billboard>
    </group>
  )
}
