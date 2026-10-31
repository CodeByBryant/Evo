import type { EntityId, WorldConfig } from '@evo/contracts'
import type { DamageBuffer, IntentBuffer } from '../buffers/types'
import type { EcologyModel } from '../ecology/EcologyModel'
import type { OrganismStore } from '../entities/OrganismStore'
import type { ResourceState, ResourceStore } from '../entities/ResourceStore'
import type { EventLog } from '../events/EventLog'
import { lifeStageFor } from '../organisms/lifeStage'
import { maxEnergyOf } from '../organisms/traits'
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
  private readonly kindsOn: boolean
  /** Query reach: the largest resource radius of any kind. */
  private readonly largestResourceRadius: number

  constructor(
    private readonly config: WorldConfig,
    private readonly organisms: OrganismStore,
    private readonly resources: ResourceStore,
    private readonly resourceIndex: SpatialHash<ResourceState>,
    private readonly events: EventLog,
    /** Absent means every organism interacts (the reflex controller always does). */
    private readonly intents?: IntentBuffer,
    private readonly ecology: EcologyModel | null = null,
    /** Where the toxicity of what was eaten is written for `HealthSystem`. */
    private readonly damage?: DamageBuffer
  ) {
    this.emitVerbose = config.history.eventDetail === 'verbose'
    this.kindsOn = ecology !== null && ecology.kindsOn
    let largest = config.resources.radius
    if (ecology !== null && ecology.kindsOn) {
      largest = 0
      for (let i = 0; i < ecology.kindCount; i++)
        largest = Math.max(largest, ecology.kind(i).radius)
    }
    this.largestResourceRadius = largest
  }

  update(tick: number): void {
    const consumed = new Set<EntityId>()
    const { juvenileSizeScale } = this.config.organisms
    this.damage?.clear()

    for (const organism of this.organisms.values()) {
      if (this.intents && this.intents.get(organism.id)?.interact === false) continue
      const stage = lifeStageFor(organism.age, organism.genome.physical)
      const sizeScale = stage === 'juvenile' ? juvenileSizeScale : 1
      const bodyRadius = organism.genome.physical.radius * sizeScale
      const captureRadius = bodyRadius + this.largestResourceRadius
      const effectiveMaxEnergy = maxEnergyOf(organism.genome, this.config) * sizeScale

      const hits = this.resourceIndex.queryRadius({ x: organism.x, y: organism.y }, captureRadius)
      const hit = hits.find((candidate) => {
        if (consumed.has(candidate.item.id)) return false
        if (!this.kindsOn) return true
        const reach = bodyRadius + (this.ecology as EcologyModel).kind(candidate.item.kind).radius
        return candidate.distanceSquared <= reach * reach
      })
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
        kind: resource.kind,
        amount,
        energyGained,
        energyWasted,
        position: { x: organism.x, y: organism.y }
      })

      if (this.kindsOn && this.damage) {
        const toxicity = (this.ecology as EcologyModel).kind(resource.kind).toxicity
        if (toxicity > 0) this.damage.set(organism.id, toxicity)
      }

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
