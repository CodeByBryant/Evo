import type { EntityId, RenderOrganism } from '@evo/contracts'
import type { Point } from './camera'

/**
 * Recent positions per organism, for the trails layer. A fixed-size ring per organism, dropped as
 * soon as the organism is no longer in the snapshot, so memory is bounded by
 * `capacity * living organisms` however long the run is.
 */
export class TrailBuffer {
  private readonly trails = new Map<EntityId, { points: Point[]; next: number; length: number }>()

  constructor(
    readonly capacity = 40,
    /** A point closer than this to the previous one is not recorded (keeps still organisms from filling it). */
    private readonly minStep = 0.5
  ) {}

  record(organisms: readonly RenderOrganism[]): void {
    const alive = new Set<EntityId>()
    for (const organism of organisms) {
      alive.add(organism.id)
      let trail = this.trails.get(organism.id)
      if (trail === undefined) {
        trail = { points: new Array<Point>(this.capacity), next: 0, length: 0 }
        this.trails.set(organism.id, trail)
      }
      if (trail.length > 0) {
        const last = trail.points[(trail.next - 1 + this.capacity) % this.capacity] as Point
        const dx = organism.x - last.x
        const dy = organism.y - last.y
        if (dx * dx + dy * dy < this.minStep * this.minStep) continue
      }
      trail.points[trail.next] = { x: organism.x, y: organism.y }
      trail.next = (trail.next + 1) % this.capacity
      trail.length = Math.min(trail.length + 1, this.capacity)
    }
    for (const id of [...this.trails.keys()]) if (!alive.has(id)) this.trails.delete(id)
  }

  /** The recorded points for an organism, oldest first. */
  pointsOf(id: EntityId): Point[] {
    const trail = this.trails.get(id)
    if (trail === undefined) return []
    const out: Point[] = []
    const start = trail.length < this.capacity ? 0 : trail.next
    for (let i = 0; i < trail.length; i++) {
      out.push(trail.points[(start + i) % this.capacity] as Point)
    }
    return out
  }

  get size(): number {
    return this.trails.size
  }

  clear(): void {
    this.trails.clear()
  }
}
