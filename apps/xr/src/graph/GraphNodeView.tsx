import { Billboard, Text } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { Vector3, type Group } from 'three'
import type { GraphNode } from '@/connection/protocol'
import { CodeGraphLogic, type Position3 } from '@/graph/CodeGraph.logic'

interface GraphNodeViewProps {
  node: GraphNode
  position: Position3
  selected: boolean
  collapsed: boolean
  onDraggingChange: (dragging: boolean) => void
  onMove: (id: string, position: Position3) => void
  onSelect: (node: GraphNode) => void
  onToggleCollapsed: (id: string) => void
  onFocus: (id: string) => void
}

export const GraphNodeView = ({
  node,
  position,
  selected,
  collapsed,
  onMove,
  onDraggingChange,
  onSelect,
  onToggleCollapsed,
  onFocus,
}: GraphNodeViewProps) => {
  const [hovered, setHovered] = useState(false)
  const radius = CodeGraphLogic.nodeRadius(node.kind)
  const color = CodeGraphLogic.nodeColor(node)
  const label =
    node.kind === 'import'
      ? `import ${node.detail?.split('/').at(-1) ?? ''}`
      : node.name

  const groupRef = useRef<Group>(null)
  // Offset from the grab point to the node centre, so the node doesn't jump to the cursor.
  const grabOffset = useRef<Vector3 | null>(null)
  // Where the press started in world space; cleared once it turns into a drag so release won't select.
  const pressStart = useRef<Vector3 | null>(null)
  // How far along the pointer ray the grab point sits; it stays there while dragging.
  const dragDistance = useRef(0)

  useEffect(() => () => onDraggingChange(false), [onDraggingChange])

  const worldAlongRay = (event: ThreeEvent<PointerEvent>): Vector3 =>
    event.ray.at(dragDistance.current, new Vector3())

  /** The point held at the grab distance along the pointer ray, in the graph's local space. */
  const pointAlongRay = (event: ThreeEvent<PointerEvent>): Vector3 | null => {
    const group = groupRef.current
    if (!group) {
      return null
    }
    const point = worldAlongRay(event)
    return group.parent ? group.parent.worldToLocal(point) : point
  }

  const handlePointerDown = (event: ThreeEvent<PointerEvent>): void => {
    event.stopPropagation()
    const group = groupRef.current
    if (!group) {
      return
    }
    // The node follows the pointer at a fixed distance, so it moves in depth with the controller too.
    dragDistance.current = event.ray.origin.distanceTo(event.point)
    const start = pointAlongRay(event)
    grabOffset.current = start
      ? new Vector3(...position).sub(start)
      : new Vector3()
    pressStart.current = worldAlongRay(event)
    // R3F capture keeps move events coming to this node even when the ray leaves the sphere.
    ;(event.target as Element).setPointerCapture(event.pointerId)
    onDraggingChange(true)
  }

  const handlePointerMove = (event: ThreeEvent<PointerEvent>): void => {
    if (!grabOffset.current) {
      return
    }
    event.stopPropagation()
    if (pressStart.current) {
      const moved = worldAlongRay(event).distanceTo(pressStart.current)
      if (!CodeGraphLogic.isDrag(moved, dragDistance.current)) {
        return
      }
      pressStart.current = null
    }
    const point = pointAlongRay(event)
    if (!point) {
      return
    }
    point.add(grabOffset.current)
    onMove(node.id, [point.x, point.y, point.z])
  }

  const endDrag = (event: ThreeEvent<PointerEvent>): void => {
    if (!grabOffset.current) {
      return
    }
    grabOffset.current = null
    ;(event.target as Element).releasePointerCapture(event.pointerId)
    onDraggingChange(false)
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
