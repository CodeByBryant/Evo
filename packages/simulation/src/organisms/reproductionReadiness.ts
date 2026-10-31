import type { WorldConfig } from '@evo/contracts'
import type { EcologyModel } from '../ecology/EcologyModel'
import type { OrganismState } from '../entities/OrganismStore'
import { lifeStageFor } from './lifeStage'
import { reproductionCostOf, reproductionThresholdOf } from './traits'

/**
 * When an organism may reproduce, defined once so that mating (`ReproductionSystem`) and the
 * sensing of eligible partners (`PerceptionSystem`, ADR 0010) can never disagree.
 *
 * Regions and seasons scale the reproduction cost; they divide only the cost, so the threshold can
 * never exceed what the cost allows and reproduction stays possible (docs/ecology/ecology.md).
 * With neither on, these are exactly `reproductionCostOf` and `reproductionThresholdOf`.
 */
export class ReproductionReadiness {
  /** Whether regions or seasons scale the reproduction threshold and cost. */
  private readonly terrainScales: boolean

  constructor(
    private readonly config: WorldConfig,
    private readonly ecology: EcologyModel | null
  ) {
    this.terrainScales = ecology !== null && (ecology.regionsOn || ecology.seasonsOn)
  }

  /** Energy this organism pays for a successful reproduction here and now. */
  costFor(organism: OrganismState, tick: number): number {
    const base = reproductionCostOf(organism.genome, this.config)
    return this.terrainScales
      ? base / (this.ecology as EcologyModel).reproductionScale(organism.x, organism.y, tick)
      : base
  }

  /**
   * Energy this organism needs to attempt reproduction here and now: its own `minEnergy` gene, but
   * never less than the cost it would pay here.
   */
  thresholdFor(organism: OrganismState, tick: number): number {
    if (!this.terrainScales) return reproductionThresholdOf(organism.genome, this.config)
    return Math.max(organism.genome.reproduction.minEnergy, this.costFor(organism, tick))
  }

  /** Mature, off cooldown and holding at least the threshold: able to attempt (or to be a partner). */
  isReady(organism: OrganismState, tick: number): boolean {
    return (
      lifeStageFor(organism.age, organism.genome.physical) !== 'juvenile' &&
      organism.reproductionCooldownRemaining <= 0 &&
      organism.energy >= this.thresholdFor(organism, tick)
    )
  }
}
