import type { EntityId } from './entity'
import type { Vec2 } from './math'
import type { DeathCause } from './world'
import type { LifeStage } from './organism'

export interface OrganismSnapshot {
  readonly id: EntityId
  /** Empty for founders. */
  readonly parentIds: readonly EntityId[]
  readonly position: Readonly<Vec2>
  readonly velocity: Readonly<Vec2>
  readonly heading: number
  readonly radius: number
  readonly age: number
  readonly energy: number
  readonly lifeStage: LifeStage
  readonly reproductionCooldownRemaining: number
}

/** A compact, retained record of an organism after it dies (docs/decisions/0005). */
export interface HistoricalOrganismRecord {
  readonly id: EntityId
  /** Empty for founders. */
  readonly parentIds: readonly EntityId[]
  readonly birthTick: number
  readonly deathTick: number
  readonly deathCause: DeathCause
}

export interface ResourceSnapshot {
  readonly id: EntityId
  readonly position: Readonly<Vec2>
  readonly radius: number
  readonly energyValue: number
  readonly remaining: number
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
  readonly resourcesSpawned: number
  readonly resourcesConsumed: number
  readonly reproductionAttempts: number
  readonly reproductionSuccesses: number
  readonly reproductionFailures: number
  readonly energyConsumed: number
  readonly energyWasted: number
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
  readonly metrics: MetricsSnapshot
}
