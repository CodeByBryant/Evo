import type { EntityId } from './entity'
import type { GenomeId } from './genome'
import type { Vec2 } from './math'
import type { BrainTelemetry } from './learning'
import type { DeathCause } from './world'
import type { LifeStage } from './organism'
import type { HazardSnapshot, MigrationSummary } from './ecology'
import type { SpeciesId } from './species'

export interface OrganismSnapshot {
  readonly id: EntityId
  /** The organism's genome; the full genome is available from `World.genomeOf`. */
  readonly genomeId: GenomeId
  /** Empty for founders. */
  readonly parentIds: readonly EntityId[]
  /** The organism's species, or `null` when species are disabled. */
  readonly speciesId: SpeciesId | null
  readonly position: Readonly<Vec2>
  readonly velocity: Readonly<Vec2>
  readonly heading: number
  readonly radius: number
  readonly age: number
  readonly energy: number
  /** Current health; equals the maximum when health is disabled. */
  readonly health: number
  readonly lifeStage: LifeStage
  readonly reproductionCooldownRemaining: number
}

/** A compact, retained record of an organism after it dies (docs/decisions/0005). */
export interface HistoricalOrganismRecord {
  readonly id: EntityId
  readonly genomeId: GenomeId
  /** Empty for founders. */
  readonly parentIds: readonly EntityId[]
  /** The species the organism belonged to, or `null` when species are disabled. */
  readonly speciesId: SpeciesId | null
  readonly birthTick: number
  readonly deathTick: number
  readonly deathCause: DeathCause
  /** Region movement over the organism's life; `null` when migration tracking is off. */
  readonly migration: MigrationSummary | null
  /** What the organism's brain did over its life; `null` under the reflex controller. */
  readonly brain: BrainTelemetry | null
}

export interface ResourceSnapshot {
  readonly id: EntityId
  readonly position: Readonly<Vec2>
  readonly radius: number
  readonly energyValue: number
  readonly remaining: number
  /** Index into the resource kinds (0 when kinds are off). */
  readonly kind: number
}

export interface PopulationSnapshot {
  readonly active: number
  /** Tick at which the population first reached zero, or `null` if it has not gone extinct. */
  readonly extinctionTick: number | null
}

export interface MetricsSnapshot {
  readonly organismsBorn: number
  readonly deathsByStarvation: number
  readonly deathsByAge: number
  readonly deathsByDamage: number
  readonly resourcesSpawned: number
  readonly resourcesConsumed: number
  readonly reproductionAttempts: number
  readonly reproductionSuccesses: number
  readonly reproductionFailures: number
  readonly energyConsumed: number
  readonly energyWasted: number
  /** Total health lost to hazards and toxins. */
  readonly damageTaken: number
}

/** A read-only, deep-copied view of a world. Presentation layers consume this, never live state. */
export interface WorldSnapshot {
  readonly seed: number
  readonly tick: number
  readonly time: number
  readonly population: PopulationSnapshot
  /** Ascending id order. */
  readonly organisms: readonly OrganismSnapshot[]
  /** Ascending id order. */
  readonly resources: readonly ResourceSnapshot[]
  /** Ascending id order. */
  readonly hazards: readonly HazardSnapshot[]
  readonly metrics: MetricsSnapshot
}
