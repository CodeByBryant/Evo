import type { WorldConfig } from '@evo/contracts'
import type { IdGenerator } from '../entities/IdGenerator'
import type { OrganismState } from '../entities/OrganismStore'
import type { ResourceStore } from '../entities/ResourceStore'
import type { EventLog } from '../events/EventLog'

/**
 * What a dead creature leaves for scavengers (ADR 0023): one `carrion` food item where it died,
 * worth `energyFraction` of its energy and what was in its gut, if that is at least `minEnergy`, and
 * if fewer than `maxCount` carcasses are on the field. Carcasses rot away after `lifespan` seconds.
 * No random draws; ids come from the shared allocator in the order deaths are handled, so a run is
 * the same however it is sliced.
 */
export class Carcasses {
  private readonly lifeTicks: number
  /** Carcasses on the field, counted by `update` and added to by `drop`. */
  private count = 0

  constructor(
    private readonly config: WorldConfig,
    private readonly resources: ResourceStore,
    private readonly ids: IdGenerator,
    private readonly events: EventLog,
    /** The index of the `carrion` kind in the resource kinds. */
    private readonly kind: number
  ) {
    const { lifespan } = config.predation.carcass
    this.lifeTicks = lifespan > 0 ? Math.ceil(lifespan / config.timestep) : 0
  }

  /** Leaves a carcass for `organism`, which has just died. */
  drop(organism: OrganismState, tick: number): void {
    const settings = this.config.predation.carcass
    if (this.count >= settings.maxCount) return
    const remaining = settings.energyFraction * (Math.max(0, organism.energy) + organism.gut)
    if (!(remaining >= settings.minEnergy) || remaining <= 0) return
    const id = this.ids.allocate()
    this.resources.add({
      id,
      x: organism.x,
      y: organism.y,
      remaining,
      kind: this.kind,
      bornTick: tick
    })
    this.count += 1
    this.events.record({
      type: 'resource-spawned',
      tick,
      resourceId: id,
      kind: this.kind,
      position: { x: organism.x, y: organism.y }
    })
  }

  /** Counts the carcasses and removes those that have rotted. Call once a tick. */
  update(tick: number): void {
    let count = 0
    for (const resource of this.resources.values()) {
      if (resource.kind !== this.kind) continue
      if (this.lifeTicks > 0 && tick - (resource.bornTick ?? tick) >= this.lifeTicks) {
        this.resources.remove(resource.id)
        continue
      }
      count += 1
    }
    this.count = count
  }
}
