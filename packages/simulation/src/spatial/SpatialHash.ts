import type { EntityId, Vec2 } from '@evo/contracts'

interface HasId {
  readonly id: EntityId
}

/** One query hit: the matching item and its squared distance from the query center. */
export interface SpatialHit<T> {
  readonly item: T
  readonly distanceSquared: number
}

/**
 * A uniform-grid spatial index. Buckets are keyed by cell coordinate in an internal `Map`, but
 * that map's own iteration order is never exposed: every query result is explicitly sorted by
 * `(distanceSquared, id)` before being returned, so results are deterministic regardless of
 * bucket insertion order (docs/simulation/determinism.md, section 5).
 */
export class SpatialHash<T extends HasId> {
  private readonly cellSize: number
  private readonly getPosition: (item: T) => Readonly<Vec2>
  private buckets = new Map<string, T[]>()

  constructor(cellSize: number, getPosition: (item: T) => Readonly<Vec2>) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      throw new RangeError('cellSize must be a finite number greater than zero')
    }
    this.cellSize = cellSize
    this.getPosition = getPosition
  }

  private cellKey(x: number, y: number): string {
    const cx = Math.floor(x / this.cellSize)
    const cy = Math.floor(y / this.cellSize)
    return `${cx}:${cy}`
  }

  /** Clears and reinserts every item. Call once per tick after entities have moved or changed. */
  rebuild(items: readonly T[]): void {
    const buckets = new Map<string, T[]>()
    for (const item of items) {
      const position = this.getPosition(item)
      const key = this.cellKey(position.x, position.y)
      const bucket = buckets.get(key)
      if (bucket) {
        bucket.push(item)
      } else {
        buckets.set(key, [item])
      }
    }
    this.buckets = buckets
  }

  /**
   * Items within `radius` (inclusive) of `center`, sorted by ascending `(distanceSquared, id)`.
   */
  queryRadius(center: Readonly<Vec2>, radius: number): SpatialHit<T>[] {
    if (!Number.isFinite(radius) || radius < 0) {
      throw new RangeError('radius must be a finite number greater than or equal to zero')
    }
    const hits: SpatialHit<T>[] = []
    const radiusSquared = radius * radius
    const minCx = Math.floor((center.x - radius) / this.cellSize)
    const maxCx = Math.floor((center.x + radius) / this.cellSize)
    const minCy = Math.floor((center.y - radius) / this.cellSize)
    const maxCy = Math.floor((center.y + radius) / this.cellSize)

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = this.buckets.get(`${cx}:${cy}`)
        if (!bucket) continue
        for (const item of bucket) {
          const position = this.getPosition(item)
          const dx = position.x - center.x
          const dy = position.y - center.y
          const distanceSquared = dx * dx + dy * dy
          if (distanceSquared <= radiusSquared) hits.push({ item, distanceSquared })
        }
      }
    }

    hits.sort((a, b) => a.distanceSquared - b.distanceSquared || a.item.id - b.item.id)
    return hits
  }

  /** The single nearest item within `radius`, or `null` if none. Convenience over `queryRadius`. */
  nearest(center: Readonly<Vec2>, radius: number): SpatialHit<T> | null {
    const hits = this.queryRadius(center, radius)
    return hits.length > 0 ? (hits[0] as SpatialHit<T>) : null
  }
}
