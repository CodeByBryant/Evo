import type { EntityId } from '@evo/contracts'

const MAX_ENTITY_ID = 0xffffffff

/**
 * The single monotonic id counter shared by every entity kind in a world (organisms and
 * resources alike). Ids are never reused, so ascending id order is always creation order
 * (docs/simulation/determinism.md, section 5), and the counter itself is part of the state hash.
 */
export class IdGenerator {
  private next: EntityId = 0

  /** Allocates and returns the next id. */
  allocate(): EntityId {
    if (this.next > MAX_ENTITY_ID) {
      throw new RangeError('entity id counter exhausted (exceeded uint32 range)')
    }
    const id = this.next
    this.next += 1
    return id
  }

  /** The id that will be returned by the next `allocate()` call. Hashed as `nextEntityId`. */
  get nextId(): EntityId {
    return this.next
  }
}
