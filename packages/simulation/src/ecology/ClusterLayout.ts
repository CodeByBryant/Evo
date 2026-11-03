import type { ClusterConfig } from '@evo/contracts'
import { cos, sin } from '../math/trig'

const TWO_PI = Math.PI * 2

export interface Point {
  readonly x: number
  readonly y: number
}

/**
 * Where the clusters are (docs/decisions/0014): a regular polygon around the origin, as in the
 * prototype, so neighbouring centres are `spacing` apart and the void between two circles is
 * `spacing - 2 * radius` wide. Pure geometry: no randomness and no state, and it uses the
 * engine's own `cos` and `sin`, so every platform agrees on every centre.
 */
export class ClusterLayout {
  readonly centres: readonly Point[]
  readonly radius: number
  private readonly radiusSquared: number

  constructor(config: Pick<ClusterConfig, 'count' | 'radius' | 'spacing'>) {
    this.radius = config.radius
    this.radiusSquared = config.radius * config.radius
    const centres: Point[] = []
    if (config.count === 1) {
      centres.push({ x: 0, y: 0 })
    } else {
      const polygonRadius = config.spacing / (2 * sin(Math.PI / config.count))
      for (let i = 0; i < config.count; i++) {
        const angle = (TWO_PI * i) / config.count
        centres.push({ x: polygonRadius * cos(angle), y: polygonRadius * sin(angle) })
      }
    }
    this.centres = centres
  }

  get count(): number {
    return this.centres.length
  }

  /** The combined area of every cluster. */
  get totalArea(): number {
    return this.centres.length * Math.PI * this.radiusSquared
  }

  /** The cluster whose circle contains the position, or `-1` for the void. */
  clusterAt(x: number, y: number): number {
    for (let i = 0; i < this.centres.length; i++) {
      const centre = this.centres[i] as Point
      const dx = x - centre.x
      const dy = y - centre.y
      if (dx * dx + dy * dy <= this.radiusSquared) return i
    }
    return -1
  }

  /** The cluster whose centre is nearest (ties go to the lower index); never `-1`. */
  nearestCluster(x: number, y: number): number {
    let best = 0
    let bestDistance = Infinity
    for (let i = 0; i < this.centres.length; i++) {
      const centre = this.centres[i] as Point
      const dx = x - centre.x
      const dy = y - centre.y
      const distance = dx * dx + dy * dy
      if (distance < bestDistance) {
        bestDistance = distance
        best = i
      }
    }
    return best
  }

  /**
   * A point uniformly distributed in a cluster's disc from two uniform values in `[0, 1)`, or in
   * its inner `reach` fraction (founders start in the core, away from the void).
   */
  pointIn(cluster: number, u: number, v: number, reach = 1): Point {
    const centre = this.centres[cluster] as Point
    const distance = this.radius * reach * Math.sqrt(u)
    const angle = TWO_PI * v
    return { x: centre.x + distance * cos(angle), y: centre.y + distance * sin(angle) }
  }

  /** The smallest rectangle holding every cluster, grown by `margin` on each side. */
  bounds(margin = 0): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const centre of this.centres) {
      minX = Math.min(minX, centre.x - this.radius)
      minY = Math.min(minY, centre.y - this.radius)
      maxX = Math.max(maxX, centre.x + this.radius)
      maxY = Math.max(maxY, centre.y + this.radius)
    }
    return { minX: minX - margin, minY: minY - margin, maxX: maxX + margin, maxY: maxY + margin }
  }
}
