import type { EntityId } from '@evo/contracts'

/** The slot of a plant's hub (ADR 0021). */
export const HUB_SLOT = 0
/** The slot of food that belongs to no plant. */
export const FREE_SLOT = 255
/** Most nodes a hub can have: a node's slot is `1` to this. */
export const MAX_NODES = 6

/** Whether a resource is a plant's node (its `parent` is then the hub's id; ids start at 0, so only a node's slot says it has one). */
export function isNode(resource: { readonly slot?: number }): boolean {
  return resource.slot !== undefined && resource.slot >= 1 && resource.slot <= MAX_NODES
}

/**
 * Live, mutable resource state. A resource without the plant fields is free food; a plant is a hub
 * (`slot` 0) and up to `MAX_NODES` nodes (`slot` 1 to 6) whose `parent` is the hub's id.
 */
export interface ResourceState {
  readonly id: EntityId
  x: number
  y: number
  /** Energy remaining in the resource; starts at `config.resources.energyValue`. */
  remaining: number
  /** Index into the resource kinds (0 when kinds are off). */
  readonly kind: number
  /** The hub id a node hangs from; only meaningful for a node (`isNode`), `0` for hubs and free food. */
  parent?: number
  /** `HUB_SLOT`, `1` to `MAX_NODES`, or `FREE_SLOT`; absent means free food. */
  slot?: number
  /** The tick a hub was spawned (its age); absent means `0`. */
  bornTick?: number
  /** On a hub, the energy already moved into the node that is growing back. */
  sproutProgress?: number
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

  /**
   * Removes a resource. Removing a hub (it was eaten) lets its remaining nodes go: they become free
   * food, so a plant's nodes never point at a hub that is gone.
   */
  remove(id: EntityId): boolean {
    const resource = this.byId.get(id)
    const removed = this.byId.delete(id)
    if (removed && resource !== undefined && resource.slot === HUB_SLOT) this.release(id)
    return removed
  }

  private release(hubId: EntityId): void {
    for (const resource of this.byId.values()) {
      if (isNode(resource) && resource.parent === hubId) {
        resource.parent = 0
        resource.slot = FREE_SLOT
      }
    }
  }

  /** Visits every resource in ascending id order without copying. Do not add while visiting. */
  forEach(visit: (resource: ResourceState) => void): void {
    for (const resource of this.byId.values()) visit(resource)
  }

  get size(): number {
    return this.byId.size
  }

  /** A fresh array snapshot in ascending id order; see `OrganismStore.values()`. */
  values(): ResourceState[] {
    return Array.from(this.byId.values())
  }
}
