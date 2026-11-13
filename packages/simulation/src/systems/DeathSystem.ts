import type { AgeingConfig, DeathCause, EntityId } from '@evo/contracts'
import type { LastBitten } from '../buffers/types'
import type { OrganismState, OrganismStore } from '../entities/OrganismStore'
import type { EventLog } from '../events/EventLog'
import type { HistoryStore } from '../history/HistoryStore'
import type { LineageStore } from '../lineage/LineageStore'
import { senescenceOf } from '../organisms/ageing'
import type { RandomSource } from '../random/RandomSource'
import { NO_MIGRATION } from '../ecology/MigrationTracker'
import type { MigrationRecorder } from '../ecology/MigrationTracker'
import { NO_SPECIES } from '../species/SpeciesRegistry'
import type { SpeciesTracker } from '../species/SpeciesRegistry'

/**
 * Removes organisms that starved (`energy <= 0`) or died of old age (`age >=` its own `maxAge` gene), in
 * ascending id order. This is the only place organisms leave the active store; extinction is
 * never hidden or silently reversed (docs/simulation/update-order.md, stage 10). Owns the whole
 * "an organism died" transaction: removal, the lineage mark, the historical record, and the event, all in the same
 * loop iteration (docs/decisions/0005).
 */
export class DeathSystem {
  constructor(
    private readonly organisms: OrganismStore,
    private readonly events: EventLog,
    private readonly history: HistoryStore,
    private readonly lineage: LineageStore,
    private readonly species: SpeciesTracker = NO_SPECIES,
    private readonly migration: MigrationRecorder = NO_MIGRATION,
    /** Present only with `predation.enabled` (ADR 0023): who bit whom, and for how many ticks a bite counts. */
    private readonly predation?: { readonly lastBitten: LastBitten; readonly windowTicks: number },
    /** Called for each creature that dies, after it has been removed (carcasses are left from here). */
    private readonly onDied?: (organism: OrganismState, cause: DeathCause, tick: number) => void,
    /** Present only with `ageing.enabled` (ADR 0027): death of old age is a chance, not a cutoff. */
    private readonly ageing?: {
      readonly config: AgeingConfig
      readonly timestep: number
      readonly random: RandomSource
    }
  ) {}

  update(tick: number): void {
    const bitten = this.predation?.lastBitten
    if (bitten !== undefined) {
      // A bite older than the window no longer explains a death.
      const window = (this.predation as { windowTicks: number }).windowTicks
      for (const [id, bite] of bitten) if (tick - bite.tick > window) bitten.delete(id)
    }
    for (const organism of this.organisms.values()) {
      let cause: DeathCause | null = null
      if (organism.energy <= 0) {
        cause = 'starvation'
      } else if (organism.health <= 0) {
        cause = 'damage'
      } else if (this.ageing === undefined) {
        if (organism.age >= organism.genome.physical.maxAge) cause = 'age'
      } else {
        // Ageing (ADR 0027): no cutoff at `maxAge`; the chance of dying rises with how far past
        // `senescenceAge` the creature is, one draw a tick for each old creature, and death is certain
        // at `ceiling` times `maxAge`.
        const { config, timestep, random } = this.ageing
        const s = senescenceOf(organism.age, organism.genome.physical)
        if (organism.age >= organism.genome.physical.maxAge * config.ceiling) {
          cause = 'age'
        } else if (s > 0 && random.float() < config.hazard * s * timestep) {
          cause = 'age'
        }
      }
      if (cause === null) continue
      // A creature that was bitten a moment ago and then starved or was worn down was killed by the
      // bite, not by hunger or the weather: the victim's energy is exactly what the predator took.
      let killerId: EntityId | null = null
      if ((cause === 'starvation' || cause === 'damage') && bitten !== undefined) {
        const bite = bitten.get(organism.id)
        if (bite !== undefined) {
          cause = 'predation'
          killerId = bite.attackerId
        }
      }
      bitten?.delete(organism.id)

      this.organisms.remove(organism.id)
      this.lineage.markDeath(organism.id)
      const speciesId = this.species.speciesOf(organism.id) ?? null
      this.species.release(organism.id, tick)
      this.history.append({
        id: organism.id,
        genomeId: organism.genome.id,
        parentIds: organism.parentIds,
        speciesId,
        birthTick: organism.birthTick,
        deathTick: tick,
        deathCause: cause,
        ...(killerId !== null ? { killedBy: killerId } : {}),
        migration: this.migration.finish(organism.id),
        brain: organism.brain
          ? {
              rewardTotal: organism.brain.rewardTotal,
              updates: organism.brain.updates,
              weightChange: organism.brain.weightChange
            }
          : null
      })
      this.events.record({
        type: 'organism-died',
        tick,
        organismId: organism.id,
        cause,
        ...(killerId !== null ? { killerId } : {}),
        position: { x: organism.x, y: organism.y }
      })
      this.onDied?.(organism, cause, tick)
    }
  }
}
