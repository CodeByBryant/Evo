import type { EntityId, WorldConfig } from '@evo/contracts'
import type { OrganismStore } from '../entities/OrganismStore'
import type { ResourceState, ResourceStore } from '../entities/ResourceStore'
import type { EventLog } from '../events/EventLog'
import { lifeStageFor } from '../organisms/lifeStage'
import type { SpatialHash } from '../spatial/SpatialHash'

/**
 * Feeds organisms: each organism eats the nearest not-yet-consumed resource within its capture
 * radius (juveniles have a smaller radius and a smaller effective `maxEnergy`, both scaled by
 * `juvenileSizeScale`). A resource is never consumed twice in the same tick. Energy gain is capped
 * at the organism's effective `maxEnergy`; the remainder is reported as wasted, never silently
 * dropped.
 */
export class InteractionSystem {
  private readonly emitVerbose: boolean

  constructor(
    private readonly config: WorldConfig,
    private readonly organisms: OrganismStore,
    private readonly resources: ResourceStore,
    private readonly resourceIndex: SpatialHash<ResourceState>,
    private readonly events: EventLog
  ) {
    this.emitVerbose = config.history.eventDetail === 'verbose'
  }

  update(tick: number): void {
    const consumed = new Set<EntityId>()
    const { radius, maxEnergy, juvenileSizeScale, maturityAge, senescenceAge } =
      this.config.organisms
    const resourceRadius = this.config.resources.radius

    for (const organism of this.organisms.values()) {
      const stage = lifeStageFor(organism.age, { maturityAge, senescenceAge })
      const sizeScale = stage === 'juvenile' ? juvenileSizeScale : 1
      const captureRadius = radius * sizeScale + resourceRadius
      const effectiveMaxEnergy = maxEnergy * sizeScale

      const hits = this.resourceIndex.queryRadius({ x: organism.x, y: organism.y }, captureRadius)
      const hit = hits.find((candidate) => !consumed.has(candidate.item.id))
      if (!hit) continue

      const resource = hit.item
      consumed.add(resource.id)
      this.resources.remove(resource.id)

      const amount = resource.remaining
      const capacity = Math.max(0, effectiveMaxEnergy - organism.energy)
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
