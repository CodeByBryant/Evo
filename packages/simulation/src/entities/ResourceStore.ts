import type { EntityId } from '@evo/contracts'

/** Live, mutable resource state. Phase 2 resources are consumed whole, in a single bite. */
export interface ResourceState {
  readonly id: EntityId
  x: number
  y: number
  /** Energy remaining in the resource; starts at `config.resources.energyValue`. */
  remaining: number
}

/** Holds the active resources. Same ascending-id-order contract as `OrganismStore`. */
export class ResourceStore {
  private readonly byId = new Map<EntityId, ResourceState>()
  private maxId: EntityId | null = null

  add(resource: ResourceState): void {
    if (this.byId.has(resource.id)) {
      throw new RangeError(`resource id ${resource.id} already exists`)
    }
    if (this.maxId !== null && resource.id <= this.maxId) {
      throw new RangeError(
        `resource id ${resource.id} is not greater than the highest id added so far (${this.maxId})`
      )
    }
    this.maxId = resource.id
    this.byId.set(resource.id, resource)
  }

  get(id: EntityId): ResourceState | undefined {
    return this.byId.get(id)
  }

  has(id: EntityId): boolean {
    return this.byId.has(id)
  }

  remove(id: EntityId): boolean {
    return this.byId.delete(id)
  }

  get size(): number {
    return this.byId.size
  }

  /** A fresh array snapshot in ascending id order; see `OrganismStore.values()`. */
  values(): ResourceState[] {
    return Array.from(this.byId.values())
  }
}
