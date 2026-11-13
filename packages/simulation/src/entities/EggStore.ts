import type { EntityId, Genome } from '@evo/contracts'

/** An egg lying in the world (ADR 0027): a child that has not hatched yet. */
export interface EggState {
  readonly id: EntityId
  readonly x: number
  readonly y: number
  /** The child's genome, recombined at conception. */
  readonly genome: Genome
  readonly motherId: EntityId
  readonly fatherId: EntityId
  /** The mother's species at conception (she may be dead when it hatches). */
  readonly speciesId: number | null
  /** Energy stored in the egg; the newborn starts with it. */
  readonly energy: number
  readonly layTick: number
  readonly hatchTick: number
}

/**
 * Holds the eggs. Same ascending-id-order contract as `OrganismStore`: ids come from the shared
 * `IdGenerator` in laying order, so a `Map`'s insertion order is ascending id order.
 */
export class EggStore {
  private readonly byId = new Map<EntityId, EggState>()
  private maxId: EntityId | null = null

  add(egg: EggState): void {
    if (this.byId.has(egg.id)) throw new RangeError(`egg id ${egg.id} already exists`)
    if (this.maxId !== null && egg.id <= this.maxId) {
      throw new RangeError(
        `egg id ${egg.id} is not greater than the highest id added so far (${this.maxId})`
      )
    }
    this.maxId = egg.id
    this.byId.set(egg.id, egg)
  }

  get(id: EntityId): EggState | undefined {
    return this.byId.get(id)
  }

  remove(id: EntityId): boolean {
    return this.byId.delete(id)
  }

  get size(): number {
    return this.byId.size
  }

  /** A fresh array of the eggs in ascending id order. */
  values(): EggState[] {
    return Array.from(this.byId.values())
  }
}
