import type { WorldConfig } from '@evo/contracts'
import type { EggStore } from '../entities/EggStore'
import type { IdGenerator } from '../entities/IdGenerator'
import type { OrganismState, OrganismStore } from '../entities/OrganismStore'
import type { EventLog } from '../events/EventLog'
import { architectureOf } from '../genetics/GenomeFactory'
import { brainLayoutOf } from '../learning/BrainLayout'
import type { BrainLayout } from '../learning/BrainLayout'
import { createBrainState } from '../learning/BrainState'
import type { LineageStore } from '../lineage/LineageStore'
import { TWO_PI, wrapAngle } from '../math/scalar'
import { guardsOf } from '../organisms/eggs'
import { maxHealthOf } from '../organisms/traits'
import type { SeededRandom } from '../random/SeededRandom'
import type { SpeciesTracker } from '../species/SpeciesRegistry'

/**
 * The life cycle between conception and a living creature (ADR 0027): a carrying female lays her
 * egg when the clutch is due, and an egg hatches into a creature `hatch` seconds after it was laid.
 * Runs right after `ReproductionSystem` (which conceives) in the reproduction stage, only with
 * `reproduction.eggs.enabled`.
 *
 * Laying goes in ascending mother id and hatching in ascending egg id, so the shared id counter
 * stays in creation order. Nothing here draws a random number except the newborn's heading and
 * sex (the same two draws an instant birth makes after its position jitter).
 */
export class EggSystem {
  private readonly layout: BrainLayout

  constructor(
    private readonly config: WorldConfig,
    private readonly organisms: OrganismStore,
    private readonly eggs: EggStore,
    private readonly ids: IdGenerator,
    private readonly lineage: LineageStore,
    private readonly random: SeededRandom,
    private readonly events: EventLog,
    private readonly species: SpeciesTracker
  ) {
    this.layout = brainLayoutOf(architectureOf(config.genetics.brain))
  }

  update(tick: number): void {
    const hatchTicks = Math.max(
      1,
      Math.ceil(this.config.reproduction.eggs.hatch / this.config.timestep)
    )

    // Lay every clutch that is due, in ascending mother id.
    for (const mother of this.organisms.values()) {
      const pregnancy = mother.pregnancy
      if (pregnancy === null || pregnancy.layTick > tick) continue
      const eggId = this.ids.allocate()
      this.eggs.add({
        id: eggId,
        x: mother.x,
        y: mother.y,
        genome: pregnancy.genome,
        motherId: mother.id,
        fatherId: pregnancy.fatherId,
        speciesId: pregnancy.speciesId,
        energy: pregnancy.energy,
        layTick: tick,
        hatchTick: tick + hatchTicks
      })
      mother.pregnancy = null
      this.events.record({
        type: 'egg-laid',
        tick,
        eggId,
        motherId: mother.id,
        fatherId: pregnancy.fatherId,
        position: { x: mother.x, y: mother.y }
      })
    }

    // Guarding costs energy: every parent beside an egg pays `guardCost` a second for it (ADR 0027).
    const { guardRadius, guardCost } = this.config.reproduction.eggs
    if (guardCost > 0) {
      const toll = guardCost * this.config.timestep
      for (const egg of this.eggs.values()) {
        for (const guard of guardsOf(egg, this.organisms, guardRadius)) guard.energy -= toll
      }
    }

    // Hatch every egg that is ready, in ascending egg id.
    for (const egg of this.eggs.values()) {
      if (egg.hatchTick > tick) continue
      this.eggs.remove(egg.id)
      const organismId = this.ids.allocate()
      const genome = egg.genome
      const heading = wrapAngle(this.random.float() * TWO_PI)
      const sex: 0 | 1 = this.random.float() < 0.5 ? 0 : 1
      const child: OrganismState = {
        id: organismId,
        parentIds: [egg.motherId, egg.fatherId],
        genome,
        x: egg.x,
        y: egg.y,
        vx: 0,
        vy: 0,
        heading,
        age: 0,
        energy: egg.energy,
        health: maxHealthOf(genome, this.config),
        birthTick: tick,
        reproductionCooldownRemaining: 0,
        lastTurnMagnitude: 0,
        gut: 0,
        biteCooldown: 0,
        brain:
          this.config.learning.controller === 'brain'
            ? createBrainState(genome, this.layout, egg.energy)
            : null,
        sex,
        pregnancy: null
      }
      this.organisms.add(child)
      this.lineage.register({
        genomeId: genome.id,
        parentGenomeIds: genome.parentIds,
        organismId,
        tick
      })
      const speciesId = this.species.assign({
        organismId,
        genome,
        parentOrganismId: egg.motherId,
        parentSpeciesId: egg.speciesId,
        tick
      })
      this.events.record({
        type: 'egg-hatched',
        tick,
        eggId: egg.id,
        organismId,
        motherId: egg.motherId,
        fatherId: egg.fatherId
      })
      this.events.record({
        type: 'organism-born',
        tick,
        organismId,
        genomeId: genome.id,
        parentIds: [egg.motherId, egg.fatherId],
        speciesId,
        position: { x: egg.x, y: egg.y }
      })
    }
  }
}
