import { REGION_TYPES } from '@evo/contracts'
import type { ClusterLayoutSnapshot, RegionType } from '@evo/contracts'
import type { RandomSource } from '../random/RandomSource'
import type { ClusterLayout } from './ClusterLayout'
import type { Terrain } from './Terrain'

export interface Patch {
  readonly x: number
  readonly y: number
  readonly type: RegionType
  readonly cluster: number
}

/**
 * Every cluster keeps a floor of each biome and leans on two of them (docs/decisions/0014).
 * Meadow, forest and wetland are habitable (0.15 each); desert, cave and volcanic are harsh
 * (0.05 each). A cluster's primary biome gains 0.25 and its secondary 0.15, so every cluster mixes
 * all six biomes but each has its own signature, and none is made only of ground nothing can live on.
 */
export const HABITABLE_WEIGHT = 0.15
export const HARSH_WEIGHT = 0.05
export const PRIMARY_BONUS = 0.25
export const SECONDARY_BONUS = 0.15
const HABITABLE: ReadonlySet<RegionType> = new Set<RegionType>(['meadow', 'forest', 'wetland'])

/**
 * The biome weights of a cluster, in `REGION_TYPES` order: cluster `i` leans on `REGION_TYPES[i]`
 * (primary) and `REGION_TYPES[i + 1]` (secondary). They sum to exactly 1 for every cluster.
 */
export function clusterBiomeWeights(cluster: number): number[] {
  const primary = cluster % REGION_TYPES.length
  const secondary = (cluster + 1) % REGION_TYPES.length
  return REGION_TYPES.map((type, i) => {
    const base = HABITABLE.has(type) ? HABITABLE_WEIGHT : HARSH_WEIGHT
    return base + (i === primary ? PRIMARY_BONUS : i === secondary ? SECONDARY_BONUS : 0)
  })
}

/**
 * The static terrain of the cluster layout: each circular cluster holds `patchesPerCluster`
 * Voronoi patches, each a biome drawn from the cluster's signature weights; outside every circle
 * is void. Built once from the `terrain` stream (3 draws per patch: distance, angle, biome, in
 * cluster-major order) and never changed, so it is not part of the state hash.
 */
export class ClusterTerrain implements Terrain {
  readonly patches: readonly Patch[]
  private readonly perCluster: number

  constructor(
    private readonly layout: ClusterLayout,
    patchesPerCluster: number,
    random: RandomSource
  ) {
    this.perCluster = patchesPerCluster
    const patches: Patch[] = []
    for (let cluster = 0; cluster < layout.count; cluster++) {
      const weights = clusterBiomeWeights(cluster)
      let total = 0
      for (const weight of weights) total += weight
      for (let i = 0; i < patchesPerCluster; i++) {
        const point = layout.pointIn(cluster, random.float(), random.float())
        const target = random.float() * total
        let cumulative = 0
        let chosen = weights.length - 1
        for (let t = 0; t < weights.length; t++) {
          cumulative += weights[t] as number
          if (target < cumulative) {
            chosen = t
            break
          }
        }
        patches.push({ x: point.x, y: point.y, type: REGION_TYPES[chosen] as RegionType, cluster })
      }
    }
    this.patches = patches
  }

  indexAt(x: number, y: number): number {
    const cluster = this.layout.clusterAt(x, y)
    if (cluster < 0) return -1
    const first = cluster * this.perCluster
    let best = first
    let bestDistance = Infinity
    for (let i = first; i < first + this.perCluster; i++) {
      const patch = this.patches[i] as Patch
      const dx = patch.x - x
      const dy = patch.y - y
      const distance = dx * dx + dy * dy
      if (distance < bestDistance) {
        bestDistance = distance
        best = i
      }
    }
    return best
  }

  typeOf(regionIndex: number): RegionType {
    return (this.patches[regionIndex] as Patch).type
  }

  typeAt(x: number, y: number): RegionType | null {
    const index = this.indexAt(x, y)
    return index < 0 ? null : this.typeOf(index)
  }

  /** A copy for drawing (`World.clusterLayout()`): the clusters, with their patches. */
  toSnapshot(margin: number): ClusterLayoutSnapshot {
    const b = this.layout.bounds(margin)
    return {
      radius: this.layout.radius,
      bounds: { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY },
      clusters: this.layout.centres.map((centre, cluster) => ({
        x: centre.x,
        y: centre.y,
        patches: this.patches
          .filter((patch) => patch.cluster === cluster)
          .map((patch) => ({ x: patch.x, y: patch.y, type: patch.type }))
      }))
    }
  }
}
