import type { EntityId, Vec2 } from '@evo/contracts'

interface HasId {
  readonly id: EntityId
}

/** One query hit: the matching item and its squared distance from the query center. */
export interface SpatialHit<T> {
  readonly item: T
  readonly distanceSquared: number
}

/** Cells are addressed by integer coordinates in [-CELL_LIMIT, CELL_LIMIT), 2^25 each way. */
const CELL_LIMIT = 33_554_432

/** One number per cell, unique over the allowed range (below 2^52, so exact in a double). */
function cellKey(cx: number, cy: number): number {
  return (cx + CELL_LIMIT) * 67_108_864 + (cy + CELL_LIMIT)
}

/**
 * A uniform-grid spatial index. Buckets are keyed by cell coordinate (one number per cell) in an internal `Map`, but
 * that map's own iteration order is never exposed: every query result is explicitly sorted by
 * `(distanceSquared, id)` before being returned, so results are deterministic regardless of
 * bucket insertion order (docs/simulation/determinism.md, section 5).
 */
export class SpatialHash<T extends HasId> {
  private readonly cellSize: number
  private readonly getPosition: (item: T) => Readonly<Vec2>
  private readonly buckets = new Map<number, T[]>()
  /** Bucket arrays emptied by the last `rebuild`, reused so a tick does not allocate them again. */
  private pool: T[][] = []

  constructor(cellSize: number, getPosition: (item: T) => Readonly<Vec2>) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      throw new RangeError('cellSize must be a finite number greater than zero')
    }
    this.cellSize = cellSize
    this.getPosition = getPosition
  }

  /** Clears and reinserts every item. Call once per tick after entities have moved or changed. */
  rebuild(items: readonly T[]): void {
    const buckets = this.buckets
    for (const bucket of buckets.values()) {
      bucket.length = 0
      this.pool.push(bucket)
    }
    buckets.clear()
    for (const item of items) {
      const position = this.getPosition(item)
      const cx = Math.floor(position.x / this.cellSize)
      const cy = Math.floor(position.y / this.cellSize)
      if (!(cx >= -CELL_LIMIT && cx < CELL_LIMIT && cy >= -CELL_LIMIT && cy < CELL_LIMIT)) {
        throw new RangeError('item is too far from the origin for this spatial index')
      }
      const key = cellKey(cx, cy)
      const bucket = buckets.get(key)
      if (bucket) {
        bucket.push(item)
      } else {
        const fresh = this.pool.pop() ?? []
        fresh.push(item)
        buckets.set(key, fresh)
      }
    }
  }

  /**
   * Calls `visit` for every item within `radius` (inclusive) of `center`, in no particular order and
   * without allocating. For a caller that picks one item by a total order of its own (distance, then
   * id), which is what the sorted `queryRadius` result would have been scanned for anyway.
   */
  scan(
    center: Readonly<Vec2>,
    radius: number,
    visit: (item: T, distanceSquared: number) => void
  ): void {
    if (!Number.isFinite(radius) || radius < 0) {
      throw new RangeError('radius must be a finite number greater than or equal to zero')
    }
    const radiusSquared = radius * radius
    const minCx = Math.max(-CELL_LIMIT, Math.floor((center.x - radius) / this.cellSize))
    const maxCx = Math.min(CELL_LIMIT - 1, Math.floor((center.x + radius) / this.cellSize))
    const minCy = Math.max(-CELL_LIMIT, Math.floor((center.y - radius) / this.cellSize))
    const maxCy = Math.min(CELL_LIMIT - 1, Math.floor((center.y + radius) / this.cellSize))

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = this.buckets.get(cellKey(cx, cy))
        if (!bucket) continue
        for (const item of bucket) {
          const position = this.getPosition(item)
          const dx = position.x - center.x
          const dy = position.y - center.y
          const distanceSquared = dx * dx + dy * dy
          if (distanceSquared <= radiusSquared) visit(item, distanceSquared)
        }
      }
    }
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
    const minCx = Math.max(-CELL_LIMIT, Math.floor((center.x - radius) / this.cellSize))
    const maxCx = Math.min(CELL_LIMIT - 1, Math.floor((center.x + radius) / this.cellSize))
    const minCy = Math.max(-CELL_LIMIT, Math.floor((center.y - radius) / this.cellSize))
    const maxCy = Math.min(CELL_LIMIT - 1, Math.floor((center.y + radius) / this.cellSize))

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = this.buckets.get(cellKey(cx, cy))
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

  /**
   * The first item `accept` takes in `queryRadius` order, that is the accepted item nearest to
   * `center` (ties to the lower id), or `null`; without sorting or allocating the hits. `accept`
   * must be a pure function of the item and its squared distance: it is called in no particular
   * order, once per item in range, so a call with an effect would be observable.
   */
  nearestWhere(
    center: Readonly<Vec2>,
    radius: number,
    accept: (item: T, distanceSquared: number) => boolean
  ): SpatialHit<T> | null {
    if (!Number.isFinite(radius) || radius < 0) {
      throw new RangeError('radius must be a finite number greater than or equal to zero')
    }
    const radiusSquared = radius * radius
    const minCx = Math.max(-CELL_LIMIT, Math.floor((center.x - radius) / this.cellSize))
    const maxCx = Math.min(CELL_LIMIT - 1, Math.floor((center.x + radius) / this.cellSize))
    const minCy = Math.max(-CELL_LIMIT, Math.floor((center.y - radius) / this.cellSize))
    const maxCy = Math.min(CELL_LIMIT - 1, Math.floor((center.y + radius) / this.cellSize))
    let best: T | null = null
    let bestDistanceSquared = 0
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = this.buckets.get(cellKey(cx, cy))
        if (!bucket) continue
        for (const item of bucket) {
          const position = this.getPosition(item)
          const dx = position.x - center.x
          const dy = position.y - center.y
          const distanceSquared = dx * dx + dy * dy
          if (distanceSquared > radiusSquared) continue
          if (
            best !== null &&
            (distanceSquared > bestDistanceSquared ||
              (distanceSquared === bestDistanceSquared && item.id > best.id))
          ) {
            continue
          }
          if (!accept(item, distanceSquared)) continue
          best = item
          bestDistanceSquared = distanceSquared
        }
      }
    }
    return best === null ? null : { item: best, distanceSquared: bestDistanceSquared }
  }

  /**
   * Whether `test` holds for any item within `radius` (inclusive) of `center`: the same answer as
   * `queryRadius(...).some(...)`, without sorting or allocating, stopping at the first yes. `test`
   * must be a pure function of the item and its squared distance (it is called in no particular order).
   */
  some(
    center: Readonly<Vec2>,
    radius: number,
    test: (item: T, distanceSquared: number) => boolean
  ): boolean {
    if (!Number.isFinite(radius) || radius < 0) {
      throw new RangeError('radius must be a finite number greater than or equal to zero')
    }
    const radiusSquared = radius * radius
    const minCx = Math.max(-CELL_LIMIT, Math.floor((center.x - radius) / this.cellSize))
    const maxCx = Math.min(CELL_LIMIT - 1, Math.floor((center.x + radius) / this.cellSize))
    const minCy = Math.max(-CELL_LIMIT, Math.floor((center.y - radius) / this.cellSize))
    const maxCy = Math.min(CELL_LIMIT - 1, Math.floor((center.y + radius) / this.cellSize))
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = this.buckets.get(cellKey(cx, cy))
        if (!bucket) continue
        for (const item of bucket) {
          const position = this.getPosition(item)
          const dx = position.x - center.x
          const dy = position.y - center.y
          const distanceSquared = dx * dx + dy * dy
          if (distanceSquared <= radiusSquared && test(item, distanceSquared)) return true
        }
      }
    }
    return false
  }

  /**
   * The single nearest item within `radius`, or `null` if none; ties go to the lower id, exactly
   * as the first element of `queryRadius`. Skips the item with id `excludeId`, if given. Scans
   * for the minimum instead of sorting every hit, since this runs once per organism per tick.
   */
  nearest(center: Readonly<Vec2>, radius: number, excludeId?: number): SpatialHit<T> | null {
    if (!Number.isFinite(radius) || radius < 0) {
      throw new RangeError('radius must be a finite number greater than or equal to zero')
    }
    const radiusSquared = radius * radius
    const minCx = Math.max(-CELL_LIMIT, Math.floor((center.x - radius) / this.cellSize))
    const maxCx = Math.min(CELL_LIMIT - 1, Math.floor((center.x + radius) / this.cellSize))
    const minCy = Math.max(-CELL_LIMIT, Math.floor((center.y - radius) / this.cellSize))
    const maxCy = Math.min(CELL_LIMIT - 1, Math.floor((center.y + radius) / this.cellSize))
    let best: T | null = null
    let bestDistanceSquared = 0
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = this.buckets.get(cellKey(cx, cy))
        if (!bucket) continue
        for (const item of bucket) {
          if (item.id === excludeId) continue
          const position = this.getPosition(item)
          const dx = position.x - center.x
          const dy = position.y - center.y
          const distanceSquared = dx * dx + dy * dy
          if (distanceSquared > radiusSquared) continue
          if (
            best === null ||
            distanceSquared < bestDistanceSquared ||
            (distanceSquared === bestDistanceSquared && item.id < best.id)
          ) {
            best = item
            bestDistanceSquared = distanceSquared
          }
        }
      }
    }
    return best === null ? null : { item: best, distanceSquared: bestDistanceSquared }
  }
}
