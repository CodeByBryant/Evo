import type { EntityId } from '@evo/contracts'

/** Live, mutable organism state. Systems mutate these fields directly through `values()`. */
export interface OrganismState {
  readonly id: EntityId
  x: number
  y: number
  vx: number
  vy: number
  heading: number
  age: number
  energy: number
  readonly parentIds: readonly EntityId[]
  readonly birthTick: number
  reproductionCooldownRemaining: number
  lastTurnMagnitude: number
}

/**
 * Holds the active organisms. `add()` requires ids in strictly increasing order (which the shared
 * `IdGenerator` naturally produces), so a plain `Map`'s insertion order is always ascending id
 * order; `values()` relies on this rather than re-sorting on every call. Requiring it here, rather
 * than only checking it later in `validate()`, turns a misuse into an immediate error.
 */
export class OrganismStore {
  private readonly byId = new Map<EntityId, OrganismState>()
  private maxId: EntityId | null = null

  add(organism: OrganismState): void {
    if (this.byId.has(organism.id)) {
      throw new RangeError(`organism id ${organism.id} already exists`)
    }
    if (this.maxId !== null && organism.id <= this.maxId) {
      throw new RangeError(
        `organism id ${organism.id} is not greater than the highest id added so far (${this.maxId})`
      )
    }
    this.maxId = organism.id
    this.byId.set(organism.id, organism)
  }

  get(id: EntityId): OrganismState | undefined {
    return this.byId.get(id)
  }

  has(id: EntityId): boolean {
    return this.byId.has(id)
  }

  /** Removes the organism; returns whether it was present. */
  remove(id: EntityId): boolean {
    return this.byId.delete(id)
  }

  get size(): number {
    return this.byId.size
  }

  /**
   * A fresh array snapshot of the live organisms in ascending id order. The array is new each
   * call; the `OrganismState` objects inside it are the same live, mutable references held by
   * the store, so systems may write through them.
   */
  values(): OrganismState[] {
    return Array.from(this.byId.values())
  }
}
