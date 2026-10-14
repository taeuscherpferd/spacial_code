import { Billboard, Text } from '@react-three/drei'
import type { GroupRegion } from '@/graph/SpatialGraphLayout.logic'

interface GraphGroupRegionsProps {
  regions: readonly GroupRegion[]
  /** Nodes currently shown; a group with none of its files shown is hidden too. */
  visibleIds: ReadonlySet<string>
}

const ignoreRaycast = () => undefined

/** A faint bubble and a label around each group, so the islands read as named areas. */
export const GraphGroupRegions = ({
  regions,
  visibleIds,
}: GraphGroupRegionsProps) => (
  <>
    {regions.map((region) => {
      const shown = region.rootIds.filter((id) => visibleIds.has(id)).length
      if (shown === 0) {
        return null
      }
      const fontSize = Math.min(Math.max(region.radius * 0.12, 0.18), 0.7)
      return (
        <group key={region.id} position={region.center}>
          {/* Never hit by pointer rays, so it can't steal clicks from the nodes inside. */}
          <mesh raycast={ignoreRaycast} renderOrder={-2}>
            <sphereGeometry args={[region.radius + 0.3, 32, 16]} />
            <meshBasicMaterial
              color="#8fa3d9"
              transparent
              opacity={0.035}
              depthWrite={false}
            />
          </mesh>
          <Billboard position={[0, region.radius + 0.3 + fontSize, 0]}>
            <Text
              raycast={ignoreRaycast}
              fontSize={fontSize}
              color="#c9d4f5"
              outlineWidth={fontSize * 0.05}
              outlineColor="#070a12"
              anchorX="center"
              anchorY="bottom"
            >
              {region.label}
            </Text>
            <Text
              raycast={ignoreRaycast}
              fontSize={fontSize * 0.55}
              color="#8f9bc0"
              outlineWidth={fontSize * 0.03}
              outlineColor="#070a12"
              anchorX="center"
              anchorY="top"
            >
              {shown === region.rootIds.length
                ? region.detail
                : `${region.detail} · ${shown} shown`}
            </Text>
          </Billboard>
        </group>
      )
    })}
  </>
)
