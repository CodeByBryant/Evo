import type { EntityId, WorldConfig } from '@evo/contracts'
import type { DamageBuffer, IntentBuffer } from '../buffers/types'
import type { EcologyModel, KindProperties } from '../ecology/EcologyModel'
import type { OrganismStore } from '../entities/OrganismStore'
import { HUB_SLOT } from '../entities/ResourceStore'
import type { ResourceState, ResourceStore } from '../entities/ResourceStore'
import type { EventLog } from '../events/EventLog'
import { lifeStageFor } from '../organisms/lifeStage'
import { factorsOf } from '../organisms/bodyFactors'
import { cos, sin } from '../math/trig'
import { mouthsOf } from '../organisms/mouths'
import { bodyRadiusOf, gutCapacityOf, maxEnergyOf } from '../organisms/traits'
import type { SpatialHash } from '../spatial/SpatialHash'

/** Below this a gut counts as full and a resource as finished. */
const EPSILON = 1e-9

/** A bite needs room in the gut for at least this share of its size. */
const MIN_BITE_FRACTION = 0.5

/**
 * Feeds organisms. With `feeding.enabled` (the default) they bite (ADR 0017): a working mouth must
 * be within reach of food, the food must lie in the cone in front of it, the organism must intend
 * to interact and its bite must be off cooldown. A bite takes a chunk of the food's energy, which
 * stays on the ground until its last bite, and puts it in the gut; `DigestionSystem` turns the gut
 * into energy. Touching food with a flank, or with a full gut, eats nothing.
 *
 * With `feeding.enabled: false` the original behavior runs, unchanged: each organism eats the
 * nearest not-yet-consumed resource within its capture
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
    if (this.config.feeding.enabled) this.updateBites(tick)
    else this.updateInstant(tick)
  }

  private updateBites(tick: number): void {
    const { biteRadius, biteSize, biteInterval } = this.config.feeding
    const dt = this.config.timestep
    const { juvenileSizeScale } = this.config.organisms
    const cosCone = cos(this.config.feeding.biteCone)
    this.damage?.clear()

    for (const organism of this.organisms.values()) {
      organism.biteCooldown = Math.max(0, organism.biteCooldown - dt)
      if (this.intents && this.intents.get(organism.id)?.interact === false) continue
      if (organism.biteCooldown > 0) continue
      const body = factorsOf(organism.genome, this.config)
      if (!body.hasMouth) continue
      const stage = lifeStageFor(organism.age, organism.genome.physical)
      const sizeScale = stage === 'juvenile' ? juvenileSizeScale : 1
      const room = gutCapacityOf(organism.genome, this.config) * sizeScale - organism.gut
      if (room <= EPSILON) continue

      const bodyRadius = bodyRadiusOf(organism.genome, this.config) * sizeScale
      const reach = biteRadius * bodyRadius * body.reach
      const heading = organism.heading
      const c = cos(heading)
      const s = sin(heading)

      for (const mouth of mouthsOf(organism.genome, this.config)) {
        // The mouth in the world: the body-frame point turned by the heading.
        const mx = (mouth.x * c - mouth.y * s) * bodyRadius
        const my = (mouth.x * s + mouth.y * c) * bodyRadius
        const hit = this.resourceIndex.nearestWhere(
          { x: organism.x + mx, y: organism.y + my },
          reach + this.largestResourceRadius,
          (resource, distanceSquared) => {
            if (!this.resources.has(resource.id) || resource.remaining <= EPSILON) return false
            const limit = reach + this.kindOf(resource.kind).radius
            if (distanceSquared > limit * limit) return false
            // Only food in front of the mouth: inside the cone around the way the mouth points.
            const fx = resource.x - organism.x
            const fy = resource.y - organism.y
            const food = fx * fx + fy * fy
            const mouthLength = mx * mx + my * my
            if (food > 0 && mouthLength > 0) {
              if (fx * mx + fy * my < cosCone * Math.sqrt(food * mouthLength)) return false
            }
            return true
          }
        )
        if (!hit) continue

        const resource = hit.item
        const kind = this.kindOf(resource.kind)
        const yieldPerChunk = body.dietEfficiency[resource.kind] ?? 1
        // A plant's hub is tougher than its nodes (ADR 0021); free food and nodes are the kind's own.
        const hardness =
          resource.slot === HUB_SLOT
            ? kind.hardness * this.config.resources.plants.hubHardness
            : kind.hardness
        const wanted = Math.min(resource.remaining, (biteSize * body.biteSize) / hardness)
        // A gut with no real room for a bite is full: no dribbling of crumbs into it.
        if (room / yieldPerChunk < MIN_BITE_FRACTION * wanted) break
        const chunk = Math.min(wanted, room / yieldPerChunk)
        if (chunk <= EPSILON) break
        resource.remaining = resource.remaining - chunk <= EPSILON ? 0 : resource.remaining - chunk
        const intake = chunk * yieldPerChunk
        organism.gut = Math.min(organism.gut + intake, room + organism.gut)
        organism.biteCooldown = biteInterval / body.biteRate

        this.events.record({
          type: 'resource-bitten',
          tick,
          organismId: organism.id,
          resourceId: resource.id,
          kind: resource.kind,
          chunk,
          intake,
          remaining: resource.remaining,
          position: { x: organism.x, y: organism.y }
        })
        if (resource.remaining === 0) {
          this.resources.remove(resource.id)
          // The energy was already counted when it was bitten, so the finish carries none.
          this.events.record({
            type: 'resource-consumed',
            tick,
            organismId: organism.id,
            resourceId: resource.id,
            kind: resource.kind,
            amount: chunk,
            energyGained: 0,
            energyWasted: 0,
            position: { x: organism.x, y: organism.y }
          })
        }
        if (this.damage && kind.toxicity > 0) {
          // A whole toxic item still adds up to its old damage, spread over its bites.
          this.damage.set(organism.id, kind.toxicity * (chunk / kind.energy) * body.toxinDamage)
        }
        break
      }
    }
  }

  /** The kind a resource is, with the baseline applied (one plain kind when kinds are off). */
  private kindOf(index: number): KindProperties {
    if (this.ecology !== null) return this.ecology.kind(index)
    const { energyValue, radius } = this.config.resources
    return {
      name: 'food',
      energy: energyValue,
      radius,
      spawnWeight: 1,
      detectability: 1,
      toxicity: 0,
      hardness: 1,
      regions: []
    }
  }

  private updateInstant(tick: number): void {
    const consumed = new Set<EntityId>()
    const { juvenileSizeScale } = this.config.organisms
    this.damage?.clear()

    for (const organism of this.organisms.values()) {
      if (this.intents && this.intents.get(organism.id)?.interact === false) continue
      const stage = lifeStageFor(organism.age, organism.genome.physical)
      const sizeScale = stage === 'juvenile' ? juvenileSizeScale : 1
      const body = factorsOf(organism.genome, this.config)
      // Mouths extend how far from its body an organism can eat.
      const bodyRadius = bodyRadiusOf(organism.genome, this.config) * sizeScale * body.reach
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
      // Intestines extract more (or less) from the same food.
      const usable = amount * body.digestion
      const energyGained = Math.min(usable, capacity)
      const energyWasted = usable - energyGained
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
        if (toxicity > 0) this.damage.set(organism.id, toxicity * body.toxinDamage)
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
