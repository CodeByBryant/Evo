import type { WorldConfig } from '@evo/contracts'
import type { OrganismStore } from '../entities/OrganismStore'
import type { EventLog } from '../events/EventLog'
import { factorsOf } from '../organisms/bodyFactors'
import { lifeStageFor } from '../organisms/lifeStage'
import { maxEnergyOf } from '../organisms/traits'

/**
 * Turns what organisms have bitten into energy (ADR 0017). Each tick every gut gives up at most
 * `feeding.absorption * absorption factor * dt` energy, and no more than the body has room for, so
 * a full body stops absorbing and the food waits in the gut, which in turn stops it biting. Runs
 * after `InteractionSystem` and before metabolism. Does nothing when feeding is off.
 */
export class DigestionSystem {
  private readonly emitVerbose: boolean

  constructor(
    private readonly config: WorldConfig,
    private readonly organisms: OrganismStore,
    private readonly events: EventLog
  ) {
    this.emitVerbose = config.history.eventDetail === 'verbose'
  }

  update(tick: number): void {
    if (!this.config.feeding.enabled) return
    const dt = this.config.timestep
    const { juvenileSizeScale } = this.config.organisms

    for (const organism of this.organisms.values()) {
      if (organism.gut <= 0) continue
      const body = factorsOf(organism.genome, this.config)
      const stage = lifeStageFor(organism.age, organism.genome.physical)
      const sizeScale = stage === 'juvenile' ? juvenileSizeScale : 1
      const room = Math.max(
        0,
        maxEnergyOf(organism.genome, this.config) * sizeScale - organism.energy
      )
      const rate = this.config.feeding.absorption * body.absorption * dt
      const moved = Math.min(organism.gut, rate, room)
      if (moved <= 0) continue
      const previous = organism.energy
      organism.gut = organism.gut - moved
      organism.energy = previous + moved
      if (this.emitVerbose) {
        this.events.record({
          type: 'energy-changed',
          tick,
          organismId: organism.id,
          previous,
          current: organism.energy,
          reason: 'digestion'
        })
      }
    }
  }
}
