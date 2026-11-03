import type { RegionType } from '@evo/contracts'

/**
 * What the ecology asks of the ground under an organism. The field's `RegionMap` and the cluster
 * layout's `ClusterTerrain` both answer it; `-1` and `null` mean void (no ground at all), which
 * only the cluster layout has.
 */
export interface Terrain {
  /** The region instance at a position, or `-1` for void. */
  indexAt(x: number, y: number): number
  typeOf(regionIndex: number): RegionType
  /** The region type at a position, or `null` for void. */
  typeAt(x: number, y: number): RegionType | null
}
