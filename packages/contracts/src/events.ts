import type { EntityId } from './entity'
import type { GenomeId } from './genome'
import type { DeathCause } from './world'
import type { Vec2 } from './math'
import type { HazardKind, Season } from './ecology'
import type { SpeciesId } from './species'

interface BaseEvent {
  /** Tick at which the event occurred (initial population events use tick 0). */
  readonly tick: number
}

export interface OrganismBornEvent extends BaseEvent {
  readonly type: 'organism-born'
  readonly organismId: EntityId
  readonly genomeId: GenomeId
  /** Empty for founders. */
  readonly parentIds: readonly EntityId[]
  /** The species the organism was assigned to, or `null` when species are disabled. */
  readonly speciesId: SpeciesId | null
  readonly position: Readonly<Vec2>
}

export interface OrganismDiedEvent extends BaseEvent {
  readonly type: 'organism-died'
  readonly organismId: EntityId
  readonly cause: DeathCause
  readonly position: Readonly<Vec2>
}

export interface ResourceSpawnedEvent extends BaseEvent {
  readonly type: 'resource-spawned'
  readonly resourceId: EntityId
  /** Index into the resource kinds (0 when kinds are off). */
  readonly kind: number
  readonly position: Readonly<Vec2>
}

export interface ResourceConsumedEvent extends BaseEvent {
  readonly type: 'resource-consumed'
  readonly organismId: EntityId
  readonly resourceId: EntityId
  readonly kind: number
  /** Energy taken from the resource; `energyGained + energyWasted`. */
  readonly amount: number
  readonly energyGained: number
  /** Energy that did not fit under the organism's capacity. */
  readonly energyWasted: number
  readonly position: Readonly<Vec2>
}

/** Verbose detail level only. */
export interface OrganismMovedEvent extends BaseEvent {
  readonly type: 'organism-moved'
  readonly organismId: EntityId
  readonly from: Readonly<Vec2>
  readonly to: Readonly<Vec2>
}

/** Verbose detail level only. */
export interface EnergyChangedEvent extends BaseEvent {
  readonly type: 'energy-changed'
  readonly organismId: EntityId
  readonly previous: number
  readonly current: number
  readonly reason: 'consumption' | 'metabolism'
}

/**
 * Only organisms that clear the maturity/cooldown/energy gates count as "attempting" - an
 * organism that's simply immature never generates one of these, the same way an organism that
 * finds no food never generates a failed `resource-consumed` (docs/decisions/0005).
 */
export type ReproductionFailureReason = 'no-partner' | 'population-cap'

/** Essential tier: not gated by `history.eventDetail`. Emitted starting in Phase 3. */
export interface ReproductionAttemptedEvent extends BaseEvent {
  readonly type: 'reproduction-attempted'
  readonly organismId: EntityId
  readonly partnerId: EntityId | null
  /** Set when `succeeded` is `true`. */
  readonly childId: EntityId | null
  readonly succeeded: boolean
  /** Set when `succeeded` is `false`. */
  readonly failureReason: ReproductionFailureReason | null
}

/** Health lost in one tick (one event per damaged organism per tick). */
export interface OrganismDamagedEvent extends BaseEvent {
  readonly type: 'organism-damaged'
  readonly organismId: EntityId
  /** Health lost this tick. */
  readonly amount: number
  readonly source: DamageSource
  readonly healthAfter: number
  readonly position: Readonly<Vec2>
}

export type DamageSource = 'hazard' | 'toxin' | 'both'

/** A new season began. */
export interface SeasonChangedEvent extends BaseEvent {
  readonly type: 'season-changed'
  readonly season: Season
}

export interface HazardSpawnedEvent extends BaseEvent {
  readonly type: 'hazard-spawned'
  readonly hazardId: number
  readonly kind: HazardKind
  readonly position: Readonly<Vec2>
  readonly radius: number
}

export interface HazardExpiredEvent extends BaseEvent {
  readonly type: 'hazard-expired'
  readonly hazardId: number
  readonly kind: HazardKind
}

export type WorldEvent =
  | OrganismBornEvent
  | OrganismDiedEvent
  | ResourceSpawnedEvent
  | ResourceConsumedEvent
  | OrganismMovedEvent
  | EnergyChangedEvent
  | ReproductionAttemptedEvent
  | OrganismDamagedEvent
  | SeasonChangedEvent
  | HazardSpawnedEvent
  | HazardExpiredEvent

export type WorldEventType = WorldEvent['type']
