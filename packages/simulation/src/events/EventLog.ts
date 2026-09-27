import type { WorldEvent } from '@evo/contracts'

/**
 * The bounded, in-memory event log.
 *
 * `record()` always counts every event (via `emittedCount`), so `emittedCount` reflects the
 * simulation's actual event production regardless of how much history is retained; retention
 * beyond `capacity` is a storage decision, not a simulation-identity one
 * (docs/simulation/determinism.md, section 8). Whether a *verbose*-tier event is recorded at all
 * is decided by the caller (systems check `config.history.eventDetail`); `EventLog` itself does
 * not filter by event type.
 *
 * Retained events are kept in a fixed-capacity ring buffer so a long run never pays an O(n) cost
 * per eviction. `capacity: 0` retains nothing.
 */
export class EventLog {
  private readonly capacity: number
  private readonly ring: (WorldEvent | undefined)[]
  private head = 0
  private size = 0
  private tickBuffer: WorldEvent[] = []

  private totalEmitted = 0
  private totalDropped = 0

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 0) {
      throw new RangeError('capacity must be a nonnegative integer')
    }
    this.capacity = capacity
    this.ring = new Array(capacity)
  }

  /** Call once at the start of each tick, before any system records events for it. */
  beginTick(): void {
    this.tickBuffer = []
  }

  /** Records one event: counts it, appends it to the current tick's list, and retains it. */
  record(event: WorldEvent): void {
    this.totalEmitted += 1
    this.tickBuffer.push(event)
    if (this.capacity === 0) {
      this.totalDropped += 1
      return
    }
    if (this.size < this.capacity) {
      this.ring[(this.head + this.size) % this.capacity] = event
      this.size += 1
    } else {
      this.ring[this.head] = event
      this.head = (this.head + 1) % this.capacity
      this.totalDropped += 1
    }
  }

  /** Events recorded since the last `beginTick()`, in emission order. */
  eventsThisTick(): readonly WorldEvent[] {
    return this.tickBuffer
  }

  /** Every event this log has emitted, hashed as part of simulation state. */
  get emittedCount(): number {
    return this.totalEmitted
  }

  /** Events emitted but evicted from the bounded retention window. */
  get droppedCount(): number {
    return this.totalDropped
  }

  /** Retained events, oldest first. */
  list(): WorldEvent[] {
    const result: WorldEvent[] = []
    for (let i = 0; i < this.size; i++) {
      result.push(this.ring[(this.head + i) % this.capacity] as WorldEvent)
    }
    return result
  }
}
