import type { EntityId } from './entity'
import type { Vec2 } from './math'

export interface OrganismSnapshot {
  readonly id: EntityId
  readonly position: Readonly<Vec2>
  readonly velocity: Readonly<Vec2>
  readonly heading: number
  readonly radius: number
  readonly age: number
  readonly energy: number
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
