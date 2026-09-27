import type { EntityId, WorldConfig } from '@evo/contracts'
import type { OrganismStore } from '../entities/OrganismStore'
import type { ResourceState, ResourceStore } from '../entities/ResourceStore'
import type { EventLog } from '../events/EventLog'
import type { SpatialHash } from '../spatial/SpatialHash'

/**
 * Feeds organisms: each organism eats the nearest not-yet-consumed resource within its capture
 * radius. A resource is never consumed twice in the same tick. Energy gain is capped at
 * `maxEnergy`; the remainder is reported as wasted, never silently dropped.
 */
export class InteractionSystem {
  private readonly emitVerbose: boolean
  private readonly captureRadius: number

  constructor(
    private readonly config: WorldConfig,
    private readonly organisms: OrganismStore,
    private readonly resources: ResourceStore,
    private readonly resourceIndex: SpatialHash<ResourceState>,
    private readonly events: EventLog
  ) {
    this.emitVerbose = config.history.eventDetail === 'verbose'
    this.captureRadius = config.organisms.radius + config.resources.radius
  }

  update(tick: number): void {
    const consumed = new Set<EntityId>()

    for (const organism of this.organisms.values()) {
      const hits = this.resourceIndex.queryRadius(
        { x: organism.x, y: organism.y },
        this.captureRadius
      )
      const hit = hits.find((candidate) => !consumed.has(candidate.item.id))
      if (!hit) continue

      const resource = hit.item
      consumed.add(resource.id)
      this.resources.remove(resource.id)

      const amount = resource.remaining
      const capacity = Math.max(0, this.config.organisms.maxEnergy - organism.energy)
      const energyGained = Math.min(amount, capacity)
      const energyWasted = amount - energyGained
      const previous = organism.energy
      organism.energy = previous + energyGained

      this.events.record({
        type: 'resource-consumed',
        tick,
        organismId: organism.id,
        resourceId: resource.id,
        amount,
        energyGained,
        energyWasted,
        position: { x: organism.x, y: organism.y }
      })

      if (this.emitVerbose) {
        this.events.record({
          type: 'energy-changed',
          tick,
          organismId: organism.id,
          previous,
          current: organism.energy,
          reason: 'consumption'
        })
      }
    }
  }
}
