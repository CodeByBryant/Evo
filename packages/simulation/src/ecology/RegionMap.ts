import { REGION_TYPES } from '@evo/contracts'
import type { RegionType, RegionsConfig, TerrainSnapshot } from '@evo/contracts'
import type { RandomSource } from '../random/RandomSource'

export interface RegionPoint {
  readonly x: number
  readonly y: number
  readonly type: RegionType
}

/**
 * The static terrain: a Voronoi diagram over `seedCount` random points, each with a random region
 * type, baked into a `gridSize x gridSize` lookup so a position maps to a region in O(1)
 * (docs/ecology/ecology.md). Built once from the `terrain` stream at world creation and never
 * changed, so it is not part of the state hash. A cell belongs to the nearest point to its centre
 * (ties go to the lower point index).
 */
export class RegionMap {
  private readonly cells: Uint16Array

  private constructor(
    readonly points: readonly RegionPoint[],
    readonly gridSize: number,
    readonly width: number,
    readonly height: number
  ) {
    this.cells = new Uint16Array(gridSize * gridSize)
    for (let row = 0; row < gridSize; row++) {
      for (let column = 0; column < gridSize; column++) {
        const cx = ((column + 0.5) * width) / gridSize
        const cy = ((row + 0.5) * height) / gridSize
        let best = 0
        let bestDistance = Infinity
        for (let i = 0; i < points.length; i++) {
          const point = points[i] as RegionPoint
          const dx = point.x - cx
          const dy = point.y - cy
          const distance = dx * dx + dy * dy
          if (distance < bestDistance) {
            bestDistance = distance
            best = i
          }
        }
        this.cells[row * gridSize + column] = best
      }
    }
  }

  /** Draws 3 values per point (`x`, `y`, type) from `random`, in point order. */
  static generate(
    config: Pick<RegionsConfig, 'seedCount' | 'gridSize'>,
    width: number,
    height: number,
    random: RandomSource
  ): RegionMap {
    if (config.seedCount > 65_535) throw new RangeError('regions.seedCount must be at most 65535')
    const points: RegionPoint[] = []
    for (let i = 0; i < config.seedCount; i++) {
      const x = random.float() * width
      const y = random.float() * height
      const type = REGION_TYPES[Math.floor(random.float() * REGION_TYPES.length)] as RegionType
      points.push({ x, y, type })
    }
    return new RegionMap(points, config.gridSize, width, height)
  }

  /** The index of the region (Voronoi point) containing a position; positions outside clamp to the edge. */
  indexAt(x: number, y: number): number {
    const g = this.gridSize
    const column = Math.min(g - 1, Math.max(0, Math.floor((x / this.width) * g)))
    const row = Math.min(g - 1, Math.max(0, Math.floor((y / this.height) * g)))
    return this.cells[row * g + column] as number
  }

  typeOf(regionIndex: number): RegionType {
    return (this.points[regionIndex] as RegionPoint).type
  }

  typeAt(x: number, y: number): RegionType {
    return this.typeOf(this.indexAt(x, y))
  }

  /** A copy of the map for drawing (`World.terrain()`): the cell lookup and the regions. */
  toSnapshot(): TerrainSnapshot {
    return {
      width: this.width,
      height: this.height,
      gridSize: this.gridSize,
      cells: Array.from(this.cells),
      regions: this.points.map((point) => ({ x: point.x, y: point.y, type: point.type }))
    }
  }

  /** How many of the grid's cells are of each type, in `REGION_TYPES` order (for tests and reports). */
  cellCountsByType(): number[] {
    const counts = REGION_TYPES.map(() => 0)
    for (const index of this.cells) {
      const type = REGION_TYPES.indexOf(this.typeOf(index))
      counts[type] = (counts[type] as number) + 1
    }
    return counts
  }
}
