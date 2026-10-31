import type { WorldConfig } from '@evo/contracts'
import type { RegenBuffer } from '../buffers/types'
import type { EcologyModel } from '../ecology/EcologyModel'
import type { OrganismStore } from '../entities/OrganismStore'
import type { EventLog } from '../events/EventLog'
import { lifeStageFor } from '../organisms/lifeStage'
import { basalCostOf, learningCostOf, sensorCostOf } from '../organisms/traits'

/**
 * Charges the explicit, tested metabolic cost
 * `(basalCost + movementCost*speed^2 + turningCost*lastTurnMagnitude^2 + sensorCost + learningCost) *
 * juvenileMetabolicScale (if juvenile, else 1)` (per second of simulated time) and ages every
 * organism. Never clamps energy at zero: `DeathSystem`, which runs immediately afterward, is the
 * sole owner of removing organisms.
 */
export class MetabolismSystem {
  private readonly emitVerbose: boolean

  constructor(
    private readonly config: WorldConfig,
    private readonly organisms: OrganismStore,
    private readonly events: EventLog,
    private readonly ecology: EcologyModel | null = null,
    private readonly regen?: RegenBuffer
  ) {
    this.emitVerbose = config.history.eventDetail === 'verbose'
  }

  update(tick: number): void {
    const dt = this.config.timestep
    const { juvenileMetabolicScale } = this.config.organisms

    for (const organism of this.organisms.values()) {
      const speedSquared = organism.vx * organism.vx + organism.vy * organism.vy
      const turnSquared = organism.lastTurnMagnitude * organism.lastTurnMagnitude
      const genome = organism.genome
      const stage = lifeStageFor(organism.age, genome.physical)
      const scale = stage === 'juvenile' ? juvenileMetabolicScale : 1
      const cost =
        (basalCostOf(genome, this.config) +
          genome.metabolic.movementCost * speedSquared +
          genome.metabolic.turningCost * turnSquared +
          sensorCostOf(genome, this.config) +
          learningCostOf(genome, this.config) +
          (this.ecology === null
            ? 0
            : this.ecology.environmentalCost(organism.x, organism.y, tick))) *
        scale *
        dt
      const previous = organism.energy
      const healing = this.regen?.get(organism.id) ?? 0
      organism.energy = healing > 0 ? previous - cost - healing : previous - cost
      organism.age = organism.age + dt

      if (this.emitVerbose) {
        this.events.record({
          type: 'energy-changed',
          tick,
          organismId: organism.id,
          previous,
          current: organism.energy,
          reason: 'metabolism'
        })
      }
    }
  }
}
