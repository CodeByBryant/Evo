import type { HistoricalOrganismRecord } from '@evo/contracts'

/**
 * A fixed-capacity ring buffer of historical organism records, structurally identical to
 * `EventLog`'s retention window (same capacity/eviction/`list()` shape), sized by
 * `HistoryConfig.maxHistoricalOrganisms`. Unlike `EventLog`, there is no per-tick view: history is
 * queried occasionally (docs/decisions/0005), not every tick.
 */
export class HistoryStore {
  private readonly capacity: number
  private readonly ring: (HistoricalOrganismRecord | undefined)[]
  private head = 0
  private size = 0

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 0) {
      throw new RangeError('capacity must be a nonnegative integer')
    }
    this.capacity = capacity
    this.ring = new Array(capacity)
  }

  /** Appends one record, evicting the oldest if the store is at capacity. */
  append(record: HistoricalOrganismRecord): void {
    if (this.capacity === 0) return
    if (this.size < this.capacity) {
      this.ring[(this.head + this.size) % this.capacity] = record
      this.size += 1
    } else {
      this.ring[this.head] = record
      this.head = (this.head + 1) % this.capacity
    }
  }

  /** Retained records, oldest first. */
  list(): HistoricalOrganismRecord[] {
    const result: HistoricalOrganismRecord[] = []
    for (let i = 0; i < this.size; i++) {
      result.push(this.ring[(this.head + i) % this.capacity] as HistoricalOrganismRecord)
    }
    return result
  }
}
