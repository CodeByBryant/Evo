import type { WorldConfig } from '@evo/contracts'
import type { DamageBuffer, PredationBuffer, RegenBuffer } from '../buffers/types'
import type { EcologyModel } from '../ecology/EcologyModel'
import type { HazardStore } from '../ecology/HazardStore'
import type { OrganismStore } from '../entities/OrganismStore'
import type { EventLog } from '../events/EventLog'
import { factorsOf } from '../organisms/bodyFactors'
import { maxEnergyOf, maxHealthOf } from '../organisms/traits'

/**
 * Owns every organism's `health` (docs/ecology/ecology.md, "Health and damage"). Runs after
 * interaction and before metabolism. In ascending id order it:
 *
 * 1. sums the damage from every hazard circle the organism stands in
 *    (`damagePerSecond * regionExposure * seasonIntensity * dt`), the toxin of what it just ate and
 *    the bites it took (already reduced by its armor, ADR 0023), and, if there is any, lowers health and records one `organism-damaged` event;
 * 2. otherwise, if it is hurt and holds at least `regenMinEnergyFraction` of its capacity, heals up
 *    to `regenRate * dt` and writes the energy that costs to the regen buffer, which metabolism
 *    charges (energy stays owned by metabolism).
 *
 * Death at zero health is `DeathSystem`'s job. With health disabled this does nothing and health
 * stays at its maximum.
 */
export class HealthSystem {
  constructor(
    private readonly config: WorldConfig,
    private readonly organisms: OrganismStore,
    private readonly hazards: HazardStore,
    private readonly toxins: DamageBuffer,
    private readonly regen: RegenBuffer,
    private readonly events: EventLog,
    private readonly ecology: EcologyModel,
    /** Present only with `predation.enabled`: the damage bites dealt this tick (ADR 0023). */
    private readonly bites?: PredationBuffer
  ) {}

  update(tick: number): void {
    this.regen.clear()
    if (!this.ecology.healthOn) return
    const dt = this.config.timestep
    const settings = this.config.ecology.health
    const zones = this.ecology.hazardsOn ? this.hazards.values() : []
    const intensity = this.ecology.hazardIntensity(tick)

    for (const organism of this.organisms.values()) {
      const body = factorsOf(organism.genome, this.config)
      let fromHazards = 0
      if (zones.length > 0) {
        const exposure = this.ecology.hazardExposure(organism.x, organism.y)
        for (const zone of zones) {
          const dx = zone.x - organism.x
          const dy = zone.y - organism.y
          if (dx * dx + dy * dy <= zone.radius * zone.radius) {
            fromHazards += zone.damagePerSecond * exposure * intensity * dt * body.damageTaken
          }
        }
      }
      const fromToxin = this.toxins.get(organism.id) ?? 0
      const bite = this.bites?.get(organism.id)
      const fromBites = bite?.damage ?? 0
      const damage = fromHazards + fromToxin + fromBites

      if (damage > 0) {
        const lost = Math.min(damage, organism.health)
        organism.health -= lost
        this.events.record({
          type: 'organism-damaged',
          tick,
          organismId: organism.id,
          amount: lost,
          source:
            (fromHazards > 0 ? 1 : 0) + (fromToxin > 0 ? 1 : 0) + (fromBites > 0 ? 1 : 0) > 1
              ? 'both'
              : fromBites > 0
                ? 'bite'
                : fromToxin > 0
                  ? 'toxin'
                  : 'hazard',
          ...(bite !== undefined && fromBites > 0 ? { attackerId: bite.attackerId } : {}),
          healthAfter: organism.health,
          position: { x: organism.x, y: organism.y }
        })
        continue
      }

      const maxHealth = maxHealthOf(organism.genome, this.config)
      if (
        organism.health < maxHealth &&
        organism.energy >=
          settings.regenMinEnergyFraction * maxEnergyOf(organism.genome, this.config)
      ) {
        const healed = Math.min(
          settings.regenRate * dt * body.regeneration,
          maxHealth - organism.health
        )
        if (healed > 0) {
          organism.health += healed
          this.regen.set(organism.id, healed * settings.regenEnergyCost)
        }
      }
    }
  }
}
